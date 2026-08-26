from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.server import Server
from app.services.secret_service import unprotect_secret


class WhmServiceError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _configured_host(server: Server) -> str:
    return (server.whm_hostname or server.hostname).strip()


def _validate_server(server: Server | None, require_enabled: bool = True) -> Server:
    if not server:
        raise WhmServiceError("server_not_found")
    if require_enabled and not server.enabled:
        raise WhmServiceError("server_disabled")
    if not _configured_host(server):
        raise WhmServiceError("missing_whm_hostname")
    if not server.whm_username:
        raise WhmServiceError("missing_whm_username")
    if not server.whm_api_token:
        raise WhmServiceError("missing_whm_api_token")
    return server


def _whm_request(server: Server, function_name: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    host = _configured_host(server)
    url = f"https://{host}:{server.whm_port}/json-api/{function_name}"
    try:
        token = unprotect_secret(server.whm_api_token)
    except RuntimeError as exc:
        raise WhmServiceError("secret_decryption_failed") from exc
    headers = {"Authorization": f"whm {server.whm_username}:{token}"}
    query = {"api.version": "1", **(params or {})}
    try:
        with httpx.Client(timeout=20.0, verify=True, follow_redirects=False) as client:
            response = client.get(url, headers=headers, params=query)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {401, 403}:
            raise WhmServiceError("authentication_failed") from exc
        raise WhmServiceError("whm_request_failed") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise WhmServiceError("whm_connection_failed") from exc

    metadata = data.get("metadata")
    if isinstance(metadata, dict) and metadata.get("result") == 0:
        reason = str(metadata.get("reason") or "whm_request_failed")
        if "access denied" in reason.lower() or "invalid" in reason.lower():
            raise WhmServiceError("authentication_failed")
        raise WhmServiceError("whm_request_failed")
    return data


def test_whm_connection(db: Session, server_id: int) -> tuple[bool, str, str | None]:
    server = db.get(Server, server_id)
    try:
        server = _validate_server(server, require_enabled=False)
        _whm_request(server, "version")
    except WhmServiceError as exc:
        if server:
            server.whm_status = "disabled" if exc.code == "server_disabled" else "not_configured" if exc.code.startswith("missing_") else "failed"
            server.last_whm_test_at = datetime.utcnow()
            server.last_whm_error = exc.code
            db.commit()
        return False, server.whm_status if server else "failed", exc.code

    server.whm_status = "connected"
    server.last_whm_test_at = datetime.utcnow()
    server.last_whm_error = None
    db.commit()
    return True, "connected", None


def sync_accounts_for_server(db: Session, server_id: int) -> int:
    server = _validate_server(db.get(Server, server_id))
    data = _whm_request(server, "listaccts")
    accounts = data.get("data", {}).get("acct", [])
    if not isinstance(accounts, list):
        accounts = []

    existing = {account.username: account for account in db.query(Account).filter(Account.server_id == server.id).all()}
    synced_count = 0
    synced_usernames: set[str] = set()
    for item in accounts:
        if not isinstance(item, dict):
            continue
        username = str(item.get("user") or "").strip()
        domain = str(item.get("domain") or "").strip()
        if not username or not domain:
            continue
        synced_usernames.add(username)

        account = existing.get(username) or Account(server_id=server.id, username=username, domain=domain)
        account.domain = domain
        account.owner = _optional_str(item.get("owner"))
        account.package = _optional_str(item.get("plan") or item.get("package"))
        account.ip_address = _optional_str(item.get("ip"))
        account.disk_usage = _optional_str(item.get("diskused"))
        account.disk_limit = _optional_str(item.get("disklimit"))
        account.bandwidth_usage = _optional_str(item.get("bwused") or item.get("bandwidthused"))
        account.bandwidth_limit = _optional_str(item.get("bwlimit") or item.get("bandwidthlimit"))
        account.suspended = str(item.get("suspended") or "0").lower() in {"1", "true", "yes"}
        account.suspension_reason = _optional_str(item.get("suspendreason"))
        db.add(account)
        synced_count += 1

    for username, account in existing.items():
        if username not in synced_usernames:
            db.delete(account)

    server.last_account_sync_at = datetime.utcnow()
    server.whm_status = "connected"
    server.last_whm_error = None
    db.commit()
    return synced_count


def sync_all_accounts(db: Session) -> tuple[int, list[dict[str, str]]]:
    total = 0
    errors: list[dict[str, str]] = []
    servers = db.query(Server).filter(Server.enabled.is_(True)).order_by(Server.hostname.asc()).all()
    for server in servers:
        if not server.whm_username or not server.whm_api_token:
            continue
        server_id = server.id
        hostname = server.hostname
        try:
            total += sync_accounts_for_server(db, server_id)
        except WhmServiceError as exc:
            server.whm_status = "disabled" if exc.code == "server_disabled" else "not_configured" if exc.code.startswith("missing_") else "failed"
            server.last_whm_error = exc.code
            db.commit()
            errors.append({"server": hostname, "error": exc.code})
        except Exception:
            db.rollback()
            current = db.get(Server, server_id)
            if current:
                current.whm_status = "failed"
                current.last_whm_error = "unexpected_sync_error"
                db.commit()
            errors.append({"server": hostname, "error": "unexpected_sync_error"})
    return total, errors


def suspend_account(db: Session, account_id: int) -> None:
    account = db.get(Account, account_id)
    if not account:
        raise WhmServiceError("account_not_found")
    server = _validate_server(account.server)
    _whm_request(server, "suspendacct", {"user": account.username, "reason": "Suspended from NOC Dashboard"})
    account.suspended = True
    account.suspension_reason = account.suspension_reason or "Suspended from NOC Dashboard"
    db.commit()


def unsuspend_account(db: Session, account_id: int) -> None:
    account = db.get(Account, account_id)
    if not account:
        raise WhmServiceError("account_not_found")
    server = _validate_server(account.server)
    _whm_request(server, "unsuspendacct", {"user": account.username})
    account.suspended = False
    account.suspension_reason = None
    db.commit()


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
