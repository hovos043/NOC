import secrets

from fastapi import HTTPException, Request, WebSocket, status

from app.config import get_settings


AUTH_TOKEN_ENV = "NAMEAM_NOC_AUTH_TOKEN"
AUTH_HEADER = "x-nameam-noc-token"


def get_auth_token() -> str:
    settings = get_settings()
    token = settings.auth_token
    if not token:
        raise RuntimeError("NAMEAM_NOC_AUTH_TOKEN is required")
    return token


def verify_request_token(request: Request) -> None:
    expected = get_auth_token()
    provided = request.headers.get(AUTH_HEADER) or _bearer_token(request.headers.get("authorization"))
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")


def verify_websocket_token(websocket: WebSocket) -> bool:
    expected = get_auth_token()
    provided = websocket.query_params.get("token") or websocket.headers.get(AUTH_HEADER) or _bearer_token(websocket.headers.get("authorization"))
    return bool(provided and secrets.compare_digest(provided, expected))


def _bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None
