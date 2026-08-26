import json
import shlex
import socket
import time
from dataclasses import dataclass
from datetime import datetime
from io import StringIO

import paramiko
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.connection_history import ConnectionHistory
from app.models.monitoring_snapshot import MonitoringSnapshot
from app.models.server import Server
from app.services.secret_service import unprotect_secret


COMMAND_TIMEOUT_SECONDS = 10
COMMAND_OUTPUT_LIMIT_BYTES = 128 * 1024


@dataclass
class CommandResult:
    stdout: str
    stderr: str
    exit_status: int
    stdout_truncated: bool = False
    stderr_truncated: bool = False


class SshServiceError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _validate_server_for_ssh(server: Server, require_enabled: bool = False) -> None:
    if require_enabled and not server.enabled:
        raise SshServiceError("server_disabled", "Server is disabled")
    if not server.hostname:
        raise SshServiceError("invalid_hostname", "Hostname is required")
    if not server.ssh_port or server.ssh_port < 1 or server.ssh_port > 65535:
        raise SshServiceError("invalid_port", "SSH port is invalid")
    if not server.ssh_username:
        raise SshServiceError("missing_username", "SSH username is required")
    if server.ssh_auth_method == "password" and not server.ssh_password:
        raise SshServiceError("missing_password", "SSH password is required")
    if server.ssh_auth_method == "key" and not server.ssh_private_key and not server.ssh_private_key_path:
        raise SshServiceError("missing_private_key", "SSH private key is required")
    if server.ssh_auth_method not in {"password", "key"}:
        raise SshServiceError("invalid_auth_method", "SSH authentication method is invalid")


def _load_private_key(server: Server) -> paramiko.PKey:
    try:
        passphrase = unprotect_secret(server.ssh_key_passphrase)
    except RuntimeError as exc:
        raise SshServiceError("secret_decryption_failed", "SSH key passphrase could not be decrypted") from exc
    key_classes = (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey, paramiko.DSSKey)

    if server.ssh_private_key:
        try:
            key_text = unprotect_secret(server.ssh_private_key)
        except RuntimeError as exc:
            raise SshServiceError("secret_decryption_failed", "SSH private key could not be decrypted") from exc
        for key_class in key_classes:
            try:
                return key_class.from_private_key(StringIO(key_text or ""), password=passphrase)
            except paramiko.PasswordRequiredException as exc:
                raise SshServiceError("missing_key_passphrase", "SSH key passphrase is required") from exc
            except paramiko.SSHException:
                continue

    if server.ssh_private_key_path:
        for key_class in key_classes:
            try:
                return key_class.from_private_key_file(server.ssh_private_key_path, password=passphrase)
            except paramiko.PasswordRequiredException as exc:
                raise SshServiceError("missing_key_passphrase", "SSH key passphrase is required") from exc
            except OSError as exc:
                raise SshServiceError("private_key_file_error", "SSH private key file could not be read") from exc
            except paramiko.SSHException:
                continue

    raise SshServiceError("invalid_private_key", "SSH private key could not be loaded")


def _connect(server: Server) -> paramiko.SSHClient:
    _validate_server_for_ssh(server)
    settings = get_settings()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    connect_kwargs = {
        "hostname": server.hostname,
        "port": server.ssh_port,
        "username": server.ssh_username,
        "look_for_keys": False,
        "allow_agent": False,
        "timeout": settings.ssh_connection_timeout_seconds,
        "auth_timeout": settings.ssh_connection_timeout_seconds,
        "banner_timeout": settings.ssh_connection_timeout_seconds,
    }
    if server.ssh_auth_method == "key":
        connect_kwargs["pkey"] = _load_private_key(server)
    else:
        try:
            connect_kwargs["password"] = unprotect_secret(server.ssh_password)
        except RuntimeError as exc:
            raise SshServiceError("secret_decryption_failed", "SSH password could not be decrypted") from exc
    try:
        client.connect(**connect_kwargs)
    except paramiko.AuthenticationException as exc:
        raise SshServiceError("authentication_failed", "SSH authentication failed") from exc
    except paramiko.SSHException as exc:
        raise SshServiceError("ssh_error", "SSH connection failed") from exc
    except socket.timeout as exc:
        raise SshServiceError("connection_timeout", "SSH connection timed out") from exc
    except socket.gaierror as exc:
        raise SshServiceError("dns_failure", "Hostname could not be resolved") from exc
    except PermissionError as exc:
        raise SshServiceError("permission_denied", "SSH permission denied") from exc
    except OSError as exc:
        raise SshServiceError("connection_failed", "SSH connection failed") from exc
    return client


def _run(client: paramiko.SSHClient, command: str) -> CommandResult:
    stdin, stdout, stderr = client.exec_command(command, timeout=COMMAND_TIMEOUT_SECONDS)
    stdin.close()
    channel = stdout.channel
    channel.settimeout(0.0)
    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []
    stdout_size = 0
    stderr_size = 0
    stdout_truncated = False
    stderr_truncated = False
    deadline = time.monotonic() + COMMAND_TIMEOUT_SECONDS

    while True:
        if channel.recv_ready():
            chunk = channel.recv(4096)
            if stdout_size < COMMAND_OUTPUT_LIMIT_BYTES:
                available = COMMAND_OUTPUT_LIMIT_BYTES - stdout_size
                stdout_chunks.append(chunk[:available])
            stdout_size += len(chunk)
            stdout_truncated = stdout_size > COMMAND_OUTPUT_LIMIT_BYTES
        if channel.recv_stderr_ready():
            chunk = channel.recv_stderr(4096)
            if stderr_size < COMMAND_OUTPUT_LIMIT_BYTES:
                available = COMMAND_OUTPUT_LIMIT_BYTES - stderr_size
                stderr_chunks.append(chunk[:available])
            stderr_size += len(chunk)
            stderr_truncated = stderr_size > COMMAND_OUTPUT_LIMIT_BYTES
        if channel.exit_status_ready():
            break
        if time.monotonic() > deadline:
            channel.close()
            raise SshServiceError("command_timeout", "Command timed out")
        time.sleep(0.02)

    while channel.recv_ready():
        chunk = channel.recv(4096)
        if stdout_size < COMMAND_OUTPUT_LIMIT_BYTES:
            available = COMMAND_OUTPUT_LIMIT_BYTES - stdout_size
            stdout_chunks.append(chunk[:available])
        stdout_size += len(chunk)
        stdout_truncated = stdout_size > COMMAND_OUTPUT_LIMIT_BYTES
    while channel.recv_stderr_ready():
        chunk = channel.recv_stderr(4096)
        if stderr_size < COMMAND_OUTPUT_LIMIT_BYTES:
            available = COMMAND_OUTPUT_LIMIT_BYTES - stderr_size
            stderr_chunks.append(chunk[:available])
        stderr_size += len(chunk)
        stderr_truncated = stderr_size > COMMAND_OUTPUT_LIMIT_BYTES

    exit_status = channel.recv_exit_status()
    return CommandResult(
        stdout=b"".join(stdout_chunks).decode(errors="replace"),
        stderr=b"".join(stderr_chunks).decode(errors="replace"),
        exit_status=exit_status,
        stdout_truncated=stdout_truncated,
        stderr_truncated=stderr_truncated,
    )


def _parse_os_release(output: str) -> tuple[str | None, str | None]:
    values: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        parsed = shlex.split(value) if value else []
        values[key] = parsed[0] if parsed else ""
    return values.get("NAME"), values.get("VERSION")


def _parse_lscpu(output: str) -> tuple[str | None, int | None]:
    model = None
    cores = None
    for line in output.splitlines():
        if line.startswith("Model name:"):
            model = line.split(":", 1)[1].strip()
        if line.startswith("CPU(s):") and cores is None:
            try:
                cores = int(line.split(":", 1)[1].strip())
            except ValueError:
                cores = None
    return model, cores


def _parse_free(output: str) -> dict[str, int | float | None]:
    result = {
        "ram_total": None,
        "ram_used": None,
        "ram_free": None,
        "ram_usage": None,
        "swap_total": None,
        "swap_used": None,
        "swap_free": None,
        "swap_usage": None,
    }
    for line in output.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0].startswith("Mem:") and len(parts) >= 4:
            total, used, free = int(parts[1]), int(parts[2]), int(parts[3])
            result.update({"ram_total": total, "ram_used": used, "ram_free": free, "ram_usage": round((used / total) * 100, 2) if total else 0})
        if parts[0].startswith("Swap:") and len(parts) >= 4:
            total, used, free = int(parts[1]), int(parts[2]), int(parts[3])
            result.update({"swap_total": total, "swap_used": used, "swap_free": free, "swap_usage": round((used / total) * 100, 2) if total else 0})
    return result


def _parse_load_average(uptime_output: str) -> str | None:
    marker = "load average:"
    if marker not in uptime_output:
        return None
    return uptime_output.split(marker, 1)[1].strip()


def parse_load_average_values(uptime_output: str) -> tuple[float | None, float | None, float | None, str | None]:
    raw = _parse_load_average(uptime_output)
    if not raw:
        return None, None, None, None
    values: list[float | None] = []
    for part in raw.replace(",", " ").split()[:3]:
        try:
            values.append(float(part))
        except ValueError:
            values.append(None)
    while len(values) < 3:
        values.append(None)
    display = " / ".join(f"{value:.2f}" for value in values if value is not None)
    return values[0], values[1], values[2], display or None


def parse_proc_uptime_text(output: str) -> str | None:
    first_value = output.split()[0] if output.split() else ""
    try:
        total_seconds = int(float(first_value))
    except ValueError:
        return None

    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60

    if days > 0:
        return f"{days}d {hours}h"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _parse_proc_stat_line(line: str) -> tuple[int, int]:
    parts = [int(value) for value in line.split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    total = sum(parts)
    return idle, total


def _parse_cpu_usage(output: str) -> float | None:
    lines = [line for line in output.splitlines() if line.startswith("cpu ")]
    if len(lines) < 2:
        return None
    idle_a, total_a = _parse_proc_stat_line(lines[0])
    idle_b, total_b = _parse_proc_stat_line(lines[1])
    total_delta = total_b - total_a
    idle_delta = idle_b - idle_a
    if total_delta <= 0:
        return None
    return round(((total_delta - idle_delta) / total_delta) * 100, 1)


def _parse_disks(output: str) -> tuple[list[dict[str, str | float | None]], float | None]:
    disks: list[dict[str, str | float | None]] = []
    highest = None
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        usage = None
        try:
            usage = float(parts[4].rstrip("%"))
            highest = usage if highest is None else max(highest, usage)
        except ValueError:
            usage = None
        disks.append(
            {
                "filesystem": parts[0],
                "size": parts[1],
                "used": parts[2],
                "available": parts[3],
                "usage_percent": usage,
                "mount_point": parts[5],
            }
        )
    return disks, highest


def _record_history(db: Session, server: Server, success: bool, message: str | None = None, error_message: str | None = None) -> None:
    db.add(ConnectionHistory(server_id=server.id, success=success, message=message, error_message=error_message))


def test_connection(db: Session, server_id: int) -> tuple[bool, str, str | None]:
    server = db.get(Server, server_id)
    if not server:
        raise SshServiceError("server_not_found", "Server not found")

    client = None
    try:
        client = _connect(server)
        try:
            result = _run(client, "hostname")
            if result.exit_status != 0:
                raise SshServiceError("command_failed", "Hostname command failed")
        finally:
            client.close()
        server.ssh_status = "connected"
        server.last_ssh_test_at = datetime.utcnow()
        server.last_ssh_error = None
        _record_history(db, server, True, message="connected")
        db.commit()
        return True, "connected", None
    except SshServiceError as exc:
        server.ssh_status = "not_configured" if exc.code in {"missing_username", "missing_password", "missing_private_key"} else "failed"
        server.last_ssh_test_at = datetime.utcnow()
        server.last_ssh_error = exc.code
        _record_history(db, server, False, error_message=exc.code)
        db.commit()
        return False, server.ssh_status, exc.code


def collect_metrics(db: Session, server_id: int) -> MonitoringSnapshot:
    server = db.get(Server, server_id)
    if not server:
        raise SshServiceError("server_not_found", "Server not found")
    _validate_server_for_ssh(server, require_enabled=True)

    client = _connect(server)
    try:
        hostname = _run(client, "hostname").stdout.strip()
        kernel = _run(client, "uname -r").stdout.strip()
        os_name, os_version = _parse_os_release(_run(client, "cat /etc/os-release").stdout)
        uptime = _run(client, "uptime").stdout.strip()
        uptime_text = parse_proc_uptime_text(_run(client, "cat /proc/uptime").stdout)
        cpu_usage = _parse_cpu_usage(_run(client, "sh -c \"cat /proc/stat; sleep 1; cat /proc/stat\"").stdout)
        lscpu = _run(client, "lscpu").stdout
        free = _parse_free(_run(client, "free -m").stdout)
        disks, highest_disk = _parse_disks(_run(client, "df -hP").stdout)
        nproc_output = _run(client, "nproc").stdout.strip()
    finally:
        client.close()

    cpu_model, cpu_cores = _parse_lscpu(lscpu)
    if cpu_cores is None:
        try:
            cpu_cores = int(nproc_output)
        except ValueError:
            cpu_cores = None
    load_average_1, load_average_5, load_average_15, load_average = parse_load_average_values(uptime)

    snapshot = MonitoringSnapshot(
        server_id=server.id,
        hostname=hostname,
        os_name=os_name,
        os_version=os_version,
        kernel=kernel,
        uptime=uptime_text,
        uptime_text=uptime_text,
        cpu_model=cpu_model,
        cpu_cores=cpu_cores,
        cpu_usage=cpu_usage,
        load_average=load_average,
        load_average_1=load_average_1,
        load_average_5=load_average_5,
        load_average_15=load_average_15,
        ram_total=free["ram_total"],
        ram_used=free["ram_used"],
        ram_free=free["ram_free"],
        ram_usage=free["ram_usage"],
        swap_total=free["swap_total"],
        swap_used=free["swap_used"],
        swap_free=free["swap_free"],
        swap_usage=free["swap_usage"],
        disk_highest_usage=highest_disk,
        raw_disk_json=json.dumps(disks),
    )
    server.ssh_status = "connected"
    server.last_checked_at = datetime.utcnow()
    server.last_ssh_error = None
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot
