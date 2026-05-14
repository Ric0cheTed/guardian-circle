from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from hashlib import sha256
from math import ceil
from threading import Lock
from time import monotonic
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings

RATE_LIMIT_EXCEEDED_DETAIL = "Too many requests for this action. Please wait and try again."


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    client = request.client
    return client.host if client else "unknown"


def _client_ip_key(request: Request) -> str:
    return f"ip:{_get_client_ip(request)}"


def _authorization_or_ip_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "").strip()
    if authorization:
        token_hash = sha256(authorization.encode("utf-8")).hexdigest()
        return f"auth:{token_hash}"
    return _client_ip_key(request)


@dataclass(frozen=True)
class RateLimitRule:
    scope: str
    max_requests: int
    window_seconds: int
    key_builder: Callable[[Request], str]


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def reset(self) -> None:
        with self._lock:
            self._events.clear()

    def check(
        self,
        *,
        scope: str,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> int | None:
        bucket_key = f"{scope}:{key}"
        now = monotonic()
        window_start = now - window_seconds

        with self._lock:
            bucket = self._events[bucket_key]
            while bucket and bucket[0] <= window_start:
                bucket.popleft()

            if len(bucket) >= max_requests:
                retry_after = max(1, ceil(window_seconds - (now - bucket[0])))
                return retry_after

            bucket.append(now)
            return None


rate_limiter = InMemoryRateLimiter()


def build_rate_limit_rules() -> dict[tuple[str, str], RateLimitRule]:
    return {
        ("POST", "/auth/register"): RateLimitRule(
            scope="auth-register",
            max_requests=settings.RATE_LIMIT_REGISTER_MAX_REQUESTS,
            window_seconds=settings.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
            key_builder=_client_ip_key,
        ),
        ("POST", "/auth/login"): RateLimitRule(
            scope="auth-login",
            max_requests=settings.RATE_LIMIT_LOGIN_MAX_REQUESTS,
            window_seconds=settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
            key_builder=_client_ip_key,
        ),
        ("POST", "/alerts/"): RateLimitRule(
            scope="alerts-create",
            max_requests=settings.RATE_LIMIT_ALERT_CREATE_MAX_REQUESTS,
            window_seconds=settings.RATE_LIMIT_ALERT_CREATE_WINDOW_SECONDS,
            key_builder=_authorization_or_ip_key,
        ),
    }


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        limiter: InMemoryRateLimiter,
        rules: dict[tuple[str, str], RateLimitRule],
    ) -> None:
        super().__init__(app)
        self._limiter = limiter
        self._rules = rules

    async def dispatch(self, request: Request, call_next):
        rule = self._rules.get((request.method.upper(), request.url.path))
        if rule is None:
            return await call_next(request)

        retry_after = self._limiter.check(
            scope=rule.scope,
            key=rule.key_builder(request),
            max_requests=rule.max_requests,
            window_seconds=rule.window_seconds,
        )
        if retry_after is None:
            return await call_next(request)

        return JSONResponse(
            status_code=429,
            content={"detail": RATE_LIMIT_EXCEEDED_DETAIL},
            headers={"Retry-After": str(retry_after)},
        )
