# Multi-Document Hybrid RAG System

A production-style Retrieval-Augmented Generation (RAG) system with metadata-aware pre-filtering, hybrid retrieval (dense vector + sparse keyword), and cross-encoder re-ranking. 

Includes a premium glassmorphism dark-mode web interface.

---

## Architecture Diagram

```
Document Upload (PDF, DOCX, TXT)
      │
      ▼
Text Extraction ──► Chunk Splitter (Recursive) ──► Embeddings (all-MiniLM-L6)
                                                        │
┌───────────────────────────────────────────────────────┴───────────────────────┐
▼                                                                               ▼
SQLite Database (Metadata)                                          FAISS Vector Store
(Chunks, Files, Tags, Pages)                                        (Vector Index)
```

### Retrieval flow:
```
User Query
      │
      ▼
[Metadata Pre-Filtering] (SQL Query) ──► Candidates Subset
      │
      ├───────────────────────┬───────────────────────┐
      ▼                                               ▼
[Dense Similarity Search]                        [Sparse Search]
FAISS (Cosine distance)                          BM25 (Exact terms)
      │                                               │
      └───────────────────────┬───────────────────────┘
                              ▼
                [Reciprocal Rank Fusion]
                              │
                              ▼
                [Cross-Encoder Re-ranking] (ms-marco-MiniLM)
                              │
                              ▼
                    Top Relevant Chunks
                              │
                              ▼
                  [Context Assembly] (Token budgets)
                              │
                              ▼
                      [LLM Generation] (Gemini / OpenAI)
                              │
                              ▼
                      Grounded Citations Answer
```

---

## Technical Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite, `aiosqlite`
- **Dense Vector Search**: FAISS (Facebook AI Similarity Search)
- **Sparse Keyword Search**: BM25 (`rank-bm25`)
- **Semantic Representation**: HuggingFace SentenceTransformers (`all-MiniLM-L6-v2`)
- **Re-ranking**: Cross-Encoder (`ms-marco-MiniLM-L-6-v2`)
- **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism Dark Mode), Vanilla JavaScript ES6

---

## Setup & Installation

### 1. Create and Activate Virtual Environment
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your API keys:
```env
LLM_PROVIDER=google
GOOGLE_API_KEY=AIzaSy...
```

---

## Running the Application

Start the FastAPI development server:
```powershell
.venv\Scripts\python.exe app/main.py
```

The application will start on `http://localhost:8000`.
- **Frontend UI**: Open `http://localhost:8000` in your web browser.
- **Interactive API Documentation**: Go to `http://localhost:8000/docs`.

---

## Testing

Run the local test scripts:
```powershell
.venv\Scripts\python.exe tests/test_ingestion.py
.venv\Scripts\python.exe tests/test_retrieval.py
```
