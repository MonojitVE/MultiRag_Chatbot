"""
Admin authentication dependency.

Protects admin-only endpoints by requiring the X-Admin-Key header
to match the ADMIN_API_KEY configured in settings.
"""

from fastapi import Header, HTTPException, status
from app.config import settings


async def require_admin_key(x_admin_key: str = Header(..., alias="X-Admin-Key")):
    """
    FastAPI dependency that validates the admin API key header.

    Usage:
        @router.post("/upload", dependencies=[Depends(require_admin_key)])
        async def upload_document(...):
            ...
    """
    if not x_admin_key or x_admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin API key. Set X-Admin-Key header.",
        )
