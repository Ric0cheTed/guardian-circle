from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import Base, engine
from app.routers import auth, contacts, alerts, ws

def create_app() -> FastAPI:
    app = FastAPI(title="Guardian Circle API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    Base.metadata.create_all(bind=engine)

    app.include_router(auth.router)
    app.include_router(contacts.router)
    app.include_router(alerts.router)
    app.include_router(ws.router)

    return app

app = create_app()
