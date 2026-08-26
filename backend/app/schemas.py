from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


MASKED_SECRET = "********"


class ServerBase(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    hostname: str = Field(min_length=1, max_length=255)
    ip_address: str | None = None
    provider: str | None = None
    ssh_port: int = Field(default=22, ge=1, le=65535)
    ssh_username: str | None = None
    ssh_key_path: str | None = None
    ssh_auth_method: Literal["password", "key"] = "password"
    ssh_private_key_path: str | None = None
    ssh_key_type: str | None = None
    whm_hostname: str | None = None
    whm_port: int = Field(default=2087, ge=1, le=65535)
    whm_username: str | None = None
    notes: str | None = None
    enabled: bool = False


class ServerWrite(ServerBase):
    ssh_password: str | None = None
    ssh_private_key: str | None = None
    ssh_key_passphrase: str | None = None
    whm_api_token: str | None = None


class ServerCreate(ServerWrite):
    pass


class ServerUpdate(ServerWrite):
    pass


class ServerRead(ServerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    has_whm_api_token: bool = False
    has_ssh_password: bool = False
    has_ssh_private_key: bool = False
    has_ssh_key_passphrase: bool = False
    ssh_status: Literal["never_tested", "connected", "failed", "disabled", "not_configured"] = "never_tested"
    whm_status: Literal["never_tested", "connected", "failed", "disabled", "not_configured"] = "never_tested"
    last_ssh_test_at: datetime | None = None
    last_ssh_error: str | None = None
    last_whm_test_at: datetime | None = None
    last_whm_error: str | None = None
    last_account_sync_at: datetime | None = None
    last_checked_at: datetime | None = None
    accounts_count: int = 0
    suspended_accounts_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class DiskUsage(BaseModel):
    filesystem: str
    size: str
    used: str
    available: str
    usage_percent: float | None = None
    mount_point: str


class MonitoringSnapshotRead(BaseModel):
    id: int
    server_id: int
    hostname: str | None = None
    os_name: str | None = None
    os_version: str | None = None
    kernel: str | None = None
    uptime: str | None = None
    uptime_text: str | None = None
    cpu_model: str | None = None
    cpu_cores: int | None = None
    cpu_usage: float | None = None
    load_average: str | None = None
    load_average_1: float | None = None
    load_average_5: float | None = None
    load_average_15: float | None = None
    ram_total: int | None = None
    ram_used: int | None = None
    ram_free: int | None = None
    ram_usage: float | None = None
    swap_total: int | None = None
    swap_used: int | None = None
    swap_free: int | None = None
    swap_usage: float | None = None
    disk_highest_usage: float | None = None
    disks: list[DiskUsage] = Field(default_factory=list)
    collected_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConnectionHistoryRead(BaseModel):
    id: int
    server_id: int
    success: bool
    message: str | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SshActionResult(BaseModel):
    success: bool
    status: str
    message: str | None = None
    error_message: str | None = None
    snapshot: MonitoringSnapshotRead | None = None


class WhmActionResult(BaseModel):
    success: bool
    status: str
    message: str | None = None
    error_message: str | None = None
    synced_count: int | None = None
    errors: list["WhmSyncError"] = Field(default_factory=list)


class WhmSyncError(BaseModel):
    server: str
    error: str


class AccountRead(BaseModel):
    id: int
    server_id: int
    server_hostname: str
    server_display_name: str
    server_whm_hostname: str | None = None
    server_whm_port: int = 2087
    domain: str
    username: str
    owner: str | None = None
    package: str | None = None
    ip_address: str | None = None
    disk_usage: str | None = None
    disk_limit: str | None = None
    bandwidth_usage: str | None = None
    bandwidth_limit: str | None = None
    suspended: bool
    suspension_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AccountNoteRead(BaseModel):
    id: int
    account_id: int
    note: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccountNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=5000)


class AccountListResponse(BaseModel):
    items: list[AccountRead]
    total: int
    page: int
    page_size: int
    total_accounts: int = 0
    active_accounts: int = 0
    suspended_accounts: int = 0
    servers_count: int = 0
    servers: list["AccountServerOption"] = Field(default_factory=list)
    packages: list[str] = Field(default_factory=list)
    server_overview: "AccountServerOverview | None" = None


class AccountServerOption(BaseModel):
    id: int
    hostname: str


class AccountServerOverview(BaseModel):
    server_id: int
    server_name: str
    accounts_count: int
    active_accounts: int
    suspended_accounts: int
    last_sync_time: datetime | None = None


class AccountSearchResult(BaseModel):
    id: int
    server: str
    username: str
    domain: str
    package: str | None = None
    status: str


class TerminalConnectResult(BaseModel):
    success: bool
    status: str
    error_message: str | None = None


class CommandSafetyResult(BaseModel):
    command: str
    is_dangerous: bool
    is_blocked: bool
    reason: str | None = None
    confirmation_text: str = "I understand"


class CommandPrepareRequest(BaseModel):
    command: str = Field(min_length=1)


class CommandExecuteRequest(BaseModel):
    command: str = Field(min_length=1)
    confirmation_text: str | None = None


class CommandExecuteResult(BaseModel):
    command: str
    stdout: str
    stderr: str
    exit_code: int | None = None
    status: str
    duration_ms: int
    is_dangerous: bool
    was_confirmed: bool
    stdout_truncated: bool = False
    stderr_truncated: bool = False


class CommandHistoryRead(BaseModel):
    id: int
    server_id: int
    command: str
    exit_code: int | None = None
    status: str
    stdout_preview: str | None = None
    stderr_preview: str | None = None
    duration_ms: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogRead(BaseModel):
    id: int
    server_id: int | None = None
    hostname: str | None = None
    username: str | None = None
    action_type: str
    command: str | None = None
    is_dangerous: bool
    was_confirmed: bool
    status: str
    exit_code: int | None = None
    stdout_preview: str | None = None
    stderr_preview: str | None = None
    duration_ms: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SavedCommandBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    command: str = Field(min_length=1)
    category: Literal["System", "Disk", "Memory", "Services", "Mail", "Logs", "Custom"] = "Custom"


class SavedCommandCreate(SavedCommandBase):
    pass


class SavedCommandUpdate(SavedCommandBase):
    pass


class SavedCommandRead(SavedCommandBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServerContextRead(BaseModel):
    id: int
    display_name: str
    hostname: str
    enabled: bool
    ssh_status: str
    whm_status: str
    accounts_count: int
    last_checked_at: datetime | None = None
    latest_metrics: MonitoringSnapshotRead | None = None


class AppSettings(BaseModel):
    language: Literal["en", "hy", "ru"] = "en"
    theme: Literal["dark", "light"] = "dark"
    default_monitoring_interval_minutes: int = Field(default=5, ge=1, le=1440)


class DiagnosticsServerStatus(BaseModel):
    id: int
    display_name: str
    hostname: str
    enabled: bool
    ssh_status: str
    whm_status: str
    last_whm_error: str | None = None
    last_account_sync_at: datetime | None = None


class DiagnosticsRead(BaseModel):
    status: str
    app_name: str
    backend_pid: int
    backend_host: str
    backend_port: int
    database_path: str | None = None
    schema_version: str
    servers_count: int
    enabled_servers_count: int
    accounts_count: int
    audit_logs_count: int
    command_history_count: int
    latest_backup: str | None = None
    servers: list[DiagnosticsServerStatus]
