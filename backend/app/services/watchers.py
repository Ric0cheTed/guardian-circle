from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import decode_watcher_token
from app.models.alert import Alert
from app.models.contact_push_subscription import ContactPushSubscription
from app.schemas.watcher import WatcherAlertOut
from app.services.alert_expiry import expire_inactive_alert


class WatcherAccessError(ValueError):
    pass


def get_watcher_alert_snapshot(
    watcher_token: str,
    db: Session,
) -> WatcherAlertOut:
    try:
        claims = decode_watcher_token(watcher_token)
    except ValueError as exc:
        raise WatcherAccessError("Watcher access is invalid or expired") from exc

    alert = (
        db.query(Alert)
        .filter(
            Alert.id == claims["alert_id"],
            Alert.owner_user_id == claims["owner_user_id"],
        )
        .first()
    )
    if not alert:
        raise WatcherAccessError("Alert not found")

    expire_inactive_alert(alert, db)

    recipient_contact_id = claims["recipient_contact_id"]
    supports_push_notifications = recipient_contact_id is not None
    push_notifications_enabled = False

    if recipient_contact_id is not None:
        push_notifications_enabled = (
            db.query(ContactPushSubscription)
            .filter(
                ContactPushSubscription.owner_user_id == claims["owner_user_id"],
                ContactPushSubscription.contact_id == recipient_contact_id,
            )
            .first()
            is not None
        )

    return WatcherAlertOut(
        id=alert.id,
        status=alert.status,
        is_active=alert.status == "active",
        created_at=alert.created_at,
        last_location_at=alert.last_location_at,
        last_lat=alert.last_lat,
        last_lng=alert.last_lng,
        refreshed_at=datetime.now(timezone.utc),
        supports_push_notifications=supports_push_notifications,
        push_notifications_enabled=push_notifications_enabled,
    )
