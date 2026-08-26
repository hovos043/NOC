import asyncio

from app.config import get_settings
from app.database import SessionLocal
from app.models.server import Server
from app.routers.settings import get_int_value
from app.services.ssh_service import SshServiceError, collect_metrics


async def start_monitoring_scheduler(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        await asyncio.to_thread(_monitor_enabled_servers)
        interval_minutes = await asyncio.to_thread(_get_interval_minutes)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=max(interval_minutes, 1) * 60)
        except asyncio.TimeoutError:
            continue


def _get_interval_minutes() -> int:
    db = SessionLocal()
    try:
        return get_int_value(db, "default_monitoring_interval_minutes", get_settings().default_monitoring_interval_minutes)
    finally:
        db.close()


def _monitor_enabled_servers() -> None:
    db = SessionLocal()
    try:
        servers = db.query(Server).filter(Server.enabled.is_(True)).order_by(Server.hostname.asc()).all()
        for server in servers:
            try:
                collect_metrics(db, server.id)
            except SshServiceError as exc:
                server.ssh_status = "not_configured" if exc.code in {"missing_username", "missing_password", "missing_private_key"} else "failed"
                server.last_ssh_error = exc.code
                db.commit()
            except Exception:
                server.ssh_status = "failed"
                server.last_ssh_error = "monitoring_failed"
                db.commit()
    finally:
        db.close()
