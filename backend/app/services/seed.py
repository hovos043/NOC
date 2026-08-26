from sqlalchemy.orm import Session

from app.models.server import Server
from app.models.setting import Setting
from app.models.saved_command import SavedCommand


INITIAL_SERVERS = [
    ("host19.name.am", True),
    ("host26.name.am", False),
    ("host27.name.am", False),
    ("host28.name.am", False),
    ("host30.name.am", False),
]


DEFAULT_SETTINGS = {
    "language": "en",
    "theme": "dark",
    "default_monitoring_interval_minutes": "5",
    "schema_version": "2.1",
}


DEFAULT_SAVED_COMMANDS = [
    ("Uptime", "uptime", "System"),
    ("Disk Usage", "df -h", "Disk"),
    ("Memory Usage", "free -m", "Memory"),
    ("LiteSpeed Status", "systemctl status lsws", "Services"),
    ("MariaDB Status", "systemctl status mariadb", "Services"),
    ("Exim Main Log", "tail -n 100 /var/log/exim_mainlog", "Mail"),
]


def seed_initial_data(db: Session) -> None:
    for hostname, enabled in INITIAL_SERVERS:
        exists = db.query(Server).filter(Server.hostname == hostname).first()
        if not exists:
            db.add(
                Server(
                    display_name=hostname,
                    hostname=hostname,
                    provider="Name.am",
                    ssh_port=22,
                    whm_hostname=hostname,
                    whm_port=2087,
                    enabled=enabled,
                )
            )

    for key, value in DEFAULT_SETTINGS.items():
        exists = db.query(Setting).filter(Setting.key == key).first()
        if not exists:
            db.add(Setting(key=key, value=value))

    for title, command, category in DEFAULT_SAVED_COMMANDS:
        exists = db.query(SavedCommand).filter(SavedCommand.title == title, SavedCommand.command == command).first()
        if not exists:
            db.add(SavedCommand(title=title, command=command, category=category))

    db.commit()
