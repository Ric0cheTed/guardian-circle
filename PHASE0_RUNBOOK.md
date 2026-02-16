# PHASE 0 Runbook (Guardian Circle)

## Repo structure
- `backend/` — FastAPI API server.
- `apps/mobile/` — Expo app (file-based routing).
- `docker-compose.yml` — Postgres service for local backend DB.

## Start Postgres (Docker Compose)
```bash
docker compose up -d db
docker compose ps
```
Expected: `db` is `running` and mapped on `5432`.

## Start backend
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Expected: `Uvicorn running on http://0.0.0.0:8000`.

Verify docs:
```bash
curl -i http://127.0.0.1:8000/docs
```
Expected: `HTTP/1.1 200 OK` and Swagger HTML.

## Start Expo app
```bash
cd apps/mobile
npx expo start
```
Expected: Metro starts and QR/dev-menu instructions are shown.

If Android emulator is used and `EXPO_PUBLIC_API_URL` is not set, mobile defaults to `http://10.0.2.2:8000`.
