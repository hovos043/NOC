import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import engine, get_db
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.models.command_history import CommandHistory
from app.models.server import Server
from app.schemas import DiagnosticsRead, DiagnosticsServerStatus
from app.services.migrations import CURRENT_SCHEMA_VERSION

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("", response_model=DiagnosticsRead)
def get_diagnostics(db: Session = Depends(get_db)) -> DiagnosticsRead:
    settings = get_settings()
    database_path = engine.url.database
    latest_backup = _latest_backup(database_path)
    servers = db.query(Server).order_by(Server.hostname.asc()).all()
    return DiagnosticsRead(
        status="ok",
        app_name=settings.app_name,
        backend_pid=os.getpid(),
        backend_host=settings.backend_host,
        backend_port=settings.backend_port,
        database_path=database_path,
        schema_version=CURRENT_SCHEMA_VERSION,
        servers_count=db.query(func.count(Server.id)).scalar() or 0,
        enabled_servers_count=db.query(func.count(Server.id)).filter(Server.enabled.is_(True)).scalar() or 0,
        accounts_count=db.query(func.count(Account.id)).scalar() or 0,
        audit_logs_count=db.query(func.count(AuditLog.id)).scalar() or 0,
        command_history_count=db.query(func.count(CommandHistory.id)).scalar() or 0,
        latest_backup=latest_backup,
        servers=[
            DiagnosticsServerStatus(
                id=server.id,
                display_name=server.display_name,
                hostname=server.hostname,
                enabled=server.enabled,
                ssh_status=server.ssh_status,
                whm_status=server.whm_status,
                last_whm_error=server.last_whm_error,
                last_account_sync_at=server.last_account_sync_at,
            )
            for server in servers
        ],
    )


def _latest_backup(database_path: str | None) -> str | None:
    if not database_path:
        return None
    source = Path(database_path)
    if not source.parent.exists():
        return None
    backups = sorted(source.parent.glob(f"{source.stem}.*{source.suffix}"), key=lambda item: item.stat().st_mtime, reverse=True)
    return str(backups[0]) if backups else None
