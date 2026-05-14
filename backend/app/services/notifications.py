from datetime import datetime, timezone
from typing import Callable, Iterable
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.models.alert_notification import AlertNotification


def build_watcher_url(watcher_token: str) -> str:
    base_url = settings.WATCHER_BASE_URL.strip().rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("WATCHER_BASE_URL must start with https://")
    return f"{base_url}/watcher/{quote(watcher_token, safe='')}"


def build_sms_message(
    recipient_name: str,
    owner_name: str,
    watcher_url: str,
) -> str:
    return (
        f"Guardian Circle SOS alert for {owner_name}. "
        f"Read-only live tracking link for {recipient_name}: {watcher_url} "
        "This link shows the latest location shared through Guardian Circle. "
        "Location accuracy and service availability can vary."
    )


def prepare_sms_notification(
    notification: AlertNotification,
    owner_name: str,
) -> AlertNotification:
    watcher_url = build_watcher_url(notification.watcher_token)
    notification.watcher_url = watcher_url
    notification.sms_message = build_sms_message(
        recipient_name=notification.recipient_name,
        owner_name=owner_name,
        watcher_url=watcher_url,
    )
    notification.status = "pending"
    notification.last_error = None
    notification.sent_at = None
    return notification


def prepare_push_notification(notification: AlertNotification) -> AlertNotification:
    notification.watcher_url = build_watcher_url(notification.watcher_token)
    notification.status = "pending"
    notification.last_error = None
    notification.sent_at = None
    return notification


def mark_notification_sent(
    notification: AlertNotification,
    sent_at: datetime | None = None,
) -> AlertNotification:
    notification.status = "sent"
    notification.sent_at = sent_at or datetime.now(timezone.utc)
    notification.last_error = None
    return notification


def mark_notification_failed(
    notification: AlertNotification,
    error: str,
) -> AlertNotification:
    notification.status = "failed"
    notification.last_error = error[:255]
    return notification


def build_push_title(owner_name: str) -> str:
    return f"Guardian Circle SOS alert for {owner_name}"


def build_push_body(owner_name: str) -> str:
    return (
        f"{owner_name} started an SOS. Open Guardian Circle to view the latest shared location. "
        "Location accuracy and service availability can vary."
    )


def send_expo_push_notification(
    expo_push_token: str,
    title: str,
    body: str,
    watcher_token: str,
    watcher_url: str | None = None,
) -> None:
    headers = {
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_PUSH_ACCESS_TOKEN}"

    response = httpx.post(
        settings.EXPO_PUSH_API_URL,
        headers=headers,
        json={
            "to": expo_push_token,
            "title": title,
            "body": body,
            "sound": "default",
            "data": {
                "watcherToken": watcher_token,
                "watcherUrl": watcher_url,
            },
        },
        timeout=settings.EXPO_PUSH_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    payload = response.json()
    result = payload.get("data")
    if isinstance(result, list):
        result = result[0] if result else None

    if not isinstance(result, dict) or result.get("status") != "ok":
        details = result.get("details") if isinstance(result, dict) else None
        error = details.get("error") if isinstance(details, dict) else None
        message = result.get("message") if isinstance(result, dict) else None
        raise ValueError(message or error or "Expo push service returned an error")


def dispatch_pending_sms_notifications(
    notifications: Iterable[AlertNotification],
    send_sms: Callable[[str, str], None],
) -> list[AlertNotification]:
    updated_notifications: list[AlertNotification] = []

    for notification in notifications:
        if notification.channel != "sms" or notification.status != "pending":
            continue

        if not notification.sms_message:
            updated_notifications.append(
                mark_notification_failed(
                    notification,
                    "SMS message content was missing before delivery.",
                )
            )
            continue

        try:
            send_sms(notification.recipient_phone, notification.sms_message)
        except Exception as exc:
            updated_notifications.append(
                mark_notification_failed(
                    notification,
                    f"SMS delivery failed: {exc}",
                )
            )
        else:
            updated_notifications.append(mark_notification_sent(notification))

    return updated_notifications


def dispatch_pending_push_notifications(
    deliveries: Iterable[tuple[AlertNotification, str]],
    owner_name: str,
    send_push: Callable[[str, str, str, str, str | None], None] = send_expo_push_notification,
) -> list[AlertNotification]:
    updated_notifications: list[AlertNotification] = []

    for notification, expo_push_token in deliveries:
        if notification.channel != "push" or notification.status != "pending":
            continue

        if not expo_push_token:
            updated_notifications.append(
                mark_notification_failed(
                    notification,
                    "Push delivery could not start because no device token was stored.",
                )
            )
            continue

        watcher_url = notification.watcher_url or build_watcher_url(notification.watcher_token)
        notification.watcher_url = watcher_url

        try:
            send_push(
                expo_push_token,
                build_push_title(owner_name),
                build_push_body(owner_name),
                notification.watcher_token,
                watcher_url,
            )
        except Exception as exc:
            updated_notifications.append(
                mark_notification_failed(
                    notification,
                    f"Push delivery failed: {exc}",
                )
            )
        else:
            updated_notifications.append(mark_notification_sent(notification))

    return updated_notifications
