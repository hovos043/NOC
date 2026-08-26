import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.setting import Setting
from app.services.secret_service import is_protected_secret, protect_secret

CURRENT_SCHEMA_VERSION = "4.5"
SECRET_COLUMNS = ("ssh_password", "ssh_private_key", "ssh_key_passphrase", "whm_api_token")

SERVER_COLUMN_MIGRATIONS = {
    "ssh_auth_method": "ALTER TABLE servers ADD COLUMN ssh_auth_method VARCHAR(20) NOT NULL DEFAULT 'password'",
    "ssh_password": "ALTER TABLE servers ADD COLUMN ssh_password TEXT",
    "ssh_private_key": "ALTER TABLE servers ADD COLUMN ssh_private_key TEXT",
    "ssh_private_key_path": "ALTER TABLE servers ADD COLUMN ssh_private_key_path VARCHAR(500)",
    "ssh_key_passphrase": "ALTER TABLE servers ADD COLUMN ssh_key_passphrase TEXT",
    "ssh_key_type": "ALTER TABLE servers ADD COLUMN ssh_key_type VARCHAR(80)",
    "ssh_status": "ALTER TABLE servers ADD COLUMN ssh_status VARCHAR(40) NOT NULL DEFAULT 'never_tested'",
    "last_ssh_test_at": "ALTER TABLE servers ADD COLUMN last_ssh_test_at DATETIME",
    "last_ssh_error": "ALTER TABLE servers ADD COLUMN last_ssh_error TEXT",
    "last_checked_at": "ALTER TABLE servers ADD COLUMN last_checked_at DATETIME",
    "whm_username": "ALTER TABLE servers ADD COLUMN whm_username VARCHAR(120)",
    "whm_status": "ALTER TABLE servers ADD COLUMN whm_status VARCHAR(40) NOT NULL DEFAULT 'never_tested'",
    "last_whm_test_at": "ALTER TABLE servers ADD COLUMN last_whm_test_at DATETIME",
    "last_whm_error": "ALTER TABLE servers ADD COLUMN last_whm_error TEXT",
    "last_account_sync_at": "ALTER TABLE servers ADD COLUMN last_account_sync_at DATETIME",
}

SNAPSHOT_COLUMN_MIGRATIONS = {
    "uptime_text": "ALTER TABLE monitoring_snapshots ADD COLUMN uptime_text VARCHAR(120)",
    "load_average_1": "ALTER TABLE monitoring_snapshots ADD COLUMN load_average_1 FLOAT",
    "load_average_5": "ALTER TABLE monitoring_snapshots ADD COLUMN load_average_5 FLOAT",
    "load_average_15": "ALTER TABLE monitoring_snapshots ADD COLUMN load_average_15 FLOAT",
}

EXPECTED_COLUMNS = {
    "servers": {
        "id",
        "display_name",
        "hostname",
        "ip_address",
        "provider",
        "ssh_port",
        "ssh_username",
        "ssh_key_path",
        "ssh_auth_method",
        "ssh_password",
        "ssh_private_key",
        "ssh_private_key_path",
        "ssh_key_passphrase",
        "ssh_key_type",
        "ssh_status",
        "last_ssh_test_at",
        "last_ssh_error",
        "last_checked_at",
        "whm_hostname",
        "whm_port",
        "whm_username",
        "whm_api_token",
        "whm_status",
        "last_whm_test_at",
        "last_whm_error",
        "last_account_sync_at",
        "notes",
        "enabled",
        "created_at",
        "updated_at",
    },
    "settings": {
        "id",
        "key",
        "value",
        "created_at",
        "updated_at",
    },
    "monitoring_snapshots": {
        "id",
        "server_id",
        "hostname",
        "os_name",
        "os_version",
        "kernel",
        "uptime",
        "uptime_text",
        "cpu_model",
        "cpu_cores",
        "cpu_usage",
        "load_average",
        "load_average_1",
        "load_average_5",
        "load_average_15",
        "ram_total",
        "ram_used",
        "ram_free",
        "ram_usage",
        "swap_total",
        "swap_used",
        "swap_free",
        "swap_usage",
        "disk_highest_usage",
        "raw_disk_json",
        "collected_at",
    },
    "connection_history": {
        "id",
        "server_id",
        "success",
        "message",
        "error_message",
        "created_at",
    },
    "accounts": {
        "id",
        "server_id",
        "domain",
        "username",
        "owner",
        "package",
        "ip_address",
        "disk_usage",
        "disk_limit",
        "bandwidth_usage",
        "bandwidth_limit",
        "suspended",
        "suspension_reason",
        "created_at",
        "updated_at",
    },
    "account_notes": {
        "id",
        "account_id",
        "note",
        "created_at",
    },
    "command_history": {
        "id",
        "server_id",
        "command",
        "exit_code",
        "status",
        "stdout_preview",
        "stderr_preview",
        "duration_ms",
        "created_at",
    },
    "audit_logs": {
        "id",
        "server_id",
        "hostname",
        "username",
        "action_type",
        "command",
        "is_dangerous",
        "was_confirmed",
        "status",
        "exit_code",
        "stdout_preview",
        "stderr_preview",
        "duration_ms",
        "created_at",
    },
    "saved_commands": {
        "id",
        "title",
        "command",
        "category",
        "created_at",
        "updated_at",
    },
    "terminal_sessions": {
        "id",
        "server_id",
        "hostname",
        "ssh_username",
        "started_at",
        "ended_at",
        "duration_ms",
        "status",
        "disconnect_reason",
        "created_at",
    },
}


def apply_sqlite_migrations() -> None:
    inspector = inspect(engine)
    if "servers" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("servers")}
    with engine.begin() as connection:
        for column_name, statement in SERVER_COLUMN_MIGRATIONS.items():
            if column_name not in columns:
                connection.execute(text(statement))

    inspector = inspect(engine)
    if "accounts" in inspector.get_table_names() and "account_notes" not in inspector.get_table_names():
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE account_notes ("
                    "id INTEGER NOT NULL PRIMARY KEY, "
                    "account_id INTEGER NOT NULL, "
                    "note TEXT NOT NULL, "
                    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, "
                    "FOREIGN KEY(account_id) REFERENCES accounts (id) ON DELETE CASCADE"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_account_notes_id ON account_notes (id)"))
            connection.execute(text("CREATE INDEX ix_account_notes_account_id ON account_notes (account_id)"))

    if "monitoring_snapshots" not in inspector.get_table_names():
        return

    snapshot_columns = {column["name"] for column in inspector.get_columns("monitoring_snapshots")}
    with engine.begin() as connection:
        for column_name, statement in SNAPSHOT_COLUMN_MIGRATIONS.items():
            if column_name not in snapshot_columns:
                connection.execute(text(statement))

    create_operational_indexes()


def create_operational_indexes() -> None:
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_accounts_server_suspended ON accounts (server_id, suspended)",
        "CREATE INDEX IF NOT EXISTS ix_accounts_server_package ON accounts (server_id, package)",
        "CREATE INDEX IF NOT EXISTS ix_accounts_package ON accounts (package)",
        "CREATE INDEX IF NOT EXISTS ix_accounts_owner ON accounts (owner)",
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_server_created ON audit_logs (server_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_command_history_server_created ON command_history (server_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_monitoring_snapshots_server_collected ON monitoring_snapshots (server_id, collected_at)",
    ]
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for statement in statements:
            table_name = statement.split(" ON ", 1)[1].split(" ", 1)[0]
            if table_name in existing_tables:
                connection.execute(text(statement))


def encrypt_legacy_plaintext_secrets(db: Session) -> None:
    inspector = inspect(engine)
    if "servers" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("servers")}
    present_secret_columns = [column for column in SECRET_COLUMNS if column in columns]
    if not present_secret_columns:
        return

    rows = db.execute(text(f"SELECT id, {', '.join(present_secret_columns)} FROM servers")).mappings().all()
    rows_to_update = []
    for row in rows:
        encrypted_values: dict[str, str] = {}
        for column in present_secret_columns:
            value = row[column]
            if value and not is_protected_secret(value):
                encrypted_values[column] = protect_secret(value)
        if encrypted_values:
            rows_to_update.append((row["id"], encrypted_values))

    if not rows_to_update:
        return

    _backup_database_before_secret_migration()
    for server_id, encrypted_values in rows_to_update:
        assignments = ", ".join(f"{column} = :{column}" for column in encrypted_values)
        db.execute(text(f"UPDATE servers SET {assignments} WHERE id = :server_id"), {**encrypted_values, "server_id": server_id})
    db.commit()


def _backup_database_before_secret_migration() -> None:
    backup_database("before-secret-encryption")


def backup_database(reason: str = "startup") -> Path | None:
    database_path = engine.url.database
    if not database_path:
        return None
    source = Path(database_path)
    if not source.exists():
        return None
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    backup = source.with_name(f"{source.stem}.{reason}-{stamp}{source.suffix}")
    shutil.copy2(source, backup)
    return backup


def backup_database_once_per_day(reason: str = "startup") -> Path | None:
    database_path = engine.url.database
    if not database_path:
        return None
    source = Path(database_path)
    if not source.exists():
        return None
    today = datetime.utcnow().strftime("%Y%m%d")
    pattern = f"{source.stem}.{reason}-{today}*{source.suffix}"
    if any(source.parent.glob(pattern)):
        return None
    return backup_database(reason)


def verify_phase2_schema(db: Session) -> None:
    apply_sqlite_migrations()
    encrypt_legacy_plaintext_secrets(db)
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, expected_columns in EXPECTED_COLUMNS.items():
        if table_name not in existing_tables:
            raise RuntimeError(f"Missing required table: {table_name}")

        columns = {column["name"] for column in inspector.get_columns(table_name)}
        missing_columns = expected_columns - columns
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise RuntimeError(f"Missing required columns in {table_name}: {missing}")

    schema_version = db.query(Setting).filter(Setting.key == "schema_version").first()
    if schema_version:
        schema_version.value = CURRENT_SCHEMA_VERSION
    else:
        db.add(Setting(key="schema_version", value=CURRENT_SCHEMA_VERSION))
    db.commit()
