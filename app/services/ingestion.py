import os
import sys
import traceback
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyMuPDFLoader, Docx2txtLoader, TextLoader

from app.config import settings
from app.models.database import Document, Chunk
from app.services.indexing import faiss_manager, bm25_manager

# Lazy load sentence transformer to save startup time
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        print(f"Loading embedding model: {settings.EMBEDDING_MODEL_NAME}...")
        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
        print("Embedding model loaded.")
    return _embedding_model


async def rebuild_bm25_from_db(db_session: AsyncSession):
    """Queries all chunks from database and rebuilds the BM25 index."""
    try:
        result = await db_session.execute(select(Chunk.id, Chunk.text))
        rows = result.all()
        chunks = [{"id": row[0], "text": row[1]} for row in rows]
        bm25_manager.build_index(chunks)
        print(f"BM25 Index rebuilt with {len(chunks)} chunks.")
    except Exception as e:
        print(f"Error rebuilding BM25 Index: {e}")


async def process_document_pipeline(document_id: str, file_path: str, file_type: str, db_session_factory):
    """
    Asynchronous background pipeline for document ingestion.
    Runs text extraction, chunking, embedding generation, SQLite storing, FAISS registration, and BM25 rebuild.
    """
    print(f"Starting ingestion pipeline for document {document_id} ({file_path})")
    
    # Initialize async session
    async with db_session_factory() as session:
        # Fetch document
        result = await session.execute(select(Document).where(Document.id == document_id))
        doc = result.scalar_one_or_none()
        if not doc:
            print(f"Document {document_id} not found in database.")
            return

        try:
            # 1. Load document text
            if file_type == "pdf":
                loader = PyMuPDFLoader(file_path)
                pages = loader.load()
            elif file_type == "docx":
                loader = Docx2txtLoader(file_path)
                pages = loader.load()
            elif file_type == "txt":
                loader = TextLoader(file_path, encoding="utf-8")
                pages = loader.load()
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            if not pages:
                raise ValueError("No text could be extracted from the document.")

            print(f"Loaded {len(pages)} page/doc elements from {file_path}")

            # 2. Chunking
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.CHUNK_SIZE,
                chunk_overlap=settings.CHUNK_OVERLAP
            )

            raw_chunks = []
            chunk_index = 0

            for page_idx, page in enumerate(pages):
                # Page numbers: PDF uses "page" metadata (0-indexed). Other types default to page 1.
                page_num = page.metadata.get("page", page_idx) + 1
                
                # Split text for this page
                text_splits = splitter.split_text(page.page_content)
                for text in text_splits:
                    text_stripped = text.strip()
                    if not text_stripped:
                        continue
                    
                    word_count = len(text_stripped.split())
                    raw_chunks.append({
                        "chunk_index": chunk_index,
                        "page_number": page_num,
                        "text": text_stripped,
                        "word_count": word_count
                    })
                    chunk_index += 1

            if not raw_chunks:
                raise ValueError("Document was empty or generated no text chunks after parsing.")

            print(f"Generated {len(raw_chunks)} text chunks.")

            # 3. Embedding generation
            model = get_embedding_model()
            texts = [c["text"] for c in raw_chunks]
            
            # Encode vectors
            embeddings = model.encode(texts, show_progress_bar=False)
            print(f"Generated embeddings for {len(embeddings)} chunks.")

            # 4. Save chunks to Database
            db_chunks = []
            for idx, c in enumerate(raw_chunks):
                db_chunk = Chunk(
                    document_id=document_id,
                    chunk_index=c["chunk_index"],
                    page_number=c["page_number"],
                    text=c["text"],
                    word_count=c["word_count"]
                )
                session.add(db_chunk)
                db_chunks.append(db_chunk)

            # Flush to get IDs
            await session.commit()
            
            # 5. Add embeddings to FAISS
            chunk_ids = [chunk.id for chunk in db_chunks]
            faiss_manager.add_vectors(embeddings, chunk_ids)
            print(f"FAISS index updated with {len(chunk_ids)} vectors.")

            # 6. Rebuild BM25 index
            await rebuild_bm25_from_db(session)

            # 7. Update document status
            doc.status = "completed"
            await session.commit()
            print(f"Ingestion pipeline completed successfully for document {document_id}.")

        except Exception as e:
            traceback.print_exc()
            await session.rollback()
            # Update status to failed
            doc.status = "failed"
            doc.error_message = str(e)
            await session.commit()
            print(f"Ingestion pipeline failed for document {document_id}. Error: {e}")
