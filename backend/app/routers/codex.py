from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.command_history import CommandHistory
from app.models.monitoring_snapshot import MonitoringSnapshot
from app.models.server import Server
from app.schemas import CommandExecuteRequest, CommandExecuteResult, CommandHistoryRead, CommandPrepareRequest, CommandSafetyResult, ServerContextRead
from app.services.ssh_service import SshServiceError
from app.services.terminal_service import CONFIRMATION_TEXT, check_command_safety, execute_command
from app.routers.servers import snapshot_to_read

router = APIRouter(prefix="/codex", tags=["codex-local"])


@router.post("/servers/{server_id}/command/prepare", response_model=CommandSafetyResult)
def prepare_command(server_id: int, payload: CommandPrepareRequest, db: Session = Depends(get_db)) -> CommandSafetyResult:
    _require_server(db, server_id)
    safety = check_command_safety(payload.command)
    return CommandSafetyResult(**safety, confirmation_text=CONFIRMATION_TEXT)


@router.post("/server-ref/{server_ref}/command/prepare", response_model=CommandSafetyResult)
def prepare_command_by_ref(server_ref: str, payload: CommandPrepareRequest, db: Session = Depends(get_db)) -> CommandSafetyResult:
    server = _require_server_ref(db, server_ref)
    safety = check_command_safety(payload.command)
    return CommandSafetyResult(**safety, confirmation_text=CONFIRMATION_TEXT)


@router.post("/servers/{server_id}/command/execute", response_model=CommandExecuteResult)
def execute_prepared_command(server_id: int, payload: CommandExecuteRequest, db: Session = Depends(get_db)) -> CommandExecuteResult:
    try:
        return CommandExecuteResult(**execute_command(db, server_id, payload.command, payload.confirmation_text))
    except SshServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc


@router.post("/server-ref/{server_ref}/command/execute", response_model=CommandExecuteResult)
def execute_prepared_command_by_ref(server_ref: str, payload: CommandExecuteRequest, db: Session = Depends(get_db)) -> CommandExecuteResult:
    server = _require_server_ref(db, server_ref)
    try:
        return CommandExecuteResult(**execute_command(db, server.id, payload.command, payload.confirmation_text))
    except SshServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc


@router.get("/servers/{server_id}/command/history", response_model=list[CommandHistoryRead])
def command_history(server_id: int, db: Session = Depends(get_db)) -> list[CommandHistoryRead]:
    _require_server(db, server_id)
    return (
        db.query(CommandHistory)
        .filter(CommandHistory.server_id == server_id)
        .order_by(CommandHistory.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/server-ref/{server_ref}/command/history", response_model=list[CommandHistoryRead])
def command_history_by_ref(server_ref: str, db: Session = Depends(get_db)) -> list[CommandHistoryRead]:
    server = _require_server_ref(db, server_ref)
    return (
        db.query(CommandHistory)
        .filter(CommandHistory.server_id == server.id)
        .order_by(CommandHistory.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/servers/{server_id}/context", response_model=ServerContextRead)
def server_context(server_id: int, db: Session = Depends(get_db)) -> ServerContextRead:
    server = _require_server(db, server_id)
    return _server_context(db, server)


@router.get("/server-ref/{server_ref}/context", response_model=ServerContextRead)
def server_context_by_ref(server_ref: str, db: Session = Depends(get_db)) -> ServerContextRead:
    server = _require_server_ref(db, server_ref)
    return _server_context(db, server)


def _server_context(db: Session, server: Server) -> ServerContextRead:
    snapshot = (
        db.query(MonitoringSnapshot)
        .filter(MonitoringSnapshot.server_id == server.id)
        .order_by(MonitoringSnapshot.collected_at.desc())
        .first()
    )
    accounts_count = db.query(Account).filter(Account.server_id == server.id).count()
    return ServerContextRead(
        id=server.id,
        display_name=server.display_name,
        hostname=server.hostname,
        enabled=server.enabled,
        ssh_status=server.ssh_status,
        whm_status=server.whm_status,
        accounts_count=accounts_count,
        last_checked_at=server.last_checked_at,
        latest_metrics=snapshot_to_read(snapshot),
    )


def _require_server(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    return server


def _require_server_ref(db: Session, server_ref: str) -> Server:
    normalized = server_ref.strip().lower()
    server = (
        db.query(Server)
        .filter((func.lower(Server.display_name) == normalized) | (func.lower(Server.hostname) == normalized))
        .first()
    )
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    return server
