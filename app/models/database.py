import datetime
import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.config import settings

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    upload_timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    department = Column(String, nullable=True)
    author = Column(String, nullable=True)
    category = Column(String, nullable=True)
    status = Column(String, default="processing")  # processing, completed, failed
    error_message = Column(String, nullable=True)
    s3_url = Column(String, nullable=True)  # S3 object URL if S3 is enabled

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")

class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    page_number = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False)

    document = relationship("Document", back_populates="chunks")

# Async DB Setup
# Ensure we use the asyncpg driver if a standard postgres URL is provided
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Fix Neon DB query parameters for asyncpg compatibility
db_url = db_url.replace("sslmode=require", "ssl=require")
db_url = db_url.replace("&channel_binding=require", "")
db_url = db_url.replace("?channel_binding=require", "")

print("DATABASE_URL =", db_url)
async_engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    async with async_engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
