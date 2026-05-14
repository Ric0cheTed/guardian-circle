from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import Base, engine
from app.core.rate_limit import (
    RateLimitMiddleware,
    build_rate_limit_rules,
    rate_limiter,
)
from app.routers import auth, contacts, alerts, watcher_pages, ws

def create_app() -> FastAPI:
    app = FastAPI(title="Guardian Circle API")

    app.add_middleware(
        RateLimitMiddleware,
        limiter=rate_limiter,
        rules=build_rate_limit_rules(),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    Base.metadata.create_all(bind=engine)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(contacts.router)
    app.include_router(alerts.router)
    app.include_router(watcher_pages.router)
    app.include_router(ws.router)

    return app

app = create_app()
