from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.schemas import AuditLogRead

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(server_id: int | None = None, limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[AuditLogRead]:
    query = db.query(AuditLog)
    if server_id:
        query = query.filter(AuditLog.server_id == server_id)
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()
