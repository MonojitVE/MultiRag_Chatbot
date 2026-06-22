import time
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.schemas import QueryRequest, QueryResponse, SearchResultChunk
from app.services.retrieval import run_hybrid_retrieval
from app.services.reranking import run_reranking
from app.services.context_builder import build_context_window
from app.services.llm import generate_answer_from_llm

router = APIRouter(prefix="/api/query", tags=["query"])

@router.post("", response_model=QueryResponse)
async def query_rag(request: QueryRequest, db: AsyncSession = Depends(get_db)):
    """
    Main RAG pipeline:
    1. Query analysis / pre-filtering
    2. Hybrid retrieval (FAISS semantic + BM25 keyword)
    3. Re-ranking (Cross-Encoder ms-marco-MiniLM)
    4. Context construction (TikToken management)
    5. LLM Answer generation (OpenAI or Gemini)
    """
    start_time = time.time()
    
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    try:
        # Step 1 & 2: Hybrid Retrieval with Pre-Filtering
        retrieved_chunks = await run_hybrid_retrieval(
            db_session=db,
            query=request.query,
            filters=request.filters,
            top_k=20 # Get enough candidates for re-ranking
        )
        
        if not retrieved_chunks:
            return QueryResponse(
                query=request.query,
                answer="No relevant documents found matching your filters. Please upload documents or adjust your filters.",
                sources=[],
                execution_time_sec=time.time() - start_time
            )
            
        # Step 3: Re-ranking via local CrossEncoder
        reranked_chunks = run_reranking(request.query, retrieved_chunks)
        
        # Step 4: Context window builder
        context_str, citations = build_context_window(reranked_chunks, max_tokens=3000)
        
        # Step 5: Answer generation
        answer = generate_answer_from_llm(request.query, context_str)
        
        execution_time = time.time() - start_time
        return QueryResponse(
            query=request.query,
            answer=answer,
            sources=citations,
            execution_time_sec=execution_time
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing RAG query: {str(e)}")


@router.post("/retrieve", response_model=List[SearchResultChunk])
async def retrieve_only(request: QueryRequest, db: AsyncSession = Depends(get_db)):
    """
    Debug endpoint: Returns only retrieved and re-ranked chunks (no LLM call).
    Useful for validating search, pre-filtering, and re-ranking accuracy.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    try:
        # 1. Retrieve
        retrieved_chunks = await run_hybrid_retrieval(
            db_session=db,
            query=request.query,
            filters=request.filters,
            top_k=20
        )
        
        if not retrieved_chunks:
            return []
            
        # 2. Rerank
        reranked_chunks = run_reranking(request.query, retrieved_chunks)
        return reranked_chunks
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving search chunks: {str(e)}")
