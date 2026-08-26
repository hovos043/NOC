import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.server import Server
from app.models.connection_history import ConnectionHistory
from app.models.monitoring_snapshot import MonitoringSnapshot
from app.schemas import (
    MASKED_SECRET,
    ConnectionHistoryRead,
    DiskUsage,
    MonitoringSnapshotRead,
    ServerCreate,
    ServerRead,
    ServerUpdate,
    SshActionResult,
    WhmActionResult,
)
from app.services.ssh_service import SshServiceError, collect_metrics, parse_load_average_values, test_connection
from app.services.secret_service import protect_secret, unprotect_secret
from app.services.whm_service import WhmServiceError, sync_accounts_for_server, test_whm_connection

router = APIRouter(prefix="/servers", tags=["servers"])


def _has_usable_secret(value: str | None) -> bool:
    if not value:
        return False
    try:
        unprotect_secret(value)
    except Exception:
        return False
    return True


def _keep_existing_secret(new_value: str | None, existing_value: str | None) -> str | None:
    if new_value and new_value != MASKED_SECRET:
        return protect_secret(new_value)
    return existing_value if _has_usable_secret(existing_value) else None


def _protect_write_secrets(data: dict) -> dict:
    if data.get("ssh_auth_method") == "key":
        data["ssh_password"] = None
    for key in ("whm_api_token", "ssh_password", "ssh_private_key", "ssh_key_passphrase"):
        if data.get(key):
            data[key] = protect_secret(data[key])
    return data


def to_read(server: Server, db: Session | None = None) -> ServerRead:
    payload = ServerRead.model_validate(server)
    payload.has_whm_api_token = _has_usable_secret(server.whm_api_token)
    payload.has_ssh_password = _has_usable_secret(server.ssh_password)
    payload.has_ssh_private_key = _has_usable_secret(server.ssh_private_key)
    payload.has_ssh_key_passphrase = _has_usable_secret(server.ssh_key_passphrase)
    if db:
        payload.accounts_count = db.query(Account).filter(Account.server_id == server.id).count()
        payload.suspended_accounts_count = db.query(Account).filter(Account.server_id == server.id, Account.suspended.is_(True)).count()
    return payload


def snapshot_to_read(snapshot: MonitoringSnapshot | None) -> MonitoringSnapshotRead | None:
    if snapshot is None:
        return None
    payload = MonitoringSnapshotRead.model_validate(snapshot)
    if payload.uptime_text:
        payload.uptime = payload.uptime_text
    else:
        payload.uptime = None
    if not payload.load_average and snapshot.uptime:
        load_1, load_5, load_15, display = parse_load_average_values(snapshot.uptime)
        payload.load_average_1 = load_1
        payload.load_average_5 = load_5
        payload.load_average_15 = load_15
        payload.load_average = display
    if snapshot.raw_disk_json:
        payload.disks = [DiskUsage(**item) for item in json.loads(snapshot.raw_disk_json)]
    return payload


@router.get("", response_model=list[ServerRead])
def list_servers(db: Session = Depends(get_db)) -> list[ServerRead]:
    servers = db.query(Server).order_by(Server.hostname.asc()).all()
    return [to_read(server, db) for server in servers]


@router.post("", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
def create_server(server_in: ServerCreate, db: Session = Depends(get_db)) -> ServerRead:
    data = _protect_write_secrets(server_in.model_dump())
    server = Server(**data)
    db.add(server)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="hostname_exists") from exc
    db.refresh(server)
    return to_read(server, db)


@router.get("/{server_id}", response_model=ServerRead)
def get_server(server_id: int, db: Session = Depends(get_db)) -> ServerRead:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    return to_read(server, db)


@router.put("/{server_id}", response_model=ServerRead)
def update_server(server_id: int, server_in: ServerUpdate, db: Session = Depends(get_db)) -> ServerRead:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")

    data = server_in.model_dump()
    data["whm_api_token"] = _keep_existing_secret(data.get("whm_api_token"), server.whm_api_token)
    data["ssh_password"] = _keep_existing_secret(data.get("ssh_password"), server.ssh_password)
    data["ssh_private_key"] = _keep_existing_secret(data.get("ssh_private_key"), server.ssh_private_key)
    data["ssh_key_passphrase"] = _keep_existing_secret(data.get("ssh_key_passphrase"), server.ssh_key_passphrase)
    if data.get("ssh_auth_method") == "key":
        data["ssh_password"] = None

    for key, value in data.items():
        setattr(server, key, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="hostname_exists") from exc
    db.refresh(server)
    return to_read(server, db)


@router.post("/{server_id}/clone", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
def clone_server(server_id: int, db: Session = Depends(get_db)) -> ServerRead:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")

    base_hostname = f"{server.hostname}-copy"
    hostname = base_hostname
    index = 2
    while db.query(Server).filter(Server.hostname == hostname).first():
        hostname = f"{base_hostname}-{index}"
        index += 1

    clone = Server(
        display_name=hostname,
        hostname=hostname,
        ip_address=server.ip_address,
        provider=server.provider,
        ssh_port=server.ssh_port,
        ssh_username=server.ssh_username,
        ssh_key_path=server.ssh_key_path,
        ssh_auth_method=server.ssh_auth_method,
        ssh_password=None,
        ssh_private_key=None,
        ssh_private_key_path=server.ssh_private_key_path,
        ssh_key_passphrase=None,
        ssh_key_type=server.ssh_key_type,
        ssh_status="never_tested",
        whm_hostname=server.whm_hostname,
        whm_port=server.whm_port,
        whm_username=server.whm_username,
        whm_api_token=None,
        whm_status="never_tested",
        notes=server.notes,
        enabled=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return to_read(clone, db)


@router.patch("/{server_id}/enabled", response_model=ServerRead)
def set_server_enabled(server_id: int, enabled: bool, db: Session = Depends(get_db)) -> ServerRead:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    server.enabled = enabled
    db.commit()
    db.refresh(server)
    return to_read(server, db)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(server_id: int, db: Session = Depends(get_db)) -> None:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    db.delete(server)
    db.commit()


@router.post("/{server_id}/test-ssh", response_model=SshActionResult)
def test_ssh(server_id: int, db: Session = Depends(get_db)) -> SshActionResult:
    success, ssh_status, error = test_connection(db, server_id)
    return SshActionResult(success=success, status=ssh_status, message="connected" if success else None, error_message=error)


@router.post("/{server_id}/test-whm", response_model=WhmActionResult)
def test_whm(server_id: int, db: Session = Depends(get_db)) -> WhmActionResult:
    success, whm_status, error = test_whm_connection(db, server_id)
    return WhmActionResult(success=success, status=whm_status, message="connected" if success else None, error_message=error)


@router.post("/{server_id}/sync-accounts", response_model=WhmActionResult)
def sync_server_accounts(server_id: int, db: Session = Depends(get_db)) -> WhmActionResult:
    try:
        synced_count = sync_accounts_for_server(db, server_id)
    except WhmServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc
    return WhmActionResult(success=True, status="connected", message="accounts_synced", synced_count=synced_count)


@router.post("/{server_id}/refresh", response_model=SshActionResult)
def refresh_server(server_id: int, db: Session = Depends(get_db)) -> SshActionResult:
    server = db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="server_not_found")
    if not server.enabled:
        server.ssh_status = "disabled"
        db.commit()
        return SshActionResult(success=False, status="disabled", error_message="server_disabled")
    try:
        snapshot = collect_metrics(db, server_id)
        return SshActionResult(success=True, status="connected", message="metrics_collected", snapshot=snapshot_to_read(snapshot))
    except SshServiceError as exc:
        server.ssh_status = "not_configured" if exc.code in {"missing_username", "missing_password", "missing_private_key"} else "failed"
        server.last_ssh_error = exc.code
        db.commit()
        return SshActionResult(success=False, status=server.ssh_status, error_message=exc.code)


@router.post("/refresh-enabled", response_model=list[SshActionResult])
def refresh_enabled_servers(db: Session = Depends(get_db)) -> list[SshActionResult]:
    results: list[SshActionResult] = []
    enabled_servers = db.query(Server).filter(Server.enabled.is_(True)).order_by(Server.hostname.asc()).all()
    for server in enabled_servers:
        try:
            snapshot = collect_metrics(db, server.id)
            results.append(SshActionResult(success=True, status="connected", message=server.hostname, snapshot=snapshot_to_read(snapshot)))
        except SshServiceError as exc:
            server.ssh_status = "not_configured" if exc.code in {"missing_username", "missing_password", "missing_private_key"} else "failed"
            server.last_ssh_error = exc.code
            db.commit()
            results.append(SshActionResult(success=False, status=server.ssh_status, message=server.hostname, error_message=exc.code))
    return results


@router.get("/{server_id}/metrics/latest", response_model=MonitoringSnapshotRead | None)
def latest_metrics(server_id: int, db: Session = Depends(get_db)) -> MonitoringSnapshotRead | None:
    snapshot = (
        db.query(MonitoringSnapshot)
        .filter(MonitoringSnapshot.server_id == server_id)
        .order_by(MonitoringSnapshot.collected_at.desc())
        .first()
    )
    return snapshot_to_read(snapshot)


@router.get("/{server_id}/connection-history", response_model=list[ConnectionHistoryRead])
def connection_history(server_id: int, db: Session = Depends(get_db)) -> list[ConnectionHistoryRead]:
    return (
        db.query(ConnectionHistory)
        .filter(ConnectionHistory.server_id == server_id)
        .order_by(ConnectionHistory.created_at.desc())
        .limit(50)
        .all()
    )
