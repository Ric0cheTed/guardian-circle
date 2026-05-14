from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.audit import log_audit_event
from app.core.database import get_db
from app.core.security import create_watcher_token, decode_watcher_token
from app.models.alert import Alert
from app.models.alert_notification import AlertNotification
from app.models.contact import Contact
from app.models.contact_push_subscription import ContactPushSubscription
from app.schemas.alert import AlertCreate, AlertUpdateLocation, AlertOut
from app.schemas.notification import AlertNotificationOut
from app.schemas.watcher import (
    WatcherAlertOut,
    WatcherPushSubscriptionCreate,
    WatcherPushSubscriptionOut,
    WatcherTokenOut,
)
from app.routers.auth_dep import get_current_user
from app.services.alert_expiry import ALERT_INACTIVE_DETAIL, expire_inactive_alerts
from app.services.notifications import (
    dispatch_pending_push_notifications,
    prepare_push_notification,
    prepare_sms_notification,
    send_expo_push_notification,
)
from app.services.watchers import WatcherAccessError, get_watcher_alert_snapshot

router = APIRouter(prefix="/alerts", tags=["alerts"])

@router.get("/", response_model=list[AlertOut])
def list_alerts(user=Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = (
        db.query(Alert)
        .filter(Alert.owner_user_id == user.id)
        .order_by(Alert.id.desc())
        .all()
    )
    expire_inactive_alerts(alerts, db)
    return alerts

@router.post("/", response_model=AlertOut)
def create_alert(payload: AlertCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    has_location = payload.lat is not None and payload.lng is not None
    location_timestamp = None
    if has_location:
        location_timestamp = datetime.now(timezone.utc)

    a = Alert(
        owner_user_id=user.id,
        last_lat=payload.lat,
        last_lng=payload.lng,
        last_location_at=location_timestamp,
        status="active",
    )
    db.add(a)
    db.flush()

    contacts = (
        db.query(Contact)
        .filter(Contact.owner_user_id == user.id, Contact.is_emergency.is_(True))
        .all()
    )
    contact_ids = [contact.id for contact in contacts]
    subscriptions_by_contact_id = {}
    if contact_ids:
        subscriptions = (
            db.query(ContactPushSubscription)
            .filter(
                ContactPushSubscription.owner_user_id == user.id,
                ContactPushSubscription.contact_id.in_(contact_ids),
            )
            .all()
        )
        subscriptions_by_contact_id = {
            subscription.contact_id: subscription
            for subscription in subscriptions
        }

    pending_push_deliveries: list[tuple[AlertNotification, str]] = []
    for contact in contacts:
        watcher_token, watcher_expires_at = create_watcher_token(
            a.id,
            user.id,
            recipient_contact_id=contact.id,
        )
        notification = prepare_sms_notification(
            AlertNotification(
                alert_id=a.id,
                owner_user_id=user.id,
                recipient_contact_id=contact.id,
                recipient_name=contact.name,
                recipient_phone=contact.phone,
                channel="sms",
                status="pending",
                watcher_token=watcher_token,
                watcher_expires_at=watcher_expires_at,
            ),
            owner_name=user.name,
        )
        db.add(notification)

        subscription = subscriptions_by_contact_id.get(contact.id)
        if subscription:
            push_notification = prepare_push_notification(
                AlertNotification(
                    alert_id=a.id,
                    owner_user_id=user.id,
                    recipient_contact_id=contact.id,
                    recipient_name=contact.name,
                    recipient_phone=contact.phone,
                    channel="push",
                    status="pending",
                    watcher_token=watcher_token,
                    watcher_expires_at=watcher_expires_at,
                )
            )
            db.add(push_notification)
            pending_push_deliveries.append(
                (push_notification, subscription.expo_push_token)
            )

    db.commit()
    if pending_push_deliveries:
        dispatch_pending_push_notifications(
            pending_push_deliveries,
            owner_name=user.name,
            send_push=send_expo_push_notification,
        )
        db.commit()
    db.refresh(a)
    log_audit_event(
        "alert.created",
        alert_id=a.id,
        emergency_contact_count=len(contacts),
        has_location=has_location,
        user_id=user.id,
    )
    return a


@router.delete("/history")
def delete_alert_history(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alerts = (
        db.query(Alert)
        .filter(Alert.owner_user_id == user.id)
        .order_by(Alert.id.desc())
        .all()
    )
    expire_inactive_alerts(alerts, db)

    history_alert_ids = [alert.id for alert in alerts if alert.status != "active"]
    active_alerts_kept = sum(1 for alert in alerts if alert.status == "active")

    if not history_alert_ids:
        return {
            "ok": True,
            "deleted_alerts": 0,
            "deleted_notifications": 0,
            "active_alerts_kept": active_alerts_kept,
        }

    deleted_notifications = (
        db.query(AlertNotification)
        .filter(
            AlertNotification.owner_user_id == user.id,
            AlertNotification.alert_id.in_(history_alert_ids),
        )
        .delete(synchronize_session=False)
    )
    deleted_alerts = (
        db.query(Alert)
        .filter(
            Alert.owner_user_id == user.id,
            Alert.id.in_(history_alert_ids),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    log_audit_event(
        "alert.history_deleted",
        active_alerts_kept=active_alerts_kept,
        deleted_alerts=deleted_alerts,
        deleted_notifications=deleted_notifications,
        user_id=user.id,
    )
    return {
        "ok": True,
        "deleted_alerts": deleted_alerts,
        "deleted_notifications": deleted_notifications,
        "active_alerts_kept": active_alerts_kept,
    }


@router.post("/{alert_id}/location", response_model=AlertOut)
def update_location(alert_id: int, payload: AlertUpdateLocation, user=Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.owner_user_id == user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    expire_inactive_alerts([a], db)
    if a.status != "active":
        raise HTTPException(status_code=409, detail=ALERT_INACTIVE_DETAIL)
    a.last_lat = payload.lat
    a.last_lng = payload.lng
    a.last_location_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return a

@router.post("/{alert_id}/resolve", response_model=AlertOut)
def resolve(alert_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.owner_user_id == user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    a.status = "resolved"
    db.commit()
    db.refresh(a)
    log_audit_event(
        "alert.resolved",
        alert_id=a.id,
        user_id=user.id,
    )
    return a


@router.post("/{alert_id}/watcher-token", response_model=WatcherTokenOut)
def create_watcher_access_token(
    alert_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.owner_user_id == user.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    token, expires_at = create_watcher_token(alert.id, user.id)
    return WatcherTokenOut(token=token, expires_at=expires_at)


@router.get("/{alert_id}/notifications", response_model=list[AlertNotificationOut])
def list_alert_notifications(
    alert_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.owner_user_id == user.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    return (
        db.query(AlertNotification)
        .filter(
            AlertNotification.alert_id == alert_id,
            AlertNotification.owner_user_id == user.id,
        )
        .order_by(AlertNotification.id.asc())
        .all()
    )


@router.get("/watcher/{watcher_token}", response_model=WatcherAlertOut)
def get_watcher_alert(watcher_token: str, db: Session = Depends(get_db)):
    try:
        return get_watcher_alert_snapshot(watcher_token, db)
    except WatcherAccessError as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        )


def _get_contact_for_watcher_push(
    watcher_token: str,
    db: Session,
) -> Contact:
    try:
        claims = decode_watcher_token(watcher_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail="Watcher access is invalid or expired",
        ) from exc

    recipient_contact_id = claims["recipient_contact_id"]
    if recipient_contact_id is None:
        raise HTTPException(
            status_code=400,
            detail="This watcher link cannot manage push notifications",
        )

    contact = (
        db.query(Contact)
        .filter(
            Contact.id == recipient_contact_id,
            Contact.owner_user_id == claims["owner_user_id"],
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    return contact


@router.post(
    "/watcher/{watcher_token}/push-subscription",
    response_model=WatcherPushSubscriptionOut,
)
def subscribe_watcher_push_notifications(
    watcher_token: str,
    payload: WatcherPushSubscriptionCreate,
    db: Session = Depends(get_db),
):
    contact = _get_contact_for_watcher_push(watcher_token, db)

    subscription = (
        db.query(ContactPushSubscription)
        .filter(
            ContactPushSubscription.owner_user_id == contact.owner_user_id,
            ContactPushSubscription.contact_id == contact.id,
        )
        .first()
    )
    if subscription:
        subscription.expo_push_token = payload.expo_push_token
    else:
        subscription = ContactPushSubscription(
            owner_user_id=contact.owner_user_id,
            contact_id=contact.id,
            expo_push_token=payload.expo_push_token,
        )
        db.add(subscription)

    db.commit()
    return WatcherPushSubscriptionOut(
        ok=True,
        supports_push_notifications=True,
        push_notifications_enabled=True,
    )


@router.delete(
    "/watcher/{watcher_token}/push-subscription",
    response_model=WatcherPushSubscriptionOut,
)
def unsubscribe_watcher_push_notifications(
    watcher_token: str,
    db: Session = Depends(get_db),
):
    contact = _get_contact_for_watcher_push(watcher_token, db)

    (
        db.query(ContactPushSubscription)
        .filter(
            ContactPushSubscription.owner_user_id == contact.owner_user_id,
            ContactPushSubscription.contact_id == contact.id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return WatcherPushSubscriptionOut(
        ok=True,
        supports_push_notifications=True,
        push_notifications_enabled=False,
    )
