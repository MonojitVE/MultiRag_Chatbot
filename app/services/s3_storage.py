"""
S3 Storage Service for Multi-Document RAG System.

Handles upload, download, and deletion of documents in AWS S3.
When S3_ENABLED=False in settings, all operations are no-ops and
the system falls back to local-only file storage.
"""

import os
import tempfile
from typing import Optional

from app.config import settings


def _get_s3_client():
    """Lazily create and return a boto3 S3 client."""
    try:
        import boto3
        client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        )
        return client
    except ImportError:
        raise RuntimeError(
            "boto3 is not installed. Run: pip install boto3"
        )


def get_s3_key(doc_id: str, ext: str) -> str:
    """Build the S3 object key for a given document."""
    prefix = settings.S3_PREFIX.rstrip("/")
    return f"{prefix}/{doc_id}.{ext}"


def upload_file_to_s3(local_path: str, doc_id: str, ext: str) -> Optional[str]:
    """
    Upload a local file to S3.

    Returns:
        The public HTTPS URL of the uploaded S3 object, or None if S3 is disabled.
    """
    if not settings.S3_ENABLED:
        return None

    s3 = _get_s3_client()
    key = get_s3_key(doc_id, ext)

    try:
        s3.upload_file(
            Filename=local_path,
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            ExtraArgs={"ContentType": _content_type(ext)},
        )
        url = f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
        print(f"[S3] Uploaded {local_path} → s3://{settings.S3_BUCKET_NAME}/{key}")
        return url
    except Exception as e:
        print(f"[S3] Upload failed for doc {doc_id}: {e}")
        return None


def download_file_from_s3(doc_id: str, ext: str) -> Optional[str]:
    """
    Download a document from S3 to a temporary local file.

    Returns:
        Local path to the downloaded temp file, or None if S3 is disabled.
        Caller is responsible for deleting the temp file after use.
    """
    if not settings.S3_ENABLED:
        return None

    s3 = _get_s3_client()
    key = get_s3_key(doc_id, ext)

    try:
        suffix = f".{ext}"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.close()
        s3.download_file(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Filename=tmp.name,
        )
        print(f"[S3] Downloaded s3://{settings.S3_BUCKET_NAME}/{key} → {tmp.name}")
        return tmp.name
    except Exception as e:
        print(f"[S3] Download failed for doc {doc_id}: {e}")
        return None


def delete_file_from_s3(doc_id: str, ext: str) -> bool:
    """
    Delete a document from S3.

    Returns:
        True on success or if S3 is disabled, False on error.
    """
    if not settings.S3_ENABLED:
        return True

    s3 = _get_s3_client()
    key = get_s3_key(doc_id, ext)

    try:
        s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
        print(f"[S3] Deleted s3://{settings.S3_BUCKET_NAME}/{key}")
        return True
    except Exception as e:
        print(f"[S3] Delete failed for doc {doc_id}: {e}")
        return False


def _content_type(ext: str) -> str:
    """Map file extension to MIME type."""
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain",
    }.get(ext.lower(), "application/octet-stream")
