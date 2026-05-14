from datetime import datetime

from pydantic import BaseModel, field_validator


class WatcherTokenOut(BaseModel):
    token: str
    expires_at: datetime


class WatcherAlertOut(BaseModel):
    id: int
    status: str
    is_active: bool
    created_at: datetime
    last_location_at: datetime | None
    last_lat: float | None
    last_lng: float | None
    refreshed_at: datetime
    supports_push_notifications: bool = False
    push_notifications_enabled: bool = False


class WatcherPushSubscriptionCreate(BaseModel):
    expo_push_token: str

    @field_validator("expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value: str) -> str:
        token = value.strip()
        if not token.startswith(("ExpoPushToken[", "ExponentPushToken[")) or not token.endswith("]"):
            raise ValueError("Enter a valid Expo push token.")
        return token


class WatcherPushSubscriptionOut(BaseModel):
    ok: bool
    supports_push_notifications: bool
    push_notifications_enabled: bool
