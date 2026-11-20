# Pulse backend (Chat 03)

Node 20+ · Express 5 (ESM) · Mongoose 8 · zod · JWT + rotating refresh tokens. HTTP only: `src/ws/*` belongs to Chat 04.

```
cp .env.example .env     # set a real MONGODB_URI and two different secrets
npm install
npm run dev              # http://localhost:8080  (GET /health)
npm run lint && npm test
npm run db:sync-indexes  # REQUIRED in production (autoIndex is off there)
```

## Implemented so far (Step 1 foundation + Step 2 auth)
`/health`, `/api/v1/health`, `/api/v1/time`, `/api/v1/auth/{register,login,refresh,logout,ws-ticket,me}`,
`/api/v1/users/{search,:id}`, `PATCH /users/me`, `PATCH /users/me/settings`, `POST /users/me/password`.
Friends, conversations, messages history, uploads, activity, focus rooms, polls, sparks: **not started** (return 404).

## Tests
`npm test` starts a **real mongod** (`$MONGOD_BIN`, else `mongod` on PATH, else downloads one through `mongodb-memory-server`), or uses
`$MONGODB_TEST_URI` if set. Each test file gets its own database. `tests/unit/*` need no database; `tests/http/*` are
integration tests (supertest -> Express -> real MongoDB). Nothing is mocked.

## For Chat 04 (WebSocket)
- `services/ticket.service.js` -> `consumeTicket(ticket)` returns `{ userId }` once, or `null`. Use it in the upgrade handler.
- `utils/events.js` -> subscribe to `EVENTS.SESSION_REVOKED` `{ userId }` (logout / password change) and close that user's sockets.
- Attach point: `src/server.js` (marked comment). Do not import `ws/` from services.

## Models
`src/models/*` are provisional: see `src/models/README.md` (Chat 05 review pending).
