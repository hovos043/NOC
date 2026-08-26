from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MonitoringSnapshot(Base):
    __tablename__ = "monitoring_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"), index=True, nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kernel: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uptime: Mapped[str | None] = mapped_column(Text, nullable=True)
    uptime_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cpu_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cpu_cores: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cpu_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_average: Mapped[str | None] = mapped_column(String(120), nullable=True)
    load_average_1: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_average_5: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_average_15: Mapped[float | None] = mapped_column(Float, nullable=True)
    ram_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ram_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ram_free: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ram_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    swap_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    swap_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    swap_free: Mapped[int | None] = mapped_column(Integer, nullable=True)
    swap_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_highest_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_disk_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    server = relationship("Server")
