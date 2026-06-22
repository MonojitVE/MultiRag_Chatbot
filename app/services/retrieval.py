import faiss
import numpy as np
from typing import List, Tuple, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.database import Document, Chunk
from app.services.indexing import faiss_manager, bm25_manager
from app.services.ingestion import get_embedding_model
from app.models.schemas import QueryFilter, SearchResultChunk

async def get_candidate_chunk_ids(db_session: AsyncSession, filters: Optional[QueryFilter]) -> Optional[List[int]]:
    """
    Applies SQL-based filtering to narrow down chunks according to user metadata filters.
    Returns a list of matching Chunk.id's, or None if no filters were applied.
    """
    if not filters:
        return None
    
    # Check if any filter is active
    has_active_filter = (
        filters.department is not None or
        filters.author is not None or
        filters.category is not None or
        (filters.doc_ids is not None and len(filters.doc_ids) > 0)
    )
    
    if not has_active_filter:
        return None

    query_stmt = select(Chunk.id).join(Document)
    
    if filters.department:
        query_stmt = query_stmt.where(Document.department == filters.department)
    if filters.author:
        query_stmt = query_stmt.where(Document.author == filters.author)
    if filters.category:
        query_stmt = query_stmt.where(Document.category == filters.category)
    if filters.doc_ids and len(filters.doc_ids) > 0:
        query_stmt = query_stmt.where(Document.id.in_(filters.doc_ids))

    result = await db_session.execute(query_stmt)
    candidate_ids = [row[0] for row in result.all()]
    
    return candidate_ids


async def run_hybrid_retrieval(
    db_session: AsyncSession,
    query: str,
    filters: Optional[QueryFilter] = None,
    top_k: int = 20
) -> List[SearchResultChunk]:
    """
    Main retrieval entry point combining:
    1. Metadata SQL Pre-Filtering
    2. Dense Vector Search (FAISS)
    3. Sparse Keyword Search (BM25)
    4. Reciprocal Rank Fusion (RRF)
    5. Database enrichment (to get raw text, filenames, page numbers)
    """
    # 1. SQL Pre-Filtering
    candidate_ids = await get_candidate_chunk_ids(db_session, filters)
    
    # If filters were specified but no candidates match, return immediately
    if candidate_ids is not None and len(candidate_ids) == 0:
        return []

    # 2. Dense Vector Search
    model = get_embedding_model()
    query_vector = model.encode(query, show_progress_bar=False)
    
    dense_results = []
    
    if faiss_manager.index is not None and faiss_manager.index.ntotal > 0:
        if candidate_ids is None:
            # Unfiltered FAISS search
            scores, indices = faiss_manager.search(query_vector, top_k * 2)
            dense_results = [(int(idx), float(score)) for idx, score in zip(indices, scores) if idx >= 0]
        else:
            # Filtered FAISS search: Reconstruct vectors for candidates and do Cosine Similarity
            candidate_vectors = []
            valid_candidate_ids = []
            for cid in candidate_ids:
                vec = faiss_manager.reconstruct_vector(cid)
                if vec is not None:
                    candidate_vectors.append(vec)
                    valid_candidate_ids.append(cid)
            
            if len(candidate_vectors) > 0:
                candidate_vectors_np = np.array(candidate_vectors, dtype=np.float32)
                faiss.normalize_L2(candidate_vectors_np)
                
                query_vector_np = np.array(query_vector, dtype=np.float32).reshape(1, -1)
                faiss.normalize_L2(query_vector_np)
                
                # Cosine similarity is dot product on normalized vectors
                similarities = np.dot(candidate_vectors_np, query_vector_np.T).flatten()
                
                # Get top matching candidates
                top_indices = np.argsort(similarities)[::-1][:top_k * 2]
                dense_results = [(valid_candidate_ids[idx], float(similarities[idx])) for idx in top_indices]

    # 3. Sparse Keyword Search
    sparse_results = []
    if not bm25_manager.is_empty():
        sparse_results = bm25_manager.search(query, candidate_ids)
        sparse_results = sparse_results[:top_k * 2]

    # 4. Reciprocal Rank Fusion (RRF)
    # RRF combines multiple ranked lists. RRF score = sum(1 / (k + rank))
    # We use standard constant k = 60
    rrf_k = 60
    rrf_scores = {}
    
    for rank, (chunk_id, _) in enumerate(dense_results):
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (rrf_k + rank + 1))
        
    for rank, (chunk_id, _) in enumerate(sparse_results):
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (rrf_k + rank + 1))

    # Sort candidates by RRF score
    sorted_rrf_results = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    
    if not sorted_rrf_results:
        return []

    # 5. Database enrichment
    # Fetch details for the top chunks
    top_chunk_ids = [chunk_id for chunk_id, _ in sorted_rrf_results]
    rrf_score_map = {chunk_id: score for chunk_id, score in sorted_rrf_results}

    chunk_query = select(Chunk, Document.filename).join(Document).where(Chunk.id.in_(top_chunk_ids))
    chunk_res = await db_session.execute(chunk_query)
    chunk_rows = chunk_res.all()

    # Reassemble results preserving sorted order
    enriched_results = []
    for chunk, filename in chunk_rows:
        enriched_results.append(SearchResultChunk(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            filename=filename,
            page_number=chunk.page_number,
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            score=rrf_score_map.get(chunk.id, 0.0)
        ))

    # Sort enriched results by RRF score to match sorted_rrf_results order
    enriched_results.sort(key=lambda x: x.score, reverse=True)
    
    return enriched_results
