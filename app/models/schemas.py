from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class DocumentMetadataUpdate(BaseModel):
    department: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None

class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    upload_timestamp: datetime
    department: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    s3_url: Optional[str] = None

    class Config:
        from_attributes = True

class ChunkResponse(BaseModel):
    id: int
    document_id: str
    chunk_index: int
    page_number: int
    text: str
    word_count: int

    class Config:
        from_attributes = True

class QueryFilter(BaseModel):
    department: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    doc_ids: Optional[List[str]] = None

class QueryRequest(BaseModel):
    query: str
    filters: Optional[QueryFilter] = None

class SourceCitation(BaseModel):
    document_id: str
    filename: str
    page_number: int
    chunk_index: int
    text: str
    score: float

class QueryResponse(BaseModel):
    query: str
    answer: str
    sources: List[SourceCitation]
    execution_time_sec: float

class SearchResultChunk(BaseModel):
    chunk_id: int
    document_id: str
    filename: str
    page_number: int
    chunk_index: int
    text: str
    score: float
