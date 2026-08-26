import asyncio
import contextlib
import json
import time
from datetime import datetime

import paramiko
from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.server import Server
from app.models.terminal_session import TerminalSession
from app.services.ssh_service import SshServiceError, _connect, _validate_server_for_ssh


IDLE_TIMEOUT_SECONDS = 30 * 60


def validate_terminal_server(db: Session, server_id: int) -> Server:
    server = db.get(Server, server_id)
    if not server:
        raise SshServiceError("server_not_found", "Server not found")
    if not server.enabled:
        raise SshServiceError("server_disabled", "Server is disabled")
    _validate_server_for_ssh(server, require_enabled=True)
    return server


async def bridge_ssh_pty(websocket: WebSocket, server_id: int) -> None:
    db = SessionLocal()
    client: paramiko.SSHClient | None = None
    channel: paramiko.Channel | None = None
    session_id: int | None = None
    started = time.perf_counter()
    last_activity = time.monotonic()
    disconnect_reason = "client_disconnect"

    try:
        server = validate_terminal_server(db, server_id)
        client = _connect(server)
        channel = client.invoke_shell(term="xterm", width=120, height=32)
        channel.settimeout(0.0)
        session_id = _start_session(db, server)
        await websocket.send_text(json.dumps({"type": "status", "status": "connected"}))

        async def read_ssh() -> None:
            nonlocal disconnect_reason, last_activity
            assert channel is not None
            while True:
                if channel.closed or channel.exit_status_ready():
                    disconnect_reason = "ssh_closed"
                    await websocket.send_text(json.dumps({"type": "status", "status": "closed", "message": "ssh_closed"}))
                    return
                if time.monotonic() - last_activity > IDLE_TIMEOUT_SECONDS:
                    disconnect_reason = "idle_timeout"
                    await websocket.send_text(json.dumps({"type": "status", "status": "closed", "message": "idle_timeout"}))
                    return
                try:
                    if channel.recv_ready():
                        data = channel.recv(4096).decode(errors="replace")
                        await websocket.send_text(json.dumps({"type": "output", "data": data}))
                    if channel.recv_stderr_ready():
                        data = channel.recv_stderr(4096).decode(errors="replace")
                        await websocket.send_text(json.dumps({"type": "output", "data": data}))
                except OSError:
                    disconnect_reason = "ssh_error"
                    return
                await asyncio.sleep(0.02)

        async def read_ws() -> None:
            nonlocal disconnect_reason, last_activity
            assert channel is not None
            while True:
                message = await websocket.receive_text()
                last_activity = time.monotonic()
                try:
                    payload = json.loads(message)
                except ValueError:
                    channel.send(message)
                    continue
                message_type = payload.get("type")
                if message_type == "input":
                    channel.send(str(payload.get("data", "")))
                elif message_type == "resize":
                    cols = int(payload.get("cols") or 120)
                    rows = int(payload.get("rows") or 32)
                    channel.resize_pty(width=max(20, cols), height=max(5, rows))
                elif message_type == "disconnect":
                    disconnect_reason = "user_disconnect"
                    return

        tasks = [asyncio.create_task(read_ssh()), asyncio.create_task(read_ws())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            with contextlib.suppress(Exception):
                task.result()
    except SshServiceError as exc:
        disconnect_reason = exc.code
        await websocket.send_text(json.dumps({"type": "status", "status": "error", "message": exc.code}))
    except Exception:
        disconnect_reason = "terminal_error"
        with contextlib.suppress(Exception):
            await websocket.send_text(json.dumps({"type": "status", "status": "error", "message": "terminal_error"}))
    finally:
        if channel is not None:
            with contextlib.suppress(Exception):
                channel.close()
        if client is not None:
            with contextlib.suppress(Exception):
                client.close()
        if session_id is not None:
            _end_session(db, session_id, disconnect_reason, int((time.perf_counter() - started) * 1000))
        db.close()


def _start_session(db: Session, server: Server) -> int:
    session = TerminalSession(
        server_id=server.id,
        hostname=server.hostname,
        ssh_username=server.ssh_username,
        started_at=datetime.utcnow(),
        status="connected",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session.id


def _end_session(db: Session, session_id: int, reason: str, duration_ms: int) -> None:
    session = db.get(TerminalSession, session_id)
    if not session:
        return
    session.ended_at = datetime.utcnow()
    session.duration_ms = duration_ms
    session.status = "closed"
    session.disconnect_reason = reason
    db.commit()
