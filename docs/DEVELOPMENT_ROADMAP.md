# PULSE — DEVELOPMENT ROADMAP
Owner: Chat 00. Version 1.0. Rule: finish and test one phase before starting the next. Within a phase, chats work in parallel only after that phase's contract is in `/docs`.

## Phase 0 — Audit & Foundation Docs
**Lead:** 00 · **Output:** audit report, migration map, approved `/docs`
- Inspect existing frontend, backend, WebSocket code, dependencies, env/deploy config.
- List what works (keep), what is mocked (replace), what is missing.
- Map old files to the new structure (`FOLDER_STRUCTURE.md`) without breaking working features.
- Run `node setup-folders.js` (or merge into existing repo).
**Exit:** audit approved by owner, open questions answered (`PROJECT_OVERVIEW.md` Section 8).
**Status:** docs written; audit blocked on code access.

## Phase 1 — Design, Data, Backend Foundation
**Leads:** 01, 05, 03
- 01: finalize design tokens, logo mark, component visual mockups (needs owner decisions).
- 05: Mongoose models + indexes from `DATABASE_SCHEMA.md`, `db:sync-indexes` script.
- 03: `server.js`, `app.js`, `config/env.js` (zod), `db.js`, error handler, `ApiError`, `asyncHandler`, logger, `/health`, rate-limit and validate middleware.
**Exit:** server boots, connects to MongoDB, health returns ok, all indexes created, `.env.example` complete, unit tests for env/error handling pass.

## Phase 2 — Auth, Frontend Shell, Socket Connection
**Leads:** 03, 02, 04
- 03: register, login, refresh rotation, logout, `/auth/me`, `/auth/ws-ticket`, user search/profile endpoints.
- 02: Vite + Tailwind v4 setup, tokens, `components/ui` baseline, router, providers, `api/client` (401 → refresh → retry), `RequireAuth`, login/register pages, `AppShell` skeleton, `ConnectionBanner`.
- 04: ws server (upgrade auth, connectionManager, heartbeat, envelope, router, rate limiter), `READY`/`REGISTER`; 02: `SocketProvider` with backoff.
**Exit:** login persists across refresh; refresh-token reuse revokes family; authenticated socket connects and survives a forced disconnect; unauthenticated upgrade rejected.

## Phase 3 — Messaging
**Leads:** 03, 04, 05, 02
- Friends and requests; conversations (direct + group); history pagination; `CHAT_MESSAGE` (idempotent), edit, delete, replies, reactions, read receipts, unread counts; uploads (Cloudinary); conversation search.
- Frontend: conversation list, message list (infinite query), composer, reply/reaction UI, attachment preview, optimistic send with failure/retry state.
**Exit:** two browsers chat in real time; history persists after refresh; unread/read states correct; group works; unauthorized access to another's conversation fails over HTTP and WS.

## Phase 4 — Live Experience
**Leads:** 04, 06, 02
- Presence (grace period, multi-tab), typing indicators, Live Activity (publish, clear, expiry, visibility filtering), activity panel and feed.
**Exit:** friend sees activity change within ~1 s; `nobody` visibility hides it from everyone; expiry broadcasts clear; presence correct with 2 tabs.

## Phase 5 — Focus Rooms
**Leads:** 06, 04
- Create, invite, join/leave, host start/cancel, server timer, drift sync, room chat, system lines, completion event and notification, restart recovery job, empty-room cancellation.
**Exit:** timers match across 3 clients within 1 s; server restart mid-session still completes on time; non-invited stranger cannot join.

## Phase 6 — Advanced Modules
**Lead:** 06 (one module at a time, each fully separate)
1. Sparks (static list, `GET /sparks/random`, composer card).
2. Polls (create, vote atomically, live counts, close, anonymous).
3. Canvas (join, draw, throttled batches, persist on stroke end, clear).
**Exit:** 20 parallel votes by one user count once; two users draw simultaneously and see each other; late joiner receives current strokes.

## Phase 7 — Hardening & Deploy
**Leads:** 07, 08
- 07: full QA/security checklist, concurrency and reconnect tests, mobile viewports (360/768/1280), slop-table design review, contrast check in both themes, `npm audit`.
- 08: Vercel + Render config, cookie/CORS decision, `wss` verification, env docs, CI (lint, test, build), health check, log config, MongoDB Atlas production setup, self-hosted fonts.
**Exit:** production build passes, deployed staging works end to end, all Critical/High bugs closed.

## Definition of Done (every task)
Implemented · linted · tests run and results reported honestly · docs updated · Implementation Report delivered · no fake data presented as real.

## Risk Register
| Risk | Mitigation |
|---|---|
| Existing code conflicts with new structure | Phase 0 migration map, incremental moves |
| Cross-site cookie issues (Vercel ↔ Render) | Chat 08 decides rewrite vs `SameSite=None` early (Phase 2) |
| Render free tier sleeps, drops sockets | Reconnect logic + health ping; note in deploy docs |
| In-memory presence lost on restart | Clients reconnect, presence rebuilt from sockets; only `lastSeenAt` persisted |
| Canvas flooding | Throttle, batch, size limits, persist on stroke end |
| Contract drift between chats | All changes via Chat 00; doc first, code second |
