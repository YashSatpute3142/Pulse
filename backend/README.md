# Pulse backend (Chat 03)

Node 20+ · Express 5 (ESM) · Mongoose 8 · zod · JWT + rotating refresh tokens. HTTP + services. `src/ws/*` (WebSocket, native `ws`) belongs to Chat 04; Phase 3 (core + messaging) is built, see `src/ws/handlers/README.md`.

```
cp .env.example .env     # set a real MONGODB_URI and two different secrets
npm install
npm run dev              # http://localhost:8080  (GET /health)
npm run lint && npm test
npm run db:sync-indexes  # REQUIRED in production (autoIndex is off there)
```

## Implemented so far (Steps 1-4)
`/health`, `/api/v1/health`, `/api/v1/time`, `/api/v1/auth/{register,login,refresh,logout,ws-ticket,me}`,
`/api/v1/users/{search,:id}`, `PATCH /users/me`, `PATCH /users/me/settings`, `POST /users/me/password`.
`/friends` (list, requests, request/accept/decline, remove, block/unblock), `/conversations` (list, direct, group, patch, members, mute, `:id/messages`, `messages/:mid`, `:id/read`, `:id/read-state`), `POST /uploads`.
`/activity/{me,feed}`, `/focus-rooms` (list, `:id`, `:id/messages`), `/polls/:id`, `/sparks/random`. (Built at the owner's instruction; ARCHITECTURE section 7 lists Chat 06, pending Chat 00.)

## Tests
`npm test` starts a **real mongod** (`$MONGOD_BIN`, else `mongod` on PATH, else downloads one through `mongodb-memory-server`), or uses
`$MONGODB_TEST_URI` if set. Each test file gets its own database. `tests/unit/*` need no database; `tests/http/*` are
integration tests (supertest -> Express -> real MongoDB). Only file storage is faked in upload/message tests (`createFakeStorage`); the database is always real.

## For Chat 04 (WebSocket)
- `services/ticket.service.js` -> `consumeTicket(ticket)` returns `{ userId }` once, or `null`. Use it in the upgrade handler.
- `utils/events.js` -> subscribe to `EVENTS.SESSION_REVOKED` `{ userId }` (logout / password change) and close that user's sockets.
- `services/message.service.js` write functions for handlers: `sendMessage`, `editMessage`, `deleteMessage`, `setReaction`, `markRead` (return data to broadcast; they do not emit). `utils/events.js` also emits `FRIEND_UPDATED`, `CONVERSATION_UPDATED`, `CONVERSATION_REMOVED`, `MESSAGE_READ`.
- Services for WS handlers: `activity.service` (`setActivity`/`clearActivity` EMIT `activity:changed`; `activityAudience` says who to broadcast to), `focus.service` (`createRoom`, `inviteUsers`, `joinRoom`, `leaveRoom`, `startRoom`, `cancelRoom`, `sendRoomMessage`, `completeRoomIfDue`, `completeDueRooms`, `listRunningRooms`; each returns the new room plus an `audience: { participantIds, invitedIds }` to broadcast to), `poll.service` (`createPoll`, `vote`, `closePoll`, each returns `memberIds`).
- Presence: call `setPresenceProvider(fn)` from `services/presence.service.js` at startup; `GET /activity/feed` then reports live presence (default: everyone offline).
- Attach point: `src/server.js` (marked comment). Do not import `ws/` from services.

## Models
`src/models/*` are provisional: see `src/models/README.md` (Chat 05 review pending).

## WebSocket (Chat 04, Phase 3)
`src/ws/index.js` `createWsServer(httpServer)` is attached in `server.js` and closed first on shutdown. Protocol: `docs/WEBSOCKET_PROTOCOL.md` (Section 14 lists clarifications). Tests: `tests/ws/*` use a real `ws` client against the real app and real MongoDB.
