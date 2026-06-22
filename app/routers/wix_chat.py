"""
Wix Chat Router — Public endpoint for Wix chatbot integration.

Accepts chat messages from Wix Velo backend, runs the full RAG pipeline,
and returns a JSON response that Wix can render in the chat widget.

Endpoint: POST /api/wix-chat
Auth: None (public) — but rate-limited to prevent abuse.
"""

import time
import asyncio
from collections import defaultdict
from typing import Optional, Dict

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services.retrieval import run_hybrid_retrieval
from app.services.reranking import run_reranking
from app.services.context_builder import build_context_window
from app.services.llm import generate_answer_from_llm

router = APIRouter(prefix="/api/wix-chat", tags=["wix-chat"])

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter
# Max 10 requests per minute per IP address
# ---------------------------------------------------------------------------
_rate_store: Dict[str, list] = defaultdict(list)
RATE_LIMIT = 10        # max requests
RATE_WINDOW = 60       # per N seconds


def _check_rate_limit(client_ip: str):
    now = time.time()
    window_start = now - RATE_WINDOW
    requests = _rate_store[client_ip]
    # Drop old timestamps
    requests = [t for t in requests if t > window_start]
    _rate_store[client_ip] = requests
    if len(requests) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait a moment and try again."
        )
    requests.append(now)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class WixChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None   # For future session memory
    department: Optional[str] = None   # Optional pre-filter from Wix page context


class SourceItem(BaseModel):
    filename: str
    page_number: int
    score: float


class WixChatResponse(BaseModel):
    reply: str
    sources: list[SourceItem]
    session_id: Optional[str] = None
    execution_time_sec: float


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------

@router.post("", response_model=WixChatResponse)
async def wix_chat(request: Request, body: WixChatRequest):
    """
    Public RAG query endpoint designed for Wix Velo integration.

    - Rate limited: 10 requests/minute per IP
    - Runs the full hybrid RAG pipeline
    - Returns a concise reply + source citations
    """
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    query = body.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    start_time = time.time()

    try:
        async with AsyncSessionLocal() as db:
            # Build optional filters from Wix page context
            from app.models.schemas import QueryFilter
            filters = None
            if body.department:
                filters = QueryFilter(department=body.department)

            # Step 1: Hybrid retrieval
            retrieved_chunks = await run_hybrid_retrieval(
                db_session=db,
                query=query,
                filters=filters,
                top_k=20,
            )

            if not retrieved_chunks:
                return WixChatResponse(
                    reply=(
                        "I couldn't find any relevant information in the knowledge base "
                        "for your question. Please try rephrasing or contact support."
                    ),
                    sources=[],
                    session_id=body.session_id,
                    execution_time_sec=round(time.time() - start_time, 3),
                )

            # Step 2: Reranking
            reranked = run_reranking(query, retrieved_chunks)

            # Step 3: Context window
            context_str, citations = build_context_window(reranked, max_tokens=3000)

            # Step 4: LLM answer
            answer = generate_answer_from_llm(query, context_str)

        sources = [
            SourceItem(
                filename=c.filename,
                page_number=c.page_number,
                score=round(c.score, 4),
            )
            for c in citations
        ]

        return WixChatResponse(
            reply=answer,
            sources=sources,
            session_id=body.session_id,
            execution_time_sec=round(time.time() - start_time, 3),
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error processing your question: {str(e)}"
        )
