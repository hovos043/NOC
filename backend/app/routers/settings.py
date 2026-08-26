from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.setting import Setting
from app.schemas import AppSettings

router = APIRouter(prefix="/settings", tags=["settings"])


def get_value(db: Session, key: str, fallback: str) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    return setting.value if setting else fallback


def get_int_value(db: Session, key: str, fallback: int) -> int:
    value = get_value(db, key, str(fallback))
    try:
        return int(value)
    except ValueError:
        return fallback


def set_value(db: Session, key: str, value: str) -> None:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        setting.value = value
    else:
        db.add(Setting(key=key, value=value))


@router.get("", response_model=AppSettings)
def get_settings(db: Session = Depends(get_db)) -> AppSettings:
    return AppSettings(
        language=get_value(db, "language", "en"),
        theme=get_value(db, "theme", "dark"),
        default_monitoring_interval_minutes=get_int_value(db, "default_monitoring_interval_minutes", 5),
    )


@router.put("", response_model=AppSettings)
def update_settings(settings: AppSettings, db: Session = Depends(get_db)) -> AppSettings:
    set_value(db, "language", settings.language)
    set_value(db, "theme", settings.theme)
    set_value(db, "default_monitoring_interval_minutes", str(settings.default_monitoring_interval_minutes))
    db.commit()
    return settings
