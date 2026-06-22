import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.models.database import init_db, AsyncSessionLocal
from app.routers import documents, query
from app.routers import wix_chat
from app.services.ingestion import rebuild_bm25_from_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing Multi-Document Hybrid RAG Database...")
    # Initialize SQLite / PostgreSQL database schema
    await init_db()
    
    # Warm up / rebuild BM25 index on startup
    print("Rebuilding BM25 keyword index...")
    async with AsyncSessionLocal() as session:
        await rebuild_bm25_from_db(session)
        
    yield
    print("Shutting down Multi-Document Hybrid RAG Application...")

app = FastAPI(
    title="Multi-Document Hybrid RAG System",
    description="Enterprise knowledge assistant with hybrid search, admin panel, and Wix chatbot integration.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow Wix domain(s) and localhost for development
# ---------------------------------------------------------------------------
allowed_origins = settings.get_allowed_origins()
# Always include localhost for development
if "*" not in allowed_origins:
    allowed_origins += [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Admin-Key"],
)

# ---------------------------------------------------------------------------
# API Routers
# ---------------------------------------------------------------------------
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(wix_chat.router)

# ---------------------------------------------------------------------------
# App config endpoint
# ---------------------------------------------------------------------------
@app.get("/api/config")
async def get_app_config():
    provider = settings.LLM_PROVIDER.lower()
    if provider == "google":
        model = settings.GOOGLE_MODEL
    elif provider == "openai":
        model = settings.OPENAI_MODEL
    elif provider == "groq":
        model = settings.GROQ_MODEL
    else:
        model = "Unknown"
    return {
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": model,
        "database_type": "PostgreSQL" if settings.DATABASE_URL.startswith("postgres") else "SQLite",
        "s3_enabled": settings.S3_ENABLED,
        "s3_bucket": settings.S3_BUCKET_NAME if settings.S3_ENABLED else None,
    }

# ---------------------------------------------------------------------------
# Static file mounts
# Admin panel served at /admin, old frontend served at root
# ---------------------------------------------------------------------------
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Mount admin panel at /admin
admin_dir = os.path.join(base_dir, "admin")
if os.path.exists(admin_dir):
    app.mount("/admin", StaticFiles(directory=admin_dir, html=True), name="admin")
    print(f"Admin panel mounted at /admin (dir: {admin_dir})")
else:
    print(f"Warning: Admin panel directory '{admin_dir}' not found.")

# Mount legacy frontend at root (serves the chat-integrated frontend)
frontend_dir = os.path.join(base_dir, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    print(f"Frontend mounted at / (dir: {frontend_dir})")
else:
    print(f"Warning: Frontend directory '{frontend_dir}' not found. Serving API only.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
