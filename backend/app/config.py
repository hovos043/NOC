import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_database_url() -> str:
    data_dir = os.getenv("NAMEAM_NOC_DATA_DIR")
    if data_dir:
        root = Path(data_dir)
        root.mkdir(parents=True, exist_ok=True)
        (root / "logs").mkdir(parents=True, exist_ok=True)
        settings_file = root / "settings.json"
        if not settings_file.exists():
            settings_file.write_text("{}\n", encoding="utf-8")
        return f"sqlite:///{(root / 'database.db').as_posix()}"
    return f"sqlite:///{(Path(__file__).resolve().parents[1] / 'nameam_noc_dashboard.db').as_posix()}"


class Settings(BaseSettings):
    app_name: str = "Name.am NOC Dashboard"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8765
    database_url: str = _default_database_url()
    default_monitoring_interval_minutes: int = 5
    ssh_connection_timeout_seconds: int = 10
    auth_token: str | None = None

    model_config = SettingsConfigDict(env_prefix="NAMEAM_NOC_", env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
