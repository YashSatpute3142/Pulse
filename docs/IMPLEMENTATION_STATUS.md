# PULSE — IMPLEMENTATION STATUS
Owner: Chat 00. Update after every Implementation Report. Last updated: 2026-11-21 (Chat 03).

Legend: ☐ not started · ◐ in progress · ☑ done and tested · ⛔ blocked

## Overall
| Phase | Status | Notes |
|---|---|---|
| 0 Audit & docs | ◐ | Docs written; **audit blocked** until existing code is shared |
| 1 Design / DB / Backend foundation | ◐ | Design approved (v1.3). **Backend foundation built by Chat 03 (2026-11-20):** server/app, zod env, db, errors, logger, rate limits, health, `db:sync-indexes`. **11 Mongoose models written by Chat 03 on behalf of Chat 05, PENDING Chat 05 REVIEW (not done).** Exit criteria met for: boots, connects, health ok, indexes created (verified on real MongoDB), env/error unit tests. `backend/.env.example` present |
| 2 Auth / Frontend shell / Socket | ◐ | **Backend auth (Chat 03): done and tested against real MongoDB.** Frontend shell/auth exists (Chat 02, not tracked here). **WebSocket server (Chat 04): not started.** Real browser to real backend verified for register, login, refresh-on-reload, logout, settings PATCH only |
| 3 Messaging | ☐ | |
| 4 Live experience | ☐ | |
| 5 Focus Rooms | ☐ | |
| 6 Sparks / Polls / Canvas | ☐ | |
| 7 Hardening & Deploy | ☐ | |

## Documents
| File | Owner | Status |
|---|---|---|
| `PROJECT_OVERVIEW.md` | 00 | ☑ v1.0 |
| `ARCHITECTURE.md` | 00 | ☑ v1.0 |
| `FOLDER_STRUCTURE.md` | 00 | ☑ v1.0 |
| `DATABASE_SCHEMA.md` | 05 | ☑ v1.0 (policy defaults need owner OK) |
| `API_CONTRACT.md` | 03 | ☑ v1.0 draft |
| `WEBSOCKET_PROTOCOL.md` | 04 | ☑ v1.0 draft |
| `DESIGN_SYSTEM.md` | 01 | ☑ v1.3 (desktop and mobile mockups approved; Chat 01 design deliverables closed). Tablet/laptop and unmocked-screen specs unverified visually; font self-hosting pending (08) |
| `CONTRAST_REPORT.md` | 01 | ☑ v1.0 + v1.2 and v1.2.1 (mobile) addenda; built-app re-check pending (Chat 07) |
| `DEVELOPMENT_ROADMAP.md` | 00 | ☑ v1.0 |
| `IMPLEMENTATION_STATUS.md` | 00 | ☑ this file |
| `ENVIRONMENT_VARIABLES.md` | 08 | ☑ v1.0 |

## Chat Reports Log
| Date | Chat | Task | Result |
|---|---|---|---|
| 2026-11-15 | 00 | Master plan | Delivered `MASTER_PLAN.md` |
| 2026-11-15 | 00 | Folder script | Delivered `setup-folders.js` (not yet run by owner) |
| 2026-11-15 | 01 | Design system | Delivered `DESIGN_SYSTEM.md`; no tests (docs only) |
| 2026-11-15 | 05 | DB schema | Delivered `DATABASE_SCHEMA.md`; no code or tests |
| 2026-11-16 | 01 | Design System v1.2 final | Owner approved visuals. Delivered `tokens.css`, `index.css` (Tailwind 4.3.5 compile + Chromium computed-style check), icon set, responsive/a11y/unmocked-screen specs, contrast addendum. Responsive layouts not verified visually |
| 2026-11-15 | 00 | Remaining docs | Delivered API contract, WS protocol, roadmap, env, overview, architecture, folder structure, status |
| 2026-11-16 | 01 | Logo, mockups, contrast, v1.1 | Delivered logo (SVG/PNG), 4 mockups (dark+light), `CONTRAST_REPORT.md`, `DESIGN_SYSTEM.md` v1.1. Contrast script run; screenshots reviewed in Chromium only |
| 2026-11-16 | 01 | Mobile mockups (conv, activity, focus; dark+light) | Delivered 6 boards, 20 frames, `mobile.html`; `DESIGN_SYSTEM.md` v1.2.1, contrast addendum. Chromium only; DOM audit 0 text failures; keyboard is a placeholder; **APPROVED by owner** (see next row) |
| 2026-11-16 | 01 | Mobile approval and handoff | Owner approved all 6 mobile mockups (conv, activity, focus x dark, light). `DESIGN_SYSTEM.md` v1.3 records approval. Design handoff to Chat 02 complete; no code written |

| 2026-11-21 | 03 | Friends, Conversations, Messages (history/read), Uploads | Added HTTP for friends, conversations (DM/group, members, mute, read, read-state), message history/single fetch, `POST /uploads` (magic-byte sniffing, 10 MB, Cloudinary adapter), plus `message.service` write functions for Chat 04's WS handlers (send/edit/delete/react/markRead; idempotent on clientId; atomic unread counters). **185 backend tests pass against real mongod** (no DB mocks). **Mocked:** only the storage adapter in upload tests, so the Cloudinary adapter is NOT tested against the real service. Bugs found by tests and fixed: invalid arrayFilter in markRead, 5-attachment cap not enforced, malformed multipart returned 500, `lastMessage` schema (sub-schema needed; documented in models README, Chat 05 to confirm). Frontend: 159 tests + build pass; right-panel toggle UI fix. **Not claimed:** full end-to-end integration; WebSocket (Chat 04) not built |
| 2026-11-21 | 03 | Activity, Focus Rooms, Polls, Sparks (HTTP + services) | Built at the owner's explicit instruction even though ARCHITECTURE 7 lists Chat 06 for these (**Chat 00 please confirm/accept the ownership change**). HTTP: `GET/PUT/DELETE /activity/me`, `GET /activity/feed`, `GET /focus-rooms`, `/focus-rooms/:id`, `/:id/messages`, `GET /polls/:id`, `GET /sparks/random`. Services for Chat 04's WS handlers: `activity.service` (emits `activity:changed`), `focus.service` (create/invite/join/leave/start/cancel/message/complete, timer helpers `completeRoomIfDue`, `completeDueRooms`, `listRunningRooms`), `poll.service` (create/vote/close), `presence.service` (`setPresenceProvider`, Chat 04 registers live presence). **223 backend tests pass against real mongod** (38 new, no mocks); lint clean. The WS handlers, the timer job and live presence are NOT built (Chat 04). Not claimed: end-to-end integration |
| 2026-11-20 | 03 | Backend foundation + auth + models | Built `backend/` (see `backend/README.md`). 11 models implemented provisionally from `DATABASE_SCHEMA.md` (**Chat 05 review pending**). Auth, users, health. 100 backend tests pass against a real mongod 8.3.7 (unit: 11, integration: 89; no mocks); lint clean. Frontend regression: 159 tests, lint, build pass. Browser run (Chromium, Vite dev + real backend): register, login, reload-refresh, logout, settings PATCH worked. **Not claimed:** full end-to-end integration (friends, conversations, activity, sockets not built) |

## Features (backend column = Chat 03 HTTP work; frontend column is not maintained here)
| Feature | Backend | WS | Frontend | Tested |
|---|---|---|---|---|
| Registration / login / refresh | ☑ | — | ◐ Chat 02 built it | ◐ backend: real-DB integration tests; browser smoke with real backend passed; no formal E2E suite |
| Profiles & settings | ☑ (search, profile, PATCH me, settings, password) | — | ◐ settings theme only seen | ◐ backend real-DB tests; PATCH settings seen from browser |
| Friends | ☐ | ☐ | ☐ | ☐ |
| Direct & group conversations | ☐ | ☐ | ☐ | ☐ |
| Messaging (send/edit/delete/reply/react) | ☐ | ☐ | ☐ | ☐ |
| Read receipts & unread | ☐ | ☐ | ☐ | ☐ |
| Uploads | ☐ | — | ☐ | ☐ |
| Presence & typing | ☐ | ☐ | ☐ | ☐ |
| Live Activity | ☐ | ☐ | ☐ | ☐ |
| Focus Rooms | ☐ | ☐ | ☐ | ☐ |
| Sparks | ☐ | — | ☐ | ☐ |
| Polls | ☐ | ☐ | ☐ | ☐ |
| Shared Canvas | ☐ | ☐ | ☐ | ☐ |
| Deployment | ☐ | | | ☐ |

## Pending Owner Decisions
See `PROJECT_OVERVIEW.md` Section 8 (items 7 resolved: accent, logo and message layout approved 2026-11-16; 8 remain). Design (visuals, logo, palette) approved 2026-11-16.

## Approved Mockups (all owner-approved 2026-11-16)
Desktop (dark+light): main shell, conversation, Live Activity, Focus Room. Mobile (dark+light): Conversation, Live Activity, Focus Room, in `mockups/` and `mockups/mobile/`.

## Known Design Limitations
- Mockup keyboard is a generic placeholder; verify real keyboard behaviour in the built app.
- Tablet/laptop layouts and screens without mockups are specified, not visually verified.
- Built-app accessibility and contrast verification pending (Chat 07).
- Font self-hosting pending (Chat 08).
- Chat 01 review of implemented screens open until Chat 02 builds them.

## Known Issues
- Models are provisional (Chat 05 has not reviewed). Concurrency, pagination, `explain()` checks from DATABASE_SCHEMA Section 9 are not run.
- Production runs with `autoIndex` off: `npm run db:sync-indexes` MUST run on deploy or unique constraints do not exist.
- Frontend calls to not-yet-built endpoints return 404 (conversations, friends, activity, focus rooms); the app shows load errors there.
- No WebSocket server yet, so the frontend shows "Reconnecting…".
- Rate limits and ws tickets are in-memory (single instance, D8).
- Doc points for Chat 00 (no contract changed, see Chat 03 report): `/health` returns the raw object as written in 4.10 while other endpoints use `{data}`; strict 10/min/IP limiter applied to register, login and password change only (refresh/logout/ws-ticket/me use the general limiter); bcryptjs chosen over bcrypt; Cloudinary env vars required only in production until Uploads is built.

## Next Actions
0. ☑ Mobile mockups approved; design phase closed for Chat 01.
0b. Chat 03: Friends, Conversations, Messages, Uploads DONE (2026-11-21). **OWNERSHIP CONFLICT for Chat 00:** Activity, Focus Rooms, Polls, Sparks are assigned to Chat 06 in ARCHITECTURE section 7, so Chat 03 has NOT built them (frontend calls to `/activity/feed` and `/focus-rooms` return 404). Chat 00 to confirm owner. Chat 04 can now build WS on `message.service`/`events.js`.
0c. Chat 04: WebSocket server (use `consumeTicket` and `SESSION_REVOKED`, see `backend/README.md`).
0d. Chat 05: review `backend/src/models/*` when it starts.
1. Owner shares existing code → Chat 00 runs Phase 0 audit and migration map.
2. Owner answers open questions.
3. Chat 02 starts the frontend from `pulse-design-v1.2` (needs Phase 1 backend foundation in parallel); Chat 01 reviews built screens against the mockups.
- Limitations (Chat 03, 2026-11-21): Cloudinary adapter untested against the real service; production needs `npm run db:sync-indexes` (autoIndex off); one block per user pair; `clientId` uniqueness is per conversation (schema index), reuse by another member returns 409; WS-facing write services do not emit events, handlers must broadcast.
- Provisional defaults added by Chat 03 (not in the contract, easy to change in `constants/limits.js`): focus rooms invite-only (friends), max 20 participants (soft cap), max 20 invitations, max 3 open hosted rooms per user, host leaving a lobby cancels it; activity max expiry 24 h; poll max auto-close 7 days; activity feed lists friends only (an `everyone` activity is not broadcast beyond friends); room chat history is readable only by the host and people who joined.
