from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(pw: str) -> str:
    if len(pw.encode("utf-8")) > 72:
        raise ValueError("Password is too long (max 72 bytes).")
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return pwd_context.verify(pw, hashed)


def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    payload = {"sub": sub, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def create_watcher_token(
    alert_id: int,
    owner_user_id: int,
    recipient_contact_id: int | None = None,
) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.WATCHER_TOKEN_MINUTES)
    payload = {
        "sub": f"watcher:{alert_id}",
        "scope": "watcher",
        "alert_id": alert_id,
        "owner_user_id": owner_user_id,
        "recipient_contact_id": recipient_contact_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)
    return token, exp


def decode_watcher_token(token: str) -> dict[str, int | None]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        if payload.get("scope") != "watcher":
            raise ValueError("Invalid scope")

        alert_id = int(payload.get("alert_id"))
        owner_user_id = int(payload.get("owner_user_id"))
        recipient_contact_id = payload.get("recipient_contact_id")
        if recipient_contact_id is not None:
            recipient_contact_id = int(recipient_contact_id)
    except (JWTError, TypeError, ValueError):
        raise ValueError("Invalid watcher token")

    return {
        "alert_id": alert_id,
        "owner_user_id": owner_user_id,
        "recipient_contact_id": recipient_contact_id,
    }
