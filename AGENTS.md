# Guardian Circle Agent Rules

Guardian Circle is a public-facing personal safety product.

Priorities:
- reliability
- honest UX
- clear failure states
- minimal safe changes
- keep the repo runnable

Never:
- imply automatic authority contact
- over-promise emergency outcomes
- silently fail in SOS flows
- rewrite unrelated code

Workflow:
- inspect first
- plan before editing
- make small changes
- verify after changes
- explain all touched files

Development notes:
- backend = FastAPI
- mobile = Expo React Native
- Android emulator uses 10.0.2.2 instead of localhost

Build order:
1. onboarding
2. SOS error handling
3. active SOS reliability polish
4. contacts hardening
5. background location updates
6. watcher mode
7. backend hardening