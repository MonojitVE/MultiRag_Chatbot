import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import numpy as np
import faiss
from rank_bm25 import BM25Okapi
from app.services.indexing import FAISSIndexManager, BM25IndexManager, tokenize_text

def test_faiss_operations():
    """Verify that FAISS index addition, removal, and searches function correctly."""
    # Initialize index
    manager = FAISSIndexManager()
    
    # Generate mock vectors
    dimension = 384
    num_vectors = 10
    vectors = np.random.randn(num_vectors, dimension).astype(np.float32)
    ids = list(range(100, 100 + num_vectors))
    
    # Add vectors
    manager.add_vectors(vectors, ids)
    
    # Search vector
    query_vector = vectors[0]
    scores, indices = manager.search(query_vector, top_k=3)
    
    assert len(indices) == 3
    assert indices[0] == ids[0]  # The closest vector should be itself
    print("FAISS indexing test passed.")
    
    # Remove vectors
    manager.remove_vectors([ids[0]])
    
    # Search again
    scores_after, indices_after = manager.search(query_vector, top_k=3)
    assert indices_after[0] != ids[0]  # The deleted ID should no longer be retrieved
    print("FAISS deletion test passed.")

def test_bm25_operations():
    """Verify that BM25 search and pre-filtering function correctly."""
    manager = BM25IndexManager()
    
    mock_chunks = [
        {"id": 1, "text": "The quick brown fox jumps over the lazy dog"},
        {"id": 2, "text": "Artificial intelligence and machine learning are expanding fields"},
        {"id": 3, "text": "RAG systems use vector databases for similarity retrieval"}
    ]
    
    manager.build_index(mock_chunks)
    
    # Search
    results = manager.search("vector databases")
    assert len(results) > 0
    assert results[0][0] == 3  # Chunk 3 has "vector databases"
    
    # Filtered search
    results_filtered = manager.search("vector databases", candidate_ids=[1, 2])
    assert len(results_filtered) == 0  # Chunk 3 is excluded by candidate filters
    
    print("BM25 indexing and pre-filtering tests passed.")

if __name__ == "__main__":
    test_faiss_operations()
    test_bm25_operations()
    print("All retrieval tests passed.")
