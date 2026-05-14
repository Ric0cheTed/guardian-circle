from datetime import datetime

from pydantic import BaseModel


class AlertNotificationOut(BaseModel):
    id: int
    recipient_contact_id: int | None
    recipient_name: str
    recipient_phone: str
    channel: str
    status: str
    watcher_url: str | None
    sms_message: str | None
    watcher_expires_at: datetime
    last_error: str | None
    created_at: datetime
    sent_at: datetime | None

    class Config:
        from_attributes = True
