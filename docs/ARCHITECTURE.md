# PULSE — ARCHITECTURE
Owner: Chat 00. Version 1.0.

## 1. System Context
```
 Browser (React SPA, Vercel)
   │  HTTPS /api/v1  (REST, JWT bearer + refresh cookie)
   │  WSS  /ws?ticket=...  (native WebSocket)
   ▼
 Render web service (single Node process)
   ├── Express app  ── routes → controllers → services → models ─┐
   ├── ws server    ── router → handlers ───────────────────────►├── MongoDB Atlas
   └── jobs (focus timer, activity sweeper)                      │
   └── Cloudinary (uploads)  ◄── upload service ─────────────────┘
```
One Node process hosts HTTP and WebSocket on the same `http.Server`. v1 assumes a single instance; connection maps are in memory.

## 2. Layering Rules (backend)
```
routes → controllers → services → models
ws/handlers ────────→ services → models
```
- **Routes:** path + middleware (`authenticate`, `validate`, rate limit) + controller. No logic.
- **Controllers:** translate HTTP to a service call and the result to a response. No business logic, no DB calls.
- **Services:** all business and authorization logic. Shared by HTTP and WebSocket. The only layer that touches models.
- **WS handlers:** validate envelope, authenticate identity from the socket, call services, broadcast results. Never reimplement logic.
- **Never reverse:** services do not import controllers or ws handlers. Services that need to push realtime updates emit through a small `events` interface (`utils/events.js`), which `ws/` subscribes to. This avoids circular imports.

## 3. Authentication & Identity
- Access JWT: 15 min, in client memory, sent as `Authorization: Bearer`.
- Refresh token: httpOnly, Secure cookie, stored hashed, rotated on each use, reuse revokes the family.
- Cookie strategy for Vercel + Render: Chat 08 decides between `SameSite=None; Secure` with strict CORS, or a Vercel rewrite proxying `/api`. Default: rewrite for HTTP, direct `wss://` for sockets.
- WebSocket: client calls `POST /auth/ws-ticket`, receives a one-time ticket (~30 s), connects with `?ticket=`. Server verifies on upgrade, binds `userId` to the socket. **Client-supplied identity is ignored everywhere.**
- Logout and password change bump `tokenVersion` and close the user's sockets.

## 4. Data Flow Patterns
**HTTP = reads, auth, uploads. WebSocket = instant writes and server push.**

Send message:
1. Client creates `clientId`, optimistic row, sends `CHAT_MESSAGE` over WS.
2. Handler validates, checks membership (service), persists (idempotent by `clientId`), updates conversation `lastMessage` and unread counters atomically.
3. Server sends `ACK` to the sender and `MESSAGE_NEW` to other members' sockets.
4. Client's WS handler writes into the TanStack Query cache.

Reconnect: client fetches a fresh ticket, reconnects with backoff + jitter, then invalidates conversations, active conversation page 1, presence, and active room queries. The server does not replay missed events; HTTP is the recovery path.

## 5. Real-time Design
- `connectionManager`: `userId → Set<socket>`, socket metadata (userId, connectedAt, rate bucket, joined rooms).
- `roomManager`: membership for `conv:<id>`, `focus:<id>`, `canvas:<id>`. Joins are validated through services (never client claims).
- Presence: online while ≥ 1 socket; 20 s grace before offline; `away` set by client idle signal; `lastSeenAt` persisted on last disconnect.
- Heartbeat: server ping every 30 s, terminate after a missed pong.
- Limits: max payload 16 KB (canvas batches smaller), per-socket token bucket, max sockets per user (5).
- Focus timer authority: server stores `endsAt`; clients render from it with a server-time offset. `jobs/focusTimer.js` completes rooms and re-arms from MongoDB on boot.

## 6. Frontend Architecture
- Router: `createBrowserRouter`, lazy routes, `RequireAuth` / `PublicOnly` guards, route error elements.
- Server state: TanStack Query only. Query keys from one factory (`api/queryKeys.js`).
- Client state: Context + `useReducer` for auth, theme, socket status. No global store.
- Socket: `SocketProvider` owns lifecycle; `eventBus` dispatches; `socket/handlers/*` map events to cache updates. Components never touch the socket or `fetch` directly, only feature hooks.
- Styling: Tailwind v4 with CSS-variable tokens (see `DESIGN_SYSTEM.md`).
- Pages are thin; logic lives in `features/*/hooks` and `api/`.

## 7. Module Ownership
| Module | Owner | Notes |
|---|---|---|
| `docs/*` | 00 | Contracts change only via 00 |
| `frontend/src/styles`, `components/ui` appearance, `DESIGN_SYSTEM.md` | 01 | |
| `frontend/src` (app, api, socket, layouts, pages, hooks, core features) | 02 | |
| `backend/src` routes, controllers, services, middleware, validators, config | 03 | |
| `backend/src/ws/*`, `WEBSOCKET_PROTOCOL.md`, frontend `socket/` contract | 04 | |
| `backend/src/models/*`, `DATABASE_SCHEMA.md` | 05 | |
| Activity, Focus Rooms, Sparks, Polls, Canvas (FE feature folder + BE service/handler) | 06 | Uses shared contracts only |
| Tests, security review | 07 | Fixes go through owner |
| Deploy config, CI, env docs | 08 | |

Rules: one owner per module; shared-interface changes go to Chat 00 first, doc updated before code.

## 8. Cross-Cutting Conventions
- **Naming:** files `camelCase.js` (services `thing.service.js`, controllers `thing.controller.js`), React components `PascalCase.jsx`, hooks `useThing.js`, constants `UPPER_SNAKE`, WS event types `UPPER_SNAKE`, REST paths kebab-case plural nouns.
- **Errors (HTTP):** `{ "error": { "code": "STRING_CODE", "message": "human text", "details": {} } }`. Codes are shared in `constants/errorCodes.js` (backend) and mirrored on the frontend.
- **Success (HTTP):** `{ "data": ..., "meta": { ... } }`.
- **IDs:** strings in all JSON; `ObjectId` in DB.
- **Dates:** ISO 8601 UTC strings in REST; epoch ms for `ts` in WS envelopes.
- **Validation:** `zod` schemas in `backend/src/validators`, used by both `validate` middleware and WS router.
- **Logging:** `pino`, no secrets or message bodies in logs, request id on every line.
- **ESM** everywhere, Node 20 LTS or newer.

## 9. Security Baseline
Helmet, strict CORS allowlist from `CLIENT_ORIGINS`, WS origin check, bcrypt cost ≥ 12, rate limits (auth strict, API general, WS per socket), zod validation on every input, server-side authorization on every operation, output escaping (React default, no `dangerouslySetInnerHTML`), upload whitelist by magic bytes plus size cap, no secrets in repo, refresh cookie httpOnly + Secure.

## 10. Performance Baseline
Cursor pagination, compound indexes, `lean()` + projection, denormalized `lastMessage`, route-level code splitting, memoized message rows, debounced typing/search, throttled canvas, TanStack Query dedup and `staleTime`, gzip.

## 11. Scaling Path (not in v1)
Add Redis pub/sub behind `ws/broadcast.js` and move presence to Redis; sticky sessions not required with pub/sub. Timers then need a leader or per-room lock. Documented here so v1 code keeps the interfaces clean.

## 12. Decision Log
| # | Decision | Reason |
|---|---|---|
| D1 | Native `ws`, no Socket.IO | Project requirement |
| D2 | WS for writes, HTTP for reads/auth/uploads | Lower latency fan-out, simpler caching |
| D3 | Access token in memory, refresh in httpOnly cookie | XSS resistance |
| D4 | One-time WS ticket | Avoids JWT in URL logs and works with cookie auth |
| D5 | Unread counter + lastRead pointer per member | O(1) inbox, no per-message receipts |
| D6 | Server-authoritative `endsAt` timer | Clients cannot drift or cheat |
| D7 | Tailwind v4 with CSS-variable tokens | Owner request; runtime theming |
| D8 | Single instance for v1 | Simplicity on Render |
