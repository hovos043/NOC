from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("server_id", "username", name="uq_accounts_server_username"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"), index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    package: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    disk_usage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    disk_limit: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bandwidth_usage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bandwidth_limit: Mapped[str | None] = mapped_column(String(120), nullable=True)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    server: Mapped["Server"] = relationship("Server", back_populates="accounts")
    notes: Mapped[list["AccountNote"]] = relationship("AccountNote", back_populates="account", cascade="all, delete-orphan")
