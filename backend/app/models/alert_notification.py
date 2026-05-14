from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AlertNotification(Base):
    __tablename__ = "alert_notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_contact_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    recipient_name: Mapped[str] = mapped_column(String(120))
    recipient_phone: Mapped[str] = mapped_column(String(40), index=True)
    channel: Mapped[str] = mapped_column(String(30), default="sms")
    status: Mapped[str] = mapped_column(String(30), default="pending")
    watcher_token: Mapped[str] = mapped_column(String(2048))
    watcher_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    sms_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    watcher_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
