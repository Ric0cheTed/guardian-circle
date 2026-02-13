# Guardian Circle Agent Guide

## Product safety constraints (must-follow)
- This is a public safety product: prioritize reliability, privacy, and honest UX.
- Never claim the app "contacts authorities". It only helps users via dialer, trusted contacts, and location sharing.
- Keep changes small and testable; avoid broad rewrites.
- SOS flows must fail loudly with clear user guidance; do not silently swallow critical errors.
- Follow UK/EU privacy expectations: minimize retained data, prefer explicit retention behavior, and add delete paths when practical.

## Repository layout
- `backend/`: FastAPI API service.
- `apps/mobile/`: Expo React Native app.

## Local run and verification commands
### Backend
- Start API:
  - `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Verify docs:
  - `curl -i http://127.0.0.1:8000/docs`
- Quick auth + contacts + alerts flow (requires running API):
  - register: `curl -X POST http://127.0.0.1:8000/auth/register -H 'content-type: application/json' -d '{"email":"user@example.com","password":"secret123","name":"User"}'`
  - login: `curl -X POST 'http://127.0.0.1:8000/auth/login?email=user@example.com&password=secret123'`
  - authorized calls: include header `Authorization: Bearer <token>`

### Mobile
- Lint: `cd apps/mobile && npm run lint`
- Type-check: `cd apps/mobile && npx tsc --noEmit`
- Start Expo: `cd apps/mobile && npx expo start`
- If using Android emulator and no env override, backend host should be `http://10.0.2.2:8000`.

## Current backend defaults
- Backend default DB URL is SQLite (`sqlite:///./guardian.db`) for local no-docker startup.
- Override with `DATABASE_URL` in `backend/.env` when using Postgres.
