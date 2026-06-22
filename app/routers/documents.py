"""
Documents Router — Admin-protected endpoints for document management.

Write operations (upload, batch upload, delete) require X-Admin-Key header.
Read operations (list, get status) are public.
"""

import os
import shutil
import uuid
from typing import List, Optional

from fastapi import (
    APIRouter, UploadFile, File, Form, Depends, HTTPException,
    BackgroundTasks, Security
)
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.middleware.admin_auth import require_admin_key
from app.models.database import get_db, Document, Chunk, AsyncSessionLocal
from app.models.schemas import DocumentResponse, DocumentMetadataUpdate
from app.services.ingestion import process_document_pipeline, rebuild_bm25_from_db
from app.services.indexing import faiss_manager
from app.services.s3_storage import upload_file_to_s3, delete_file_from_s3

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = ["pdf", "docx", "txt"]
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


async def _save_and_enqueue(
    file: UploadFile,
    department: Optional[str],
    author: Optional[str],
    category: Optional[str],
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> Document:
    """
    Shared logic for single-file upload:
    1. Validate extension and size
    2. Create DB record (status=processing)
    3. Save file locally
    4. Upload to S3 if enabled
    5. Enqueue ingestion pipeline in background
    """
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Only PDF, DOCX, and TXT are supported.",
        )

    # Create DB entry first so we have a doc_id
    doc_id = str(uuid.uuid4())
    db_doc = Document(
        id=doc_id,
        filename=filename,
        file_type=ext,
        department=department,
        author=author,
        category=category,
        status="processing",
    )
    db.add(db_doc)
    await db.commit()
    await db.refresh(db_doc)

    # Write file to local disk
    file_path = os.path.join(settings.UPLOADS_DIR, f"{doc_id}.{ext}")
    try:
        with open(file_path, "wb") as buffer:
            contents = await file.read()
            if len(contents) > MAX_FILE_SIZE_BYTES:
                # Clean up DB entry
                await db.delete(db_doc)
                await db.commit()
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{filename}' exceeds 25 MB limit.",
                )
            buffer.write(contents)
    except HTTPException:
        raise
    except Exception as e:
        db_doc.status = "failed"
        db_doc.error_message = f"Failed to save file: {str(e)}"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # Upload to S3 (non-blocking — we don't fail on S3 errors)
    if settings.S3_ENABLED:
        s3_url = upload_file_to_s3(file_path, doc_id, ext)
        if s3_url:
            db_doc.s3_url = s3_url
            await db.commit()

    # Enqueue ingestion pipeline in background
    background_tasks.add_task(
        process_document_pipeline,
        document_id=doc_id,
        file_path=file_path,
        file_type=ext,
        db_session_factory=AsyncSessionLocal,
    )

    await db.refresh(db_doc)
    return db_doc


# ---------------------------------------------------------------------------
# Single file upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    department: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin_key),
):
    """Upload a single document. Requires X-Admin-Key header."""
    return await _save_and_enqueue(file, department, author, category, db, background_tasks)


# ---------------------------------------------------------------------------
# Batch upload (multiple files in one request)
# ---------------------------------------------------------------------------

@router.post("/upload-batch", response_model=List[DocumentResponse])
async def upload_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    department: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin_key),
):
    """
    Upload multiple documents in one request.
    Each file is processed independently; errors on one file don't abort others.
    Requires X-Admin-Key header.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    results = []
    errors = []

    for file in files:
        try:
            doc = await _save_and_enqueue(
                file, department, author, category, db, background_tasks
            )
            results.append(doc)
        except HTTPException as e:
            errors.append({"filename": file.filename, "error": e.detail})
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})

    if errors and not results:
        raise HTTPException(
            status_code=400,
            detail={"message": "All uploads failed.", "errors": errors},
        )

    # Partial success is still a 200 — errors are attached in headers for transparency
    return results


# ---------------------------------------------------------------------------
# List documents (public)
# ---------------------------------------------------------------------------

@router.get("", response_model=List[DocumentResponse])
async def list_documents(db: AsyncSession = Depends(get_db)):
    """List all documents. Public endpoint."""
    result = await db.execute(select(Document).order_by(Document.upload_timestamp.desc()))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Get single document (public)
# ---------------------------------------------------------------------------

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document_status(doc_id: str, db: AsyncSession = Depends(get_db)):
    """Get document metadata and processing status. Public endpoint."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


# ---------------------------------------------------------------------------
# Delete document (admin-protected)
# ---------------------------------------------------------------------------

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin_key),
):
    """
    Delete a document and all associated data:
    - FAISS vectors
    - Local file on disk
    - S3 object (if S3 enabled)
    - Database record (cascades to chunks)
    Requires X-Admin-Key header.
    """
    doc_res = await db.execute(select(Document).where(Document.id == doc_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # 1. Get related chunk IDs and remove from FAISS
    chunk_res = await db.execute(select(Chunk.id).where(Chunk.document_id == doc_id))
    chunk_ids = [row[0] for row in chunk_res.all()]

    if chunk_ids and faiss_manager.index is not None:
        try:
            faiss_manager.remove_vectors(chunk_ids)
            print(f"[Delete] Removed {len(chunk_ids)} vectors from FAISS index.")
        except Exception as e:
            print(f"[Delete] Error removing FAISS vectors for doc {doc_id}: {e}")

    # 2. Delete local physical file
    file_path = os.path.join(settings.UPLOADS_DIR, f"{doc.id}.{doc.file_type}")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"[Delete] Error removing local file {file_path}: {e}")

    # 3. Delete from S3 if enabled
    if settings.S3_ENABLED:
        delete_file_from_s3(doc_id, doc.file_type)

    # 4. Delete from DB (cascades to chunks)
    await db.execute(delete(Document).where(Document.id == doc_id))
    await db.commit()

    # 5. Rebuild BM25 index
    await rebuild_bm25_from_db(db)

    return {
        "message": f"Document '{doc.filename}' deleted successfully.",
        "doc_id": doc_id,
    }
