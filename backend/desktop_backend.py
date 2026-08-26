import os
import traceback
from pathlib import Path

import uvicorn


def main() -> None:
    host = os.getenv("NAMEAM_NOC_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("NAMEAM_NOC_BACKEND_PORT", "8765"))
    data_dir = Path(os.getenv("NAMEAM_NOC_DATA_DIR") or Path.home() / "AppData" / "Roaming" / "NameAM-NOC-Dashboard")
    log_dir = data_dir / "logs"
    data_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    settings_file = data_dir / "settings.json"
    if not settings_file.exists():
        settings_file.write_text("{}\n", encoding="utf-8")
    try:
        uvicorn.run("app.main:app", host=host, port=port, log_level="info", log_config=None)
    except Exception:
        (log_dir / "backend.log").write_text(traceback.format_exc(), encoding="utf-8")
        raise


if __name__ == "__main__":
    main()
