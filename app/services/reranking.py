from typing import List
from sentence_transformers import CrossEncoder
from app.config import settings
from app.models.schemas import SearchResultChunk

_reranker_model = None

def get_reranker_model():
    global _reranker_model
    if _reranker_model is None:
        print(f"Loading re-ranker model: {settings.RERANKER_MODEL_NAME}...")
        # Load local cross-encoder model
        _reranker_model = CrossEncoder(settings.RERANKER_MODEL_NAME)
        print("Re-ranker model loaded.")
    return _reranker_model


def run_reranking(query: str, chunks: List[SearchResultChunk]) -> List[SearchResultChunk]:
    """
    Evaluates every retrieved chunk against the user query using a cross-encoder model.
    Updates the scores of chunks and returns them sorted by relevance.
    """
    if not chunks:
        return []

    # Get local cross-encoder model
    model = get_reranker_model()

    # Form query-passage pairs
    pairs = [[query, chunk.text] for chunk in chunks]
    
    # Run predictions
    scores = model.predict(pairs)
    
    # Update scores
    for idx, score in enumerate(scores):
        # Convert NumPy float to native Python float
        chunks[idx].score = float(score)

    # Sort chunks by new score descending
    sorted_chunks = sorted(chunks, key=lambda x: x.score, reverse=True)
    
    # Return top K after re-ranking
    return sorted_chunks[:settings.TOP_K_RERANK]
