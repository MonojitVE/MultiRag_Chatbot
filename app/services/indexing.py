import os
import faiss
import numpy as np
import re
from typing import List, Tuple, Dict
from rank_bm25 import BM25Okapi
from app.config import settings

class FAISSIndexManager:
    def __init__(self):
        self.index_path = os.path.join(settings.FAISS_INDEX_DIR, "index.faiss")
        self.dimension = 384  # Default for sentence-transformers/all-MiniLM-L6-v2
        self.index = None
        self.load_index()

    def load_index(self):
        if os.path.exists(self.index_path) and os.path.getsize(self.index_path) > 0:
            try:
                self.index = faiss.read_index(self.index_path)
            except Exception as e:
                print(f"Error reading FAISS index: {e}. Reinitializing index.")
                self.index = faiss.IndexIDMap(faiss.IndexFlatIP(self.dimension))
        else:
            self.index = faiss.IndexIDMap(faiss.IndexFlatIP(self.dimension))

    def save_index(self):
        os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
        faiss.write_index(self.index, self.index_path)

    def add_vectors(self, vectors: np.ndarray, ids: List[int]):
        if len(vectors) == 0:
            return
        
        # Ensure correct type
        vectors_np = np.array(vectors, dtype=np.float32)
        ids_np = np.array(ids, dtype=np.int64)

        # Normalize for cosine similarity / inner product
        faiss.normalize_L2(vectors_np)

        # Add to index
        self.index.add_with_ids(vectors_np, ids_np)
        self.save_index()

    def remove_vectors(self, ids: List[int]):
        if len(ids) == 0:
            return
        ids_np = np.array(ids, dtype=np.int64)
        self.index.remove_ids(ids_np)
        self.save_index()

    def search(self, query_vector: np.ndarray, top_k: int) -> Tuple[np.ndarray, np.ndarray]:
        # Reshape to 2D if 1D
        if len(query_vector.shape) == 1:
            query_vector = query_vector.reshape(1, -1)
        
        query_vector_np = np.array(query_vector, dtype=np.float32)
        faiss.normalize_L2(query_vector_np)

        # FAISS search
        scores, indices = self.index.search(query_vector_np, top_k)
        return scores[0], indices[0]

    def reconstruct_vector(self, id: int) -> np.ndarray:
        try:
            return self.index.reconstruct(id)
        except Exception:
            return None

# Singleton FAISS manager
faiss_manager = FAISSIndexManager()


# BM25 Tokenizer
def tokenize_text(text: str) -> List[str]:
    # Lowercase and split on alphanumeric words
    return re.findall(r'\w+', text.lower())


class BM25IndexManager:
    def __init__(self):
        self.bm25 = None
        self.chunk_ids = []
        self.chunk_map = {} # Maps chunk ID to its raw text for reference if needed

    def is_empty(self) -> bool:
        return self.bm25 is None or len(self.chunk_ids) == 0

    def build_index(self, chunks: List[Dict]):
        """
        Builds the BM25 index in memory.
        chunks: List of dicts, each with keys 'id' (int) and 'text' (str)
        """
        if not chunks:
            self.bm25 = None
            self.chunk_ids = []
            self.chunk_map = {}
            return

        corpus_tokens = []
        self.chunk_ids = []
        self.chunk_map = {}

        for chunk in chunks:
            tokens = tokenize_text(chunk['text'])
            corpus_tokens.append(tokens)
            self.chunk_ids.append(chunk['id'])
            self.chunk_map[chunk['id']] = chunk['text']

        self.bm25 = BM25Okapi(corpus_tokens)

    def search(self, query: str, candidate_ids: List[int] = None) -> List[Tuple[int, float]]:
        """
        Searches the BM25 index. If candidate_ids is provided, restricts results to those chunks.
        Returns a list of tuples: (chunk_id, bm25_score)
        """
        if self.is_empty():
            return []

        query_tokens = tokenize_text(query)
        scores = self.bm25.get_scores(query_tokens)

        results = []
        for idx, chunk_id in enumerate(self.chunk_ids):
            if candidate_ids is not None and chunk_id not in candidate_ids:
                continue
            
            score = float(scores[idx])
            # Filter out zero or negative relevance scores
            if score > 0:
                results.append((chunk_id, score))

        # Sort descending by score
        results.sort(key=lambda x: x[1], reverse=True)
        return results

# Singleton BM25 manager
bm25_manager = BM25IndexManager()
