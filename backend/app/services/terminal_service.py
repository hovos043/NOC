import re
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.command_history import CommandHistory
from app.models.server import Server
from app.services.ssh_service import SshServiceError, _connect, _run, _validate_server_for_ssh


CONFIRMATION_TEXT = "I understand"
PREVIEW_LIMIT = 1000

BLOCKED_PATTERNS = [
    re.compile(r"(^|[;&|]\s*)rm\s+-rf\s+/$"),
    re.compile(r"(^|[;&|]\s*)rm\s+-rf\s+/\*"),
    re.compile(r"(^|[;&|]\s*)mkfs\b"),
    re.compile(r"(^|[;&|]\s*)dd\s+if="),
    re.compile(r":\(\)\{\s*:\|:&\s*\};:"),
]

DANGEROUS_PATTERNS = [
    (re.compile(r"\brm\s+-rf\b"), "recursive_delete"),
    (re.compile(r"\bmkfs\b"), "filesystem_format"),
    (re.compile(r"\bdd\s+if="), "raw_disk_write"),
    (re.compile(r"\bshutdown\b"), "shutdown"),
    (re.compile(r"\breboot\b"), "reboot"),
    (re.compile(r"\binit\s+0\b"), "shutdown"),
    (re.compile(r"\bsystemctl\s+stop\b"), "service_stop"),
    (re.compile(r"\bsystemctl\s+disable\b"), "service_disable"),
    (re.compile(r"\biptables\s+-F\b"), "firewall_flush"),
    (re.compile(r"\bfirewall-cmd\s+--reload\b"), "firewall_reload"),
    (re.compile(r"\bpasswd\b"), "password_change"),
    (re.compile(r"\buserdel\b"), "user_delete"),
    (re.compile(r"\bgroupdel\b"), "group_delete"),
    (re.compile(r":\(\)\{\s*:\|:&\s*\};:"), "fork_bomb"),
]

SECRET_PATTERNS = [
    re.compile(r"(?i)(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+"),
]


def check_command_safety(command: str) -> dict[str, str | bool | None]:
    normalized = command.strip()
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(normalized):
            return {"command": command, "is_dangerous": True, "is_blocked": True, "reason": "blocked_command"}
    for pattern, reason in DANGEROUS_PATTERNS:
        if pattern.search(normalized):
            return {"command": command, "is_dangerous": True, "is_blocked": False, "reason": reason}
    return {"command": command, "is_dangerous": False, "is_blocked": False, "reason": None}


def connect_terminal(db: Session, server_id: int) -> tuple[bool, str, str | None]:
    server = db.get(Server, server_id)
    if not server:
        raise SshServiceError("server_not_found", "Server not found")
    if not server.enabled:
        return False, "disconnected", "server_disabled"
    try:
        _validate_server_for_ssh(server, require_enabled=True)
        client = _connect(server)
        client.close()
    except SshServiceError as exc:
        status = "not_configured" if exc.code in {"missing_username", "missing_password", "missing_private_key"} else "error"
        return False, status, exc.code
    return True, "connected", None


def execute_command(db: Session, server_id: int, command: str, confirmation_text: str | None = None) -> dict[str, object]:
    server = db.get(Server, server_id)
    if not server:
        raise SshServiceError("server_not_found", "Server not found")
    if not server.enabled:
        raise SshServiceError("server_disabled", "Server is disabled")

    safety = check_command_safety(command)
    is_dangerous = bool(safety["is_dangerous"])
    is_blocked = bool(safety["is_blocked"])
    was_confirmed = confirmation_text == CONFIRMATION_TEXT

    if is_blocked:
        _record_command(db, server, command, is_dangerous, was_confirmed, "blocked", None, "", "This command is blocked for safety.", 0)
        raise SshServiceError("blocked_command", "This command is blocked for safety.")
    if is_dangerous and not was_confirmed:
        _record_command(db, server, command, is_dangerous, False, "confirmation_required", None, "", "Dangerous command confirmation required.", 0)
        raise SshServiceError("confirmation_required", "Dangerous command confirmation required.")

    started = time.perf_counter()
    started_at = datetime.utcnow()
    client = _connect(server)
    try:
        result = _run(client, command)
    finally:
        client.close()
    duration_ms = int((time.perf_counter() - started) * 1000)
    status = "success" if result.exit_status == 0 else "failed"
    _record_command(db, server, command, is_dangerous, was_confirmed, status, result.exit_status, result.stdout, result.stderr, duration_ms, started_at)
    return {
        "command": command,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_status,
        "status": status,
        "duration_ms": duration_ms,
        "is_dangerous": is_dangerous,
        "was_confirmed": was_confirmed,
        "stdout_truncated": result.stdout_truncated,
        "stderr_truncated": result.stderr_truncated,
    }


def _record_command(
    db: Session,
    server: Server,
    command: str,
    is_dangerous: bool,
    was_confirmed: bool,
    status: str,
    exit_code: int | None,
    stdout: str,
    stderr: str,
    duration_ms: int,
    started_at: datetime | None = None,
) -> None:
    stdout_preview = _preview(stdout)
    stderr_preview = _preview(stderr)
    db.add(
        CommandHistory(
            server_id=server.id,
            command=_mask(command),
            exit_code=exit_code,
            status=status,
            stdout_preview=stdout_preview,
            stderr_preview=stderr_preview,
            duration_ms=duration_ms,
        )
    )
    db.add(
        AuditLog(
            server_id=server.id,
            hostname=server.hostname,
            username=server.ssh_username,
            action_type="command_execute",
            command=_mask(command),
            is_dangerous=is_dangerous,
            was_confirmed=was_confirmed,
            status=status,
            exit_code=exit_code,
            stdout_preview=stdout_preview,
            stderr_preview=stderr_preview,
            duration_ms=duration_ms,
            created_at=started_at or datetime.utcnow(),
        )
    )
    db.commit()


def _preview(value: str) -> str:
    return _mask(value)[:PREVIEW_LIMIT]


def _mask(value: str) -> str:
    masked = value
    for pattern in SECRET_PATTERNS:
        masked = pattern.sub(lambda match: match.group(0).split("=", 1)[0].split(":", 1)[0] + "=********", masked)
    return masked
