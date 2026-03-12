from datetime import datetime, timedelta, timezone
from jose import jwt
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
