# PULSE — IMPLEMENTATION STATUS
Owner: Chat 00. Update after every Implementation Report. Last updated: 2026-11-23 (Chat 04).

Legend: ☐ not started · ◐ in progress · ☑ done and tested · ⛔ blocked

## Overall
| Phase | Status | Notes |
|---|---|---|
| 0 Audit & docs | ◐ | Docs written; **audit blocked** until existing code is shared |
| 1 Design / DB / Backend foundation | ◐ | Design approved (v1.3). **Backend foundation built by Chat 03 (2026-11-20):** server/app, zod env, db, errors, logger, rate limits, health, `db:sync-indexes`. **11 Mongoose models written by Chat 03 on behalf of Chat 05, PENDING Chat 05 REVIEW (not done).** Exit criteria met for: boots, connects, health ok, indexes created (verified on real MongoDB), env/error unit tests. `backend/.env.example` present |
| 2 Auth / Frontend shell / Socket | ◐ | **Backend auth (Chat 03): done and tested against real MongoDB.** Frontend shell/auth exists (Chat 02, not tracked here). **WebSocket server (Chat 04): core + messaging built (Phase 3 work), see Chat Reports Log.** Real browser to real backend verified for register, login, refresh-on-reload, logout, settings PATCH only |
| 3 Messaging | ◐ | **WS server core + messaging handlers built and tested by Chat 04 (2026-11-22).** Real frontend + real backend + real MongoDB verified in Chromium for send, live delivery to the other user, read receipts and reload persistence. Not yet: typing (Phase 4), group/attachment/edit/delete/reaction from the browser UI, multi-instance. Phase 3 exit criteria not formally closed: awaiting Chat 00/owner review and Chat 07 QA |
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
| 2026-11-23 | 04 | Phase 4: presence + typing | Added `ws/presence.js`, `ws/typing.js`, `ws/handlers/presence.handlers.js`; `USER_STATUS`, `TYPING_START/STOP`, `PRESENCE_UPDATE`, `TYPING_UPDATE`, real `REGISTER` snapshot; 20 s offline grace; `lastSeenAt` saved. Added `recordLastSeen` to `presence.service.js` (owner-approved, **Chat 03 to review**) and corrected my Phase 3 `typing` rate group (5/10 s was not in the protocol). No contract change; items 14-21 in `WEBSOCKET_PROTOCOL.md` for Chat 00/03. **291 backend tests pass (269 + 22 new)**, real mongod 8.3.7 + real `ws` client, lint clean, run twice without flakes; mutation check: removing the grace period or the typing membership check makes 4 tests fail. Covered: online/away/offline broadcasts, friend + shared-group audiences, no leak to strangers or self, multi-tab rules, `PING` not waking an away user, grace window and reconnect inside it, `lastSeenAt` saved and monotonic, `showPresence=false` hides everything, REGISTER snapshot, typing relay/stop/expiry/2 s gap/non-member/removed member/last-socket-closed. **Browser check:** Chromium + Vite + backend: green presence dot, "typing..." in header, list and footer, typing cleared after the draft is emptied, offline update arrived only after the 20 s grace (none at 8 s, one by 24 s). **Not verified:** away via real idle/hidden-tab detection in a browser, `showPresence` toggled live (item 15), blocked-user behaviour (item 16), >1 instance, load |
| 2026-11-24 | 04 | Phase 5: activity, polls, focus rooms | Added `activity/poll/focus.handlers.js`, `jobs/focusTimer.js`, service-event fan-out for `ACTIVITY_CHANGED`. **333 backend tests pass (lint clean); 110 under `tests/ws`** (Phase 5: 8 activity + 11 polls + 23 focus). Mutation check: breaking restart re-arm, sweep and the activity `nobody` rule made 4 tests fail, then restored. Real Chromium + real backend + real MongoDB: live poll vote, room invite without reload, join, start, timer ticks, room chat, completion via server timer (46 s, DB status `completed`). **Not verified:** multi-instance, Atlas under load, Canvas (not built). See protocol Section 14 items 22-27. |
| 2026-11-22 | 04 | Phase 3: WS server core + messaging | Added `backend/src/ws/*` (native `ws`; upgrade auth with Origin allowlist + one-time ticket; connection/room managers; heartbeat 4008; envelope; per-socket token-bucket limits with 1008 on abuse; ordered per-socket pipeline; service-event fan-out; graceful shutdown wired in `server.js`), `constants/eventTypes.js`, `validators/ws.validators.js`, handlers for PING/REGISTER/CHAT_MESSAGE/EDIT/DELETE/REACTION/READ. No contract change; gaps listed in `WEBSOCKET_PROTOCOL.md` Section 14 for Chat 00. **269 backend tests pass (223 existing + 46 new WS)** against a real mongod 8.3.7 with a real `ws` client, no mocks; lint clean; WS suite run 3x without flakes. Covered: upgrade 401/403/404, one-use ticket, READY identity, envelope errors, 16 KB close 1009, rate limit + 1008, heartbeat 4008, 5-socket cap 4003, registry cleanup, logout -> 4002, graceful shutdown 1001, identity spoofing ignored, idempotent clientId, ordering, authz for non-members (send/edit/react/delete/read), edit/delete/reaction/read fan-out, receipts hidden when `showReadReceipts=false`, group removal cuts delivery, FRIEND_UPDATED. **Browser check:** Vite dev + backend + Chromium, two users: login, live send/receive both ways, "Seen by 1", no Reconnecting banner, history after reload. **Not verified:** disabled-user upgrade (no HTTP path disables users), Render/Vercel `wss`, multi-tab 6th-socket eviction from a real browser, behaviour with Cloudinary attachments over WS (storage mocked in Chat 03 tests), load/soak. Typing, presence, activity, focus rooms, polls: not built (Phases 4-5); Canvas deferred to Phase 6 |
| 2026-11-20 | 03 | Backend foundation + auth + models | Built `backend/` (see `backend/README.md`). 11 models implemented provisionally from `DATABASE_SCHEMA.md` (**Chat 05 review pending**). Auth, users, health. 100 backend tests pass against a real mongod 8.3.7 (unit: 11, integration: 89; no mocks); lint clean. Frontend regression: 159 tests, lint, build pass. Browser run (Chromium, Vite dev + real backend): register, login, reload-refresh, logout, settings PATCH worked. **Not claimed:** full end-to-end integration (friends, conversations, activity, sockets not built) |

## Features (backend column = Chat 03 HTTP work; frontend column is not maintained here)
| Feature | Backend | WS | Frontend | Tested |
|---|---|---|---|---|
| Registration / login / refresh | ☑ | — | ◐ Chat 02 built it | ◐ backend: real-DB integration tests; browser smoke with real backend passed; no formal E2E suite |
| Profiles & settings | ☑ (search, profile, PATCH me, settings, password) | — | ◐ settings theme only seen | ◐ backend real-DB tests; PATCH settings seen from browser |
| Friends | ☐ | ☐ | ☐ | ☐ |
| Direct & group conversations | ☐ | ◐ CONVERSATION_UPDATED/REMOVED | ☐ | ◐ WS fan-out tested |
| Messaging (send/edit/delete/reply/react) | ☐ | ☑ Phase 3 | ◐ Chat 02 built it | ◐ WS tests + browser send/receive; edit/delete/react UI not browser-tested |
| Read receipts & unread | ☐ | ☑ Phase 3 | ◐ | ◐ WS tests + browser "Seen by 1" |
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
0c. Chat 04: Phase 3 (core + messaging) built 2026-11-22, Phase 4 (presence + typing) built 2026-11-23. Phase 5 (activity, polls, focus) built 2026-11-24. NEXT: Phase 6 canvas (blocked on canvas service + stroke format). Old: Phase 5 (activity, focus rooms + timer job, polls), then Phase 6 canvas (blocked on canvas service + stroke format). Chat 00/03: answer the open items in `WEBSOCKET_PROTOCOL.md` Section 14 (esp. #4 per-message CONVERSATION_UPDATED, #14 recordLastSeen review, #15 settings event, #16 block rule, #17 lastSeenAt exposure).
0d. Chat 05: review `backend/src/models/*` when it starts.
1. Owner shares existing code → Chat 00 runs Phase 0 audit and migration map.
2. Owner answers open questions.
3. Chat 02 starts the frontend from `pulse-design-v1.2` (needs Phase 1 backend foundation in parallel); Chat 01 reviews built screens against the mockups.
- Limitations (Chat 03, 2026-11-21): Cloudinary adapter untested against the real service; production needs `npm run db:sync-indexes` (autoIndex off); one block per user pair; `clientId` uniqueness is per conversation (schema index), reuse by another member returns 409; WS-facing write services do not emit events, handlers must broadcast.
- Provisional defaults added by Chat 03 (not in the contract, easy to change in `constants/limits.js`): focus rooms invite-only (friends), max 20 participants (soft cap), max 20 invitations, max 3 open hosted rooms per user, host leaving a lobby cancels it; activity max expiry 24 h; poll max auto-close 7 days; activity feed lists friends only (an `everyone` activity is not broadcast beyond friends); room chat history is readable only by the host and people who joined.
