import tiktoken
from typing import List, Tuple
from app.models.schemas import SearchResultChunk, SourceCitation

def get_token_count(text: str, model_name: str = "gpt-4o") -> int:
    """Estimates token count using tiktoken."""
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except Exception:
        encoding = tiktoken.get_encoding("cl100k_base")
    return len(encoding.encode(text))


def build_context_window(
    chunks: List[SearchResultChunk], 
    max_tokens: int = 4000
) -> Tuple[str, List[SourceCitation]]:
    """
    Formats the list of chunks into a structured text prompt for the LLM.
    Respects a token limit, discarding lowest-ranked chunks if they exceed the budget.
    """
    context_blocks = []
    citations = []
    current_tokens = 0

    # Chunks are already sorted by relevance (re-ranked scores)
    for chunk in chunks:
        # Build block representation
        block = f"[Source: {chunk.filename}, Page: {chunk.page_number}]\nContent: {chunk.text}\n---\n"
        block_tokens = get_token_count(block)

        # Check budget
        if current_tokens + block_tokens > max_tokens:
            print(f"Token limit reached ({current_tokens} tokens). Skipping remaining chunks.")
            break

        context_blocks.append(block)
        current_tokens += block_tokens

        # Create citation metadata
        citations.append(SourceCitation(
            document_id=chunk.document_id,
            filename=chunk.filename,
            page_number=chunk.page_number,
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            score=chunk.score
        ))

    context_str = "\n".join(context_blocks)
    return context_str, citations
