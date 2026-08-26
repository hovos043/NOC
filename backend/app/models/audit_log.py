from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int | None] = mapped_column(ForeignKey("servers.id", ondelete="SET NULL"), index=True, nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    action_type: Mapped[str] = mapped_column(String(80), nullable=False)
    command: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_dangerous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    was_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stdout_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
