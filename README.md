# Guardian Circle (MVP)

Monorepo:
- `backend/` FastAPI + Postgres API (JWT auth)
- `apps/mobile/` Expo (React Native) app for Android + iOS

## Quick start (local)

### 1) Start Postgres
From repo root:
```bash
docker compose up -d
```

### 2) Run backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -e .
python -m app.smoke_auth
uvicorn app.main:app --reload --port 8000
```

### 3) Run mobile app
```bash
cd apps/mobile
npm install
# copy env
# Windows:
copy .env.example .env
# macOS/Linux:
# cp .env.example .env

npm run start
```

## Notes

- Android emulator cannot reach `localhost` on your PC. Use `http://10.0.2.2:8000` in `apps/mobile/.env`.
- Physical phone needs your PC LAN IP (and Windows Firewall must allow port 8000).
