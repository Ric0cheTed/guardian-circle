from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

TEST_DIR = Path(tempfile.mkdtemp(prefix="guardian-rate-limit-tests-"))
TEST_DB_PATH = TEST_DIR / "rate-limits.db"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["JWT_SECRET"] = "guardian-circle-test-secret"
os.environ["ALERT_AUTO_EXPIRY_MINUTES"] = "1"
os.environ["RATE_LIMIT_REGISTER_MAX_REQUESTS"] = "2"
os.environ["RATE_LIMIT_REGISTER_WINDOW_SECONDS"] = "60"
os.environ["RATE_LIMIT_LOGIN_MAX_REQUESTS"] = "2"
os.environ["RATE_LIMIT_LOGIN_WINDOW_SECONDS"] = "60"
os.environ["RATE_LIMIT_ALERT_CREATE_MAX_REQUESTS"] = "2"
os.environ["RATE_LIMIT_ALERT_CREATE_WINDOW_SECONDS"] = "60"

from fastapi.testclient import TestClient

from app.core.audit import AUDIT_LOGGER_NAME
from app.core.database import Base, SessionLocal, engine
from app.core.rate_limit import RATE_LIMIT_EXCEEDED_DETAIL, rate_limiter
from app.main import create_app
from app.models.alert import Alert
from app.models.alert_notification import AlertNotification
from app.models.contact import Contact
from app.models.contact_push_subscription import ContactPushSubscription
from app.models.user import User


class RateLimitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(create_app())
        cls.ip_headers = {"X-Forwarded-For": "198.51.100.10"}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        shutil.rmtree(TEST_DIR, ignore_errors=True)

    def setUp(self) -> None:
        rate_limiter.reset()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def _register_user(
        self,
        *,
        email: str,
        name: str = "Test User",
        password: str = "password123",
    ):
        return self.client.post(
            "/auth/register",
            headers=self.ip_headers,
            json={"email": email, "name": name, "password": password},
        )

    def _login_user(
        self,
        *,
        email: str,
        password: str = "password123",
    ):
        return self.client.post(
            "/auth/login",
            headers=self.ip_headers,
            params={"email": email, "password": password},
        )

    def _auth_headers(self, *, email: str) -> dict[str, str]:
        registered = self._register_user(email=email)
        self.assertEqual(registered.status_code, 200)

        login = self._login_user(email=email)
        self.assertEqual(login.status_code, 200)

        return {
            **self.ip_headers,
            "Authorization": f"Bearer {login.json()['access_token']}",
        }

    def _age_alert(self, alert_id: int, *, minutes_ago: int) -> None:
        stale_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)

        with SessionLocal() as db:
            alert = db.get(Alert, alert_id)
            self.assertIsNotNone(alert)
            assert alert is not None
            alert.created_at = stale_at
            alert.last_location_at = stale_at
            db.commit()

    def test_health_returns_ok(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_register_rate_limit_blocks_rapid_retries(self) -> None:
        first = self._register_user(email="first@example.com")
        second = self._register_user(email="second@example.com")
        blocked = self._register_user(email="third@example.com")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json(), {"detail": RATE_LIMIT_EXCEEDED_DETAIL})
        self.assertIn("Retry-After", blocked.headers)

    def test_login_rate_limit_leaves_initial_attempts_working(self) -> None:
        registered = self._register_user(email="login@example.com")
        self.assertEqual(registered.status_code, 200)

        first = self._login_user(email="login@example.com")
        second = self._login_user(email="login@example.com")
        blocked = self._login_user(email="login@example.com")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json(), {"detail": RATE_LIMIT_EXCEEDED_DETAIL})

    def test_alert_create_rate_limit_blocks_burst_alert_creation(self) -> None:
        headers = self._auth_headers(email="alerts@example.com")

        first = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        second = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        blocked = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json(), {"detail": RATE_LIMIT_EXCEEDED_DETAIL})

    def test_list_alerts_expires_stale_active_alert(self) -> None:
        headers = self._auth_headers(email="auto-expire-list@example.com")
        created = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created.status_code, 200)

        self._age_alert(created.json()["id"], minutes_ago=2)

        response = self.client.get("/alerts/", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["status"], "expired")

    def test_watcher_snapshot_expires_stale_active_alert(self) -> None:
        headers = self._auth_headers(email="auto-expire-watcher@example.com")
        created = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created.status_code, 200)

        self._age_alert(created.json()["id"], minutes_ago=2)

        token_response = self.client.post(
            f"/alerts/{created.json()['id']}/watcher-token",
            headers=headers,
        )
        self.assertEqual(token_response.status_code, 200)

        response = self.client.get(
            f"/alerts/watcher/{token_response.json()['token']}",
            headers=headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "expired")
        self.assertFalse(response.json()["is_active"])

    def test_location_update_rejects_expired_alert(self) -> None:
        headers = self._auth_headers(email="auto-expire-update@example.com")
        created = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created.status_code, 200)

        self._age_alert(created.json()["id"], minutes_ago=2)

        response = self.client.post(
            f"/alerts/{created.json()['id']}/location",
            headers=headers,
            json={"lat": 51.5015, "lng": -0.1420},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {"detail": "Alert is no longer active"})

    def test_delete_alert_history_removes_past_alerts_and_keeps_active_sos(self) -> None:
        headers = self._auth_headers(email="delete-alert-history@example.com")
        created_contact = self.client.post(
            "/contacts/",
            headers=headers,
            json={
                "name": "Alice",
                "phone": "+447700900123",
                "is_emergency": True,
            },
        )
        self.assertEqual(created_contact.status_code, 200)

        resolved_alert = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(resolved_alert.status_code, 200)
        resolved = self.client.post(
            f"/alerts/{resolved_alert.json()['id']}/resolve",
            headers=headers,
        )
        self.assertEqual(resolved.status_code, 200)

        stale_alert = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5030, "lng": -0.1195},
        )
        self.assertEqual(stale_alert.status_code, 200)
        self._age_alert(stale_alert.json()["id"], minutes_ago=2)

        rate_limiter.reset()

        active_alert = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5007, "lng": -0.1246},
        )
        self.assertEqual(active_alert.status_code, 200)

        response = self.client.delete("/alerts/history", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "ok": True,
                "deleted_alerts": 2,
                "deleted_notifications": 2,
                "active_alerts_kept": 1,
            },
        )

        with SessionLocal() as db:
            remaining_alerts = db.query(Alert).all()
            remaining_notifications = db.query(AlertNotification).all()
            self.assertEqual(len(remaining_alerts), 1)
            self.assertEqual(len(remaining_notifications), 1)
            self.assertEqual(remaining_alerts[0].id, active_alert.json()["id"])
            self.assertEqual(remaining_alerts[0].status, "active")

        listed = self.client.get("/alerts/", headers=headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], active_alert.json()["id"])

    def test_watcher_push_subscription_sends_push_for_future_alerts(self) -> None:
        headers = self._auth_headers(email="watcher-push@example.com")
        created_contact = self.client.post(
            "/contacts/",
            headers=headers,
            json={
                "name": "Alice",
                "phone": "+447700900123",
                "is_emergency": True,
            },
        )
        self.assertEqual(created_contact.status_code, 200)

        first_alert = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(first_alert.status_code, 200)

        with SessionLocal() as db:
            watcher_token = (
                db.query(AlertNotification)
                .filter(
                    AlertNotification.alert_id == first_alert.json()["id"],
                    AlertNotification.channel == "sms",
                )
                .one()
                .watcher_token
            )

        subscribed = self.client.post(
            f"/alerts/watcher/{watcher_token}/push-subscription",
            json={"expo_push_token": "ExponentPushToken[test-contact-device]"},
        )

        self.assertEqual(subscribed.status_code, 200)
        self.assertEqual(
            subscribed.json(),
            {
                "ok": True,
                "supports_push_notifications": True,
                "push_notifications_enabled": True,
            },
        )

        watcher_view = self.client.get(f"/alerts/watcher/{watcher_token}")
        self.assertEqual(watcher_view.status_code, 200)
        self.assertTrue(watcher_view.json()["supports_push_notifications"])
        self.assertTrue(watcher_view.json()["push_notifications_enabled"])

        rate_limiter.reset()

        with patch("app.routers.alerts.send_expo_push_notification") as send_push:
            second_alert = self.client.post(
                "/alerts/",
                headers=headers,
                json={"lat": 51.5007, "lng": -0.1246},
            )

        self.assertEqual(second_alert.status_code, 200)
        send_push.assert_called_once()
        self.assertEqual(send_push.call_args.args[0], "ExponentPushToken[test-contact-device]")

        notifications = self.client.get(
            f"/alerts/{second_alert.json()['id']}/notifications",
            headers=headers,
        )
        self.assertEqual(notifications.status_code, 200)
        self.assertEqual(
            {(item["channel"], item["status"]) for item in notifications.json()},
            {("sms", "pending"), ("push", "sent")},
        )

        unsubscribed = self.client.delete(
            f"/alerts/watcher/{watcher_token}/push-subscription",
        )
        self.assertEqual(unsubscribed.status_code, 200)
        self.assertEqual(
            unsubscribed.json(),
            {
                "ok": True,
                "supports_push_notifications": True,
                "push_notifications_enabled": False,
            },
        )

        rate_limiter.reset()

        with patch("app.routers.alerts.send_expo_push_notification") as send_push:
            third_alert = self.client.post(
                "/alerts/",
                headers=headers,
                json={"lat": 51.5090, "lng": -0.1180},
            )

        self.assertEqual(third_alert.status_code, 200)
        send_push.assert_not_called()

        third_notifications = self.client.get(
            f"/alerts/{third_alert.json()['id']}/notifications",
            headers=headers,
        )
        self.assertEqual(third_notifications.status_code, 200)
        self.assertEqual(
            [(item["channel"], item["status"]) for item in third_notifications.json()],
            [("sms", "pending")],
        )

        with SessionLocal() as db:
            self.assertEqual(db.query(ContactPushSubscription).count(), 0)

    def test_generic_watcher_link_cannot_manage_push_notifications(self) -> None:
        headers = self._auth_headers(email="generic-watcher-push@example.com")
        created = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created.status_code, 200)

        token_response = self.client.post(
            f"/alerts/{created.json()['id']}/watcher-token",
            headers=headers,
        )
        self.assertEqual(token_response.status_code, 200)

        response = self.client.post(
            f"/alerts/watcher/{token_response.json()['token']}/push-subscription",
            json={"expo_push_token": "ExponentPushToken[test-contact-device]"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"detail": "This watcher link cannot manage push notifications"},
        )

    def test_alert_created_audit_event_is_logged(self) -> None:
        headers = self._auth_headers(email="audit-alert-created@example.com")

        with self.assertLogs(AUDIT_LOGGER_NAME, level="INFO") as captured:
            response = self.client.post(
                "/alerts/",
                headers=headers,
                json={"lat": 51.5014, "lng": -0.1419},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(
            json.loads(captured.records[0].getMessage()),
            {
                "alert_id": response.json()["id"],
                "emergency_contact_count": 0,
                "event": "alert.created",
                "has_location": True,
                "user_id": 1,
            },
        )

    def test_alert_resolved_audit_event_is_logged(self) -> None:
        headers = self._auth_headers(email="audit-alert-resolved@example.com")
        created = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created.status_code, 200)

        with self.assertLogs(AUDIT_LOGGER_NAME, level="INFO") as captured:
            response = self.client.post(
                f"/alerts/{created.json()['id']}/resolve",
                headers=headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(
            json.loads(captured.records[0].getMessage()),
            {
                "alert_id": created.json()["id"],
                "event": "alert.resolved",
                "user_id": 1,
            },
        )

    def test_contact_added_audit_event_is_logged(self) -> None:
        headers = self._auth_headers(email="audit-contact-added@example.com")

        with self.assertLogs(AUDIT_LOGGER_NAME, level="INFO") as captured:
            response = self.client.post(
                "/contacts/",
                headers=headers,
                json={
                    "name": "Alice",
                    "phone": "+447700900123",
                    "is_emergency": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(
            json.loads(captured.records[0].getMessage()),
            {
                "contact_id": response.json()["id"],
                "event": "contact.added",
                "is_emergency": True,
                "user_id": 1,
            },
        )

    def test_contact_removed_audit_event_is_logged(self) -> None:
        headers = self._auth_headers(email="audit-contact-removed@example.com")
        created = self.client.post(
            "/contacts/",
            headers=headers,
            json={
                "name": "Alice",
                "phone": "+447700900123",
                "is_emergency": True,
            },
        )
        self.assertEqual(created.status_code, 200)

        with self.assertLogs(AUDIT_LOGGER_NAME, level="INFO") as captured:
            response = self.client.delete(
                f"/contacts/{created.json()['id']}",
                headers=headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(
            json.loads(captured.records[0].getMessage()),
            {
                "contact_id": created.json()["id"],
                "event": "contact.removed",
                "is_emergency": True,
                "user_id": 1,
            },
        )

    def test_delete_account_removes_owned_contacts_alerts_and_notifications(self) -> None:
        headers = self._auth_headers(email="delete-account@example.com")
        created_contact = self.client.post(
            "/contacts/",
            headers=headers,
            json={
                "name": "Alice",
                "phone": "+447700900123",
                "is_emergency": True,
            },
        )
        self.assertEqual(created_contact.status_code, 200)

        created_alert = self.client.post(
            "/alerts/",
            headers=headers,
            json={"lat": 51.5014, "lng": -0.1419},
        )
        self.assertEqual(created_alert.status_code, 200)

        response = self.client.delete("/auth/me", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "ok": True,
                "deleted_contacts": 1,
                "deleted_alerts": 1,
                "deleted_notifications": 1,
            },
        )

        with SessionLocal() as db:
            self.assertEqual(db.query(User).count(), 0)
            self.assertEqual(db.query(Contact).count(), 0)
            self.assertEqual(db.query(Alert).count(), 0)
            self.assertEqual(db.query(AlertNotification).count(), 0)

        rejected = self.client.get("/alerts/", headers=headers)
        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(rejected.json(), {"detail": "User not found"})


if __name__ == "__main__":
    unittest.main()
