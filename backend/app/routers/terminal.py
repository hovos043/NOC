from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.command_history import CommandHistory
from app.models.server import Server
from app.schemas import CommandExecuteRequest, CommandExecuteResult, CommandHistoryRead, CommandPrepareRequest, CommandSafetyResult, TerminalConnectResult
from app.services.ssh_service import SshServiceError
from app.services.terminal_service import CONFIRMATION_TEXT, check_command_safety, connect_terminal, execute_command

router = APIRouter(prefix="/servers/{server_id}/terminal", tags=["terminal"])


@router.post("/connect", response_model=TerminalConnectResult)
def connect(server_id: int, db: Session = Depends(get_db)) -> TerminalConnectResult:
    success, connection_status, error = connect_terminal(db, server_id)
    return TerminalConnectResult(success=success, status=connection_status, error_message=error)


@router.post("/disconnect", response_model=TerminalConnectResult)
def disconnect(server_id: int, db: Session = Depends(get_db)) -> TerminalConnectResult:
    if not db.get(Server, server_id):
        raise HTTPException(status_code=404, detail="server_not_found")
    return TerminalConnectResult(success=True, status="disconnected")


@router.post("/prepare", response_model=CommandSafetyResult)
def prepare(server_id: int, payload: CommandPrepareRequest, db: Session = Depends(get_db)) -> CommandSafetyResult:
    if not db.get(Server, server_id):
        raise HTTPException(status_code=404, detail="server_not_found")
    safety = check_command_safety(payload.command)
    return CommandSafetyResult(**safety, confirmation_text=CONFIRMATION_TEXT)


@router.post("/execute", response_model=CommandExecuteResult)
def execute(server_id: int, payload: CommandExecuteRequest, db: Session = Depends(get_db)) -> CommandExecuteResult:
    try:
        return CommandExecuteResult(**execute_command(db, server_id, payload.command, payload.confirmation_text))
    except SshServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc


@router.get("/history", response_model=list[CommandHistoryRead])
def history(server_id: int, limit: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db)) -> list[CommandHistoryRead]:
    return (
        db.query(CommandHistory)
        .filter(CommandHistory.server_id == server_id)
        .order_by(CommandHistory.created_at.desc())
        .limit(limit)
        .all()
    )
