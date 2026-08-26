from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ssh_port: Mapped[int] = mapped_column(Integer, default=22, nullable=False)
    ssh_username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ssh_key_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ssh_auth_method: Mapped[str] = mapped_column(String(20), default="password", nullable=False)
    ssh_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssh_private_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssh_private_key_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ssh_key_passphrase: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssh_key_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ssh_status: Mapped[str] = mapped_column(String(40), default="never_tested", nullable=False)
    last_ssh_test_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_ssh_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    whm_hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    whm_port: Mapped[int] = mapped_column(Integer, default=2087, nullable=False)
    whm_username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    whm_api_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    whm_status: Mapped[str] = mapped_column(String(40), default="never_tested", nullable=False)
    last_whm_test_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_whm_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_account_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="server", cascade="all, delete-orphan")
