import uuid
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


class AuditService:
    @staticmethod
    async def log_event(
        db: AsyncSession,
        action: str,
        target: str,
        user_id: Optional[uuid.UUID] = None,
        ip: Optional[str] = None,
        metadata_json: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """Create an audit log record for security, auth, and administrative operations."""
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            target=target,
            ip=ip,
            metadata_json=metadata_json,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        return log_entry
