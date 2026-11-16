# PULSE — MASTER PLAN (v1.0)

*Conversations that feel alive.*

Status: **Draft for approval.** The existing codebase has NOT been audited yet; Section 14 lists what the audit (Chat 00, Stage 1) must confirm before anything is built.

---

## 1. Locked Technology Decisions

| Area | Decision |
|---|---|
| Frontend | React + Vite + JavaScript + CSS (CSS Modules + global design tokens) |
| Routing | `react-router-dom` v6.4+/v7 (data router, lazy routes, route guards) |
| Server state | `@tanstack/react-query` (all HTTP data, infinite queries for message history) |
| Client/UI state | React Context + `useReducer` (auth, theme, socket status). No Redux/Zustand unless the audit proves a need |
| Backend | Node.js + Express.js (ESM) |
| Realtime | Native `ws` only. **No Socket.IO** |
| Database | MongoDB + Mongoose |
| Auth | JWT: short-lived access token + rotating refresh token (see Section 5) |
| Validation | `zod` (shared schema shapes mirrored on FE/BE) |
| Security libs | `helmet`, `cors`, `express-rate-limit`, `bcryptjs`/`bcrypt`, `cookie-parser` |
| Uploads | `multer` + Cloudinary (Render disk is ephemeral, so never store files locally in production) |
| Logging | `pino` (pretty in dev, JSON in prod) |
| Testing | Vitest + React Testing Library (FE), Vitest/Jest + Supertest + `mongodb-memory-server` + `ws` client (BE) |
| Deploy | Vercel (FE), Render (BE), MongoDB Atlas |

Dependencies are added only when a chat justifies them in its Implementation Report.

---

## 2. Division of Work (Chats)

One owner per module. No chat edits another chat's module without a contract change approved by Chat 00.

| Chat | Role | Owns | Does NOT touch |
|---|---|---|---|
| **00** | Master Architect / PM | All `/docs/*.md`, contracts, roadmap, conflict resolution | Application code |
| **01** | UI/UX Designer | `DESIGN_SYSTEM.md`, `frontend/src/styles/*`, `components/ui/*` appearance | APIs, DB, WS server |
| **02** | Frontend Architect | `frontend/src` app shell, router, providers, `api/`, `socket/`, hooks, feature pages | Backend, DB models |
| **03** | Backend Architect | `backend/src` routes, controllers, services, middleware, auth | WS handlers, Mongoose schemas |
| **04** | WebSocket Specialist | `backend/src/ws/*`, `WEBSOCKET_PROTOCOL.md`, FE `socket/` client contract | HTTP business logic (calls services, never duplicates) |
| **05** | Database Architect | `backend/src/models/*`, indexes, `DATABASE_SCHEMA.md` | Routes, UI |
| **06** | Feature Dev | Activity, Focus Rooms, Sparks, Polls, Canvas (vertical slices) | Core messaging, auth |
| **07** | Security & QA | Tests, security review, bug reports | Writes fixes only via owning chat |
| **08** | DevOps | Vercel/Render config, env docs, CI, health checks | Feature code |

**Shared-interface rule:** if a change affects `API_CONTRACT.md`, `WEBSOCKET_PROTOCOL.md`, or `DATABASE_SCHEMA.md`, the proposing chat submits it to Chat 00, the doc is updated first, then code.

**Cross-chat handoffs (who defines, who consumes):**
- Auth tokens: 03 defines, 02 and 04 consume.
- Event envelope and types: 04 defines, 02 and 06 consume.
- Schemas: 05 defines, 03, 04 and 06 consume.
- Design tokens/components: 01 defines, 02 and 06 consume.

---

## 3. Repository Structure (monorepo, no workspace tooling needed)

```
pulse/
├── docs/                         # shared source of truth (Chat 00)
│   ├── PROJECT_OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── FOLDER_STRUCTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_CONTRACT.md
│   ├── WEBSOCKET_PROTOCOL.md
│   ├── DESIGN_SYSTEM.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── IMPLEMENTATION_STATUS.md
│   └── ENVIRONMENT_VARIABLES.md
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

### 3.1 Backend

```
backend/
├── src/
│   ├── server.js                 # http server + attaches ws, graceful shutdown
│   ├── app.js                    # express app (middleware, routes, error handler)
│   ├── config/
│   │   ├── env.js                # zod-validated env, fails fast
│   │   ├── db.js                 # mongoose connect
│   │   └── cloudinary.js
│   ├── models/                   # (Chat 05)
│   │   ├── User.js
│   │   ├── RefreshToken.js
│   │   ├── Friendship.js
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   ├── Activity.js
│   │   ├── FocusRoom.js
│   │   ├── Poll.js
│   │   └── CanvasStroke.js       # or CanvasSnapshot (decided in Stage 6)
│   ├── routes/                   # thin: path -> validate -> controller
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── friend.routes.js
│   │   ├── conversation.routes.js
│   │   ├── message.routes.js
│   │   ├── activity.routes.js
│   │   ├── focusRoom.routes.js
│   │   ├── poll.routes.js
│   │   ├── upload.routes.js
│   │   └── health.routes.js
│   ├── controllers/              # HTTP in/out only, no business logic
│   ├── services/                 # ALL business logic; shared by HTTP and WS
│   │   ├── auth.service.js
│   │   ├── token.service.js
│   │   ├── user.service.js
│   │   ├── friend.service.js
│   │   ├── conversation.service.js
│   │   ├── message.service.js
│   │   ├── presence.service.js
│   │   ├── activity.service.js
│   │   ├── focusRoom.service.js
│   │   ├── poll.service.js
│   │   ├── spark.service.js
│   │   └── canvas.service.js
│   ├── middleware/
│   │   ├── authenticate.js       # verifies access JWT
│   │   ├── validate.js           # zod wrapper
│   │   ├── rateLimit.js
│   │   ├── upload.js
│   │   ├── errorHandler.js       # single error format
│   │   └── notFound.js
│   ├── validators/               # zod schemas (HTTP + WS payloads)
│   ├── ws/                       # (Chat 04)
│   │   ├── index.js              # createWsServer(httpServer)
│   │   ├── connectionManager.js  # userId -> Set<socket>, socket meta
│   │   ├── roomManager.js        # conversation/focus-room/canvas membership
│   │   ├── auth.js               # ws ticket verification on upgrade
│   │   ├── heartbeat.js
│   │   ├── router.js             # type -> handler dispatch
│   │   ├── envelope.js           # build/parse/validate envelope
│   │   ├── rateLimiter.js        # per-socket token bucket
│   │   ├── broadcast.js
│   │   └── handlers/
│   │       ├── message.handlers.js
│   │       ├── typing.handlers.js
│   │       ├── presence.handlers.js
│   │       ├── activity.handlers.js
│   │       ├── focusRoom.handlers.js
│   │       ├── poll.handlers.js
│   │       └── canvas.handlers.js
│   ├── jobs/
│   │   └── focusTimer.js         # server-authoritative timers + restart recovery
│   ├── utils/                    # ApiError, asyncHandler, logger, pagination, ids
│   └── constants/                # event types, error codes, limits
├── tests/
│   ├── http/
│   ├── ws/
│   └── helpers/
├── .env.example
└── package.json
```

**Layering rule:** `routes → controllers → services → models`. WS handlers call the **same services** as controllers. Never the reverse.

### 3.2 Frontend

```
frontend/
├── index.html
├── vite.config.js
├── .env.example
└── src/
    ├── main.jsx
    ├── app/
    │   ├── App.jsx
    │   ├── router.jsx            # createBrowserRouter, lazy routes
    │   ├── providers.jsx         # QueryClient, Auth, Socket, Theme, Toast
    │   └── guards/
    │       ├── RequireAuth.jsx
    │       └── PublicOnly.jsx
    ├── api/
    │   ├── client.js             # fetch wrapper, attaches access token, 401 -> refresh -> retry once
    │   ├── endpoints/            # auth.js, users.js, conversations.js, messages.js, ...
    │   └── queryKeys.js          # single source of query keys
    ├── socket/
    │   ├── SocketProvider.jsx    # lifecycle, status: connecting/open/reconnecting/closed
    │   ├── socketClient.js       # connect, ticket fetch, backoff + jitter, queue, heartbeat
    │   ├── eventBus.js           # subscribe(type, handler)
    │   ├── useSocket.js
    │   └── handlers/             # event -> queryClient.setQueryData / invalidate
    ├── features/                 # feature-sliced; each has components/hooks/api/utils
    │   ├── auth/
    │   ├── profile/
    │   ├── friends/
    │   ├── conversations/
    │   ├── messages/             # list, composer, reactions, replies, receipts, attachments
    │   ├── presence/
    │   ├── activity/
    │   ├── focus-rooms/
    │   ├── sparks/
    │   ├── polls/
    │   ├── canvas/
    │   └── settings/
    ├── layouts/
    │   ├── AppShell.jsx          # nav rail + conversation sidebar + main + activity panel
    │   ├── AuthLayout.jsx
    │   └── MobileShell.jsx       # bottom nav + stacked navigation
    ├── pages/                    # thin route components that compose features
    │   ├── Home.jsx
    │   ├── Messages.jsx
    │   ├── Conversation.jsx
    │   ├── Activity.jsx
    │   ├── FocusRooms.jsx
    │   ├── FocusRoom.jsx
    │   ├── Friends.jsx
    │   ├── Settings.jsx
    │   ├── Login.jsx
    │   ├── Register.jsx
    │   └── NotFound.jsx
    ├── components/
    │   ├── ui/                   # Button, Input, Avatar, Badge, Modal, Tooltip, Skeleton, Toast...
    │   └── common/               # EmptyState, ErrorState, ConnectionBanner, ErrorBoundary
    ├── hooks/                    # useDebounce, useMediaQuery, useInfiniteScroll, ...
    ├── styles/
    │   ├── tokens.css            # CSS variables (dark default, [data-theme=light])
    │   ├── reset.css
    │   ├── typography.css
    │   └── animations.css
    ├── utils/
    ├── constants/                # mirrors backend event/error constants
    └── test/
```

**Rules:** pages are thin; business logic lives in `features/*/hooks` and `api/`; components never call `fetch` or the socket directly, only hooks.

---

## 4. Routing Map (`react-router-dom`)

```
/login, /register                  PublicOnly
/                                  RequireAuth -> AppShell
  index                            Home (dashboard)
  messages                         conversation list (mobile) / empty pane (desktop)
  messages/:conversationId         Conversation
  activity                         Live activity feed
  focus                            Focus rooms lobby
  focus/:roomId                    Focus room
  friends                          Friends + requests
  settings                         Profile, privacy, theme
*                                  NotFound
```

All feature pages use `lazy()` for code splitting. Route-level error elements. Mobile: `/messages/:id` is a full-screen route with back navigation instead of a shrunk layout.

---

## 5. Authentication Design (JWT)

- **Access token:** JWT, 15 min, held **in memory only** on the client (never localStorage).
- **Refresh token:** opaque/JWT, 7–30 days, **httpOnly, Secure cookie**, stored hashed in `RefreshToken` collection, **rotated on every use** with reuse detection (reuse revokes the family).
- **Cross-site cookies (Vercel + Render):** use `SameSite=None; Secure`, strict CORS origin allowlist with credentials. Alternative: a Vercel rewrite proxying `/api` to Render so cookies are first-party. **Chat 08 picks one; recommended: rewrite for HTTP, direct `wss://` for sockets.**
- **App boot:** call `POST /auth/refresh`; if OK, user is logged in; the router shows a splash until resolved.
- **WebSocket auth:** `POST /auth/ws-ticket` (authenticated) returns a one-time ticket valid ~30 s. Client connects to `wss://api/ws?ticket=...`; server verifies on upgrade, binds `userId` to the socket, and **ignores any identity in payloads**. On every reconnect, the client fetches a fresh ticket. If the access token has expired, the HTTP client refreshes first.
- Passwords: bcrypt (cost ≥ 12). Login rate limit + lockout backoff. Logout revokes refresh token and closes the user's sockets.

---

## 6. Data Fetching Strategy (TanStack Query + WebSocket)

- HTTP = source of truth for history/lists. WebSocket = push layer that **updates the query cache**.
- `useInfiniteQuery` for messages (cursor pagination, newest first, `before=<messageId>`).
- WS event handlers (`socket/handlers`) do `queryClient.setQueryData` for hot paths (new message, edit, delete, reaction, receipt) and `invalidateQueries` for cold ones.
- **On reconnect:** invalidate conversations list, the active conversation's latest page, presence, and active room, so missed events are recovered via HTTP (server does not need to replay).
- Optimistic message send with `clientId` (temp ID); the server ack replaces it; failure marks it "failed, retry".
- Stable `queryKeys.js` factory; sensible `staleTime`; `select` to avoid re-renders.

---

## 7. Database Design (Chat 05 finalizes)

| Model | Key fields | Indexes |
|---|---|---|
| **User** | username (unique), email (unique), passwordHash, displayName, avatarUrl, bio, presencePref, activityVisibility (`everyone/friends/nobody`), lastSeenAt, createdAt | unique username, unique email |
| **RefreshToken** | userId, tokenHash, familyId, expiresAt, revokedAt, userAgent | `userId`, TTL on `expiresAt` |
| **Friendship** | requester, recipient, status (`pending/accepted/blocked`) | unique compound pair (normalized), `recipient+status` |
| **Conversation** | type (`direct/group`), members[{user, role, lastReadMessageId, lastReadAt, mutedUntil}], title, avatarUrl, directKey (sorted ids, unique for direct), lastMessage{id,text,senderId,at}, createdBy | `members.user + updatedAt`, unique `directKey` |
| **Message** | conversationId, senderId, type (`text/image/file/poll/system`), text, attachments[], replyTo, reactions[{emoji, users[]}], editedAt, deletedAt (soft), pollId, clientId | `conversationId + _id desc`, unique sparse `conversationId+clientId` |
| **Activity** | userId (unique, one live doc), type, label, visibility, startedAt, updatedAt, expiresAt | unique `userId`, TTL optional |
| **FocusRoom** | title, hostId, durationSec, status (`lobby/running/completed/cancelled`), startedAt, endsAt, participants[{user, joinedAt, leftAt}], invited[], messages in separate collection or capped | `status`, `participants.user`, `endsAt` |
| **RoomMessage** | roomId, senderId, text, createdAt | `roomId + createdAt` |
| **Poll** | conversationId, messageId, creatorId, question, options[{id,text}], votes[{user, optionId}], multi, closesAt, closedAt | `conversationId`, unique `pollId+user` enforced in service |
| **CanvasSession** | conversationId or roomId, strokes (chunked/capped) or snapshot, updatedAt | `ownerRef` |

Rules: messages never embedded in conversations or users; unread count = computed from `lastReadMessageId` (or counter on member entry), decided by Chat 05 for efficiency; soft-delete messages; `lean()` for read queries; select only needed fields.

---

## 8. API Contract Overview (REST, prefix `/api/v1`)

Uniform success: `{ data, meta? }`. Uniform error: `{ error: { code, message, details? } }`.

- **Auth:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/ws-ticket`; `GET /auth/me`
- **Users:** `GET /users/search?q=`, `GET /users/:id`, `PATCH /users/me`, `PATCH /users/me/privacy`
- **Friends:** `GET /friends`, `POST /friends/requests`, `POST /friends/requests/:id/accept|decline`, `DELETE /friends/:id`
- **Conversations:** `GET /conversations?q=`, `POST /conversations` (direct/group), `GET /conversations/:id`, `PATCH /conversations/:id`, `POST/DELETE /conversations/:id/members`
- **Messages:** `GET /conversations/:id/messages?before=&limit=`, `POST /conversations/:id/read`
  (sending/editing/deleting/reacting go through WS, with an HTTP fallback only if Chat 00 approves)
- **Uploads:** `POST /uploads` (image/doc, type + size whitelist) returns attachment descriptor
- **Activity:** `GET /activity/feed`, `GET /activity/me`
- **Focus rooms:** `GET /focus-rooms`, `GET /focus-rooms/:id`, `GET /focus-rooms/:id/messages`
- **Polls:** `GET /polls/:id`
- **Sparks:** `GET /sparks/random`
- **Health:** `GET /health`

The WS-vs-HTTP split: **writes that must be instant and fan out → WS; reads, auth, uploads → HTTP.**

---

## 9. WebSocket Protocol Overview (Chat 04 owns the final spec)

Envelope (both directions):

```json
{ "v": 1, "type": "CHAT_MESSAGE", "id": "client-uuid", "ts": 1731700000000, "payload": { } }
```

Server replies with `ACK { replyTo, ok, error? }` for client-originated events. Errors: `ERROR { code, message, replyTo? }`. Client-supplied `userId`/`sender` fields are ignored.

| Group | Client → Server | Server → Client |
|---|---|---|
| Session | `REGISTER` (optional resume info: active conversation ids) | `READY` (userId, server time), `PING/PONG` |
| Messages | `CHAT_MESSAGE`, `MESSAGE_EDIT`, `MESSAGE_DELETE`, `MESSAGE_REACTION`, `MESSAGE_READ` | `MESSAGE_NEW`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, `MESSAGE_REACTION_UPDATED`, `MESSAGE_READ_UPDATED`, `CONVERSATION_UPDATED` |
| Typing | `TYPING_START`, `TYPING_STOP` | `TYPING_UPDATE` (auto-expires server-side after ~5 s) |
| Presence | `USER_STATUS` (online/away) | `PRESENCE_UPDATE` |
| Activity | `ACTIVITY_UPDATE`, `ACTIVITY_CLEAR` | `ACTIVITY_CHANGED` (visibility-filtered) |
| Focus rooms | `ROOM_CREATE`, `ROOM_INVITE`, `ROOM_JOIN`, `ROOM_LEAVE`, `ROOM_START`, `ROOM_MESSAGE` | `ROOM_STATE`, `ROOM_PARTICIPANT_JOINED/LEFT`, `ROOM_MESSAGE_NEW`, `ROOM_TIMER_UPDATE` (carries `endsAt` + server `now`), `ROOM_COMPLETED`, `ROOM_INVITED` |
| Polls | `POLL_CREATE`, `POLL_VOTE` | `POLL_CREATED`, `POLL_UPDATED` |
| Canvas | `CANVAS_JOIN`, `CANVAS_UPDATE`, `CANVAS_CLEAR` | `CANVAS_STATE`, `CANVAS_UPDATED` |

**Focus timer correctness:** the server stores `endsAt`. Clients render the countdown locally from `endsAt − (serverNow offset)`, and the server only broadcasts state changes plus a periodic sync (e.g., every 10–15 s) and `ROOM_COMPLETED`. The server (not clients) triggers completion via `jobs/focusTimer.js`, which re-arms timers from MongoDB on restart.

**Hardening checklist (every handler):** schema validation → authenticated user → authorization (membership/role/friend visibility) → rate-limit → service call → broadcast to authorized sockets only. Max payload (e.g., 16 KB; canvas events batched and limited), per-socket token bucket, origin check on upgrade, heartbeat every 30 s with terminate on missed pong, full cleanup (rooms, typing, presence) on close, multi-tab support (user = set of sockets; offline only when the last closes, with a short grace period).

---

## 10. UI/UX Direction (Chat 01 deliverable)

- Dark-first tokens (charcoal, 1 primary accent + 1 secondary "live" accent), light theme through `[data-theme]`.
- Desktop: 4 zones (nav rail / conversation list / main / activity panel). Tablet: activity panel becomes a drawer. Mobile: bottom nav, stacked routes, sheet-style modals.
- Signature visuals: live activity cards with a subtle pulse ring on active users, a shared circular countdown for Focus Rooms.
- Required states for every screen: loading (skeleton), empty, error, offline/reconnecting banner.
- Respect `prefers-reduced-motion`; accessible contrast, focus rings, keyboard navigation.

---

## 11. Optimization Plan

**Frontend:** route-level lazy loading; list virtualization for message history (add a virtual list only if profiling shows need); `React.memo` on message rows; debounced search/typing; image lazy loading and client-side compression before upload; TanStack Query caching/dedup; avoid putting socket events in React state (route them to the cache); bundle analysis in CI.

**Backend:** cursor pagination only; compound indexes above; `lean()` + field projection; a denormalized `lastMessage` on conversations; `compression`; cache presence in memory; batch read receipts; throttle typing/canvas events; keep socket fan-out to room members only.

**Scaling note:** single Render instance is assumed for v1 (in-memory connection maps). If scaling out, add Redis pub/sub in `ws/broadcast.js` behind the same interface. Designed for, not built now.

---

## 12. Delivery Phases (each ends with tested, documented increments)

| Phase | Scope | Lead chats | Exit criteria |
|---|---|---|---|
| **0** | Codebase audit, finalize this plan, write `/docs` | 00 | Approved docs |
| **1** | Design system, DB models, backend foundation (env, app, errors, health) | 01, 05, 03 | Server boots, models + indexes created, tokens/components specced |
| **2** | JWT auth (register/login/refresh/logout/ws-ticket), FE shell, router, providers, WS connection + heartbeat + reconnect | 03, 02, 04 | Login persists across refresh; authenticated socket connects; unauthenticated rejected |
| **3** | Conversations, messages (direct + group), pagination, replies, reactions, edit/delete, read receipts, unread, uploads | 03, 04, 05, 02 | Two browsers chat in real time; history persists |
| **4** | Presence, typing, Live Activity + privacy | 04, 06, 02 | Activity updates live for friends only per visibility |
| **5** | Focus Rooms with server timers + room chat | 06, 04 | Timer identical across clients; survives server restart |
| **6** | Sparks, Polls, Canvas (separate modules) | 06 | Live votes and shared drawing |
| **7** | Security + QA pass, performance, deployment | 07, 08 | Section 13 checklist green |

Parallelism: within a phase, chats work in parallel only after the contract for that phase is written to `/docs`.

---

## 13. Quality Gates

- **Definition of Done (per task):** implemented, linted, tests run and reported, docs updated, Implementation Report delivered (15-point format from the system prompt).
- **QA/security checklist:** unauthorized HTTP/WS access, spoofed sender IDs, IDOR on conversations/rooms/polls, oversized payloads, rate-limit bypass, expired/reused refresh tokens, XSS in messages/usernames, upload type spoofing, CORS/origin rules, multi-tab and reconnect storms, 3+ concurrent users, mobile viewports (360, 768, 1280), production build, `npm audit`.
- **Env docs:** backend `NODE_ENV, PORT, MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, CLIENT_ORIGINS, CLOUDINARY_*, LOG_LEVEL`; frontend `VITE_API_URL, VITE_WS_URL`. Only `.env.example` is committed.

---

## 14. Phase 0 Audit Checklist (must run on your existing code first)

1. List the tree; identify entry points (frontend, backend, WS).
2. Does auth exist? What kind? Any fake/hardcoded users?
3. Is MongoDB/Mongoose already wired, and which collections exist?
4. How does the current `ws` code identify users and route messages?
5. Existing dependencies (to reuse) and the Node/Vite versions.
6. Features that already work (keep) vs. mocked (replace) vs. missing.
7. Existing env/deploy config.
8. Result: a migration plan from the current structure to Section 3, which maps old files to new locations without breaking working features.

---

## 15. How to Run This System

1. Chat 00: use your Master prompt plus this plan. Task: run the Phase 0 audit and generate the `/docs` files.
2. Open the other chats one at a time, as each phase requires. First message to each: its role from the Master prompt + "Read `/docs/*` first" + the phase task.
3. Every chat ends with the Implementation Report; paste it back to Chat 00 to update `IMPLEMENTATION_STATUS.md`.
4. Never run two chats on the same files concurrently.

---

## 16. Open Questions for You

1. Is there any code to audit right now, and how do I access it (repo, zip, pasted)?
2. File storage: Cloudinary okay (free tier), or another provider?
3. Do you want email verification/password reset in v1, or defer?
4. Friends-only messaging, or can any registered user DM anyone?
5. Maximum group size and attachment size limits (defaults proposed: 50 members, 10 MB)?
6. Should message send fall back to HTTP when the socket is down (queue and retry vs. fail)? Default proposed: queue in memory and retry on reconnect, failed state after 30 s.
