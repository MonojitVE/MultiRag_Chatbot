import os
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List

class Settings(BaseSettings):
    PORT: int = Field(default=8000, env="PORT")
    HOST: str = Field(default="0.0.0.0", env="HOST")
    
    # LLM Settings
    LLM_PROVIDER: str = Field(default="groq", env="LLM_PROVIDER") # openai, google, or groq
    OPENAI_API_KEY: str = Field(default="", env="OPENAI_API_KEY")
    GOOGLE_API_KEY: str = Field(default="", env="GOOGLE_API_KEY")
    GROQ_API_KEY: str = Field(default="", env="GROQ_API_KEY")
    
    OPENAI_MODEL: str = Field(default="gpt-4o-mini", env="OPENAI_MODEL")
    GOOGLE_MODEL: str = Field(default="gemini-1.5-flash", env="GOOGLE_MODEL")
    GROQ_MODEL: str = Field(default="llama-3.3-70b-versatile", env="GROQ_MODEL")
    
    # Embedding / Reranking
    EMBEDDING_MODEL_NAME: str = Field(default="sentence-transformers/all-MiniLM-L6-v2", env="EMBEDDING_MODEL_NAME")
    RERANKER_MODEL_NAME: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2", env="RERANKER_MODEL_NAME")
    
    # Storage
    DATABASE_URL: str = Field(default="postgresql+asyncpg://postgres:Pass#123@localhost:5432/multirag", env="DATABASE_URL")
    FAISS_INDEX_DIR: str = Field(default="./data/faiss_index", env="FAISS_INDEX_DIR")
    UPLOADS_DIR: str = Field(default="./data/uploads", env="UPLOADS_DIR")
    
    # AWS S3 Storage
    AWS_ACCESS_KEY_ID: str = Field(default="", env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field(default="", env="AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = Field(default="us-east-1", env="AWS_REGION")
    S3_BUCKET_NAME: str = Field(default="", env="S3_BUCKET_NAME")
    S3_PREFIX: str = Field(default="rag-documents", env="S3_PREFIX")
    # Set to True to enable S3 uploads; False = local-only mode
    S3_ENABLED: bool = Field(default=False, env="S3_ENABLED")

    # Admin Panel Authentication
    # Set a strong secret key — this is the password for the admin panel
    ADMIN_API_KEY: str = Field(default="change-me-admin-secret-key-2024", env="ADMIN_API_KEY")

    # Wix / CORS
    # Comma-separated list of allowed origins for CORS (your Wix site domain)
    # Example: "https://yoursite.wixsite.com,https://www.yoursite.com"
    WIX_ALLOWED_ORIGINS: str = Field(default="*", env="WIX_ALLOWED_ORIGINS")

    # RAG parameters
    CHUNK_SIZE: int = Field(default=500, env="CHUNK_SIZE")
    CHUNK_OVERLAP: int = Field(default=100, env="CHUNK_OVERLAP")
    TOP_K_RETRIEVAL: int = Field(default=20, env="TOP_K_RETRIEVAL")
    TOP_K_RERANK: int = Field(default=5, env="TOP_K_RERANK")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def get_allowed_origins(self) -> List[str]:
        """Parse WIX_ALLOWED_ORIGINS into a list of origin strings."""
        if self.WIX_ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.WIX_ALLOWED_ORIGINS.split(",") if o.strip()]

# Instantiate settings
settings = Settings()

# Ensure standard directories exist
os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
os.makedirs(settings.FAISS_INDEX_DIR, exist_ok=True)

# Only create directory for SQLite if it's a file database
if settings.DATABASE_URL.startswith("sqlite"):
    db_path = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
