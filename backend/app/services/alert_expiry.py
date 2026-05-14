from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert import Alert

ALERT_EXPIRED_STATUS = "expired"
ALERT_INACTIVE_DETAIL = "Alert is no longer active"


def _as_utc(timestamp: datetime) -> datetime:
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def get_alert_last_activity_at(alert: Alert) -> datetime:
    timestamps = [_as_utc(alert.created_at)]
    if alert.last_location_at is not None:
        timestamps.append(_as_utc(alert.last_location_at))
    return max(timestamps)


def expire_inactive_alerts(
    alerts: Iterable[Alert],
    db: Session,
    *,
    now: datetime | None = None,
) -> list[Alert]:
    timeout_minutes = settings.ALERT_AUTO_EXPIRY_MINUTES
    if timeout_minutes <= 0:
        return []

    current_time = now or datetime.now(timezone.utc)
    cutoff = current_time - timedelta(minutes=timeout_minutes)
    expired_alerts: list[Alert] = []

    for alert in alerts:
        if alert.status != "active":
            continue

        if get_alert_last_activity_at(alert) <= cutoff:
            alert.status = ALERT_EXPIRED_STATUS
            expired_alerts.append(alert)

    if expired_alerts:
        db.commit()
        for alert in expired_alerts:
            db.refresh(alert)

    return expired_alerts


def expire_inactive_alert(
    alert: Alert,
    db: Session,
    *,
    now: datetime | None = None,
) -> bool:
    return bool(expire_inactive_alerts([alert], db, now=now))
