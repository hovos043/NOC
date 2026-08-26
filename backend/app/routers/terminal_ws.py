from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.local_auth import verify_websocket_token
from app.services.pty_terminal_service import bridge_ssh_pty

router = APIRouter(tags=["terminal-websocket"])


@router.websocket("/ws/servers/{server_id}/terminal")
async def terminal_websocket(websocket: WebSocket, server_id: int) -> None:
    client_host = websocket.client.host if websocket.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        await websocket.close(code=1008)
        return
    if not verify_websocket_token(websocket):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        await bridge_ssh_pty(websocket, server_id)
    except WebSocketDisconnect:
        return
