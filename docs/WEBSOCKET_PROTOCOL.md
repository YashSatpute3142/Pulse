# PULSE — WEBSOCKET PROTOCOL v1.0 (+ Phase 3 implementation notes, Section 14)
Owner: Chat 04 (WebSocket). Consumers: Chat 02, Chat 06. Approved by Chat 00.
Native `ws` only. **No Socket.IO.**

## 1. Connection
1. Client `POST /api/v1/auth/ws-ticket` (authenticated) → `{ ticket }` (one-time, 30 s).
2. Client opens `wss://<host>/ws?ticket=<ticket>`.
3. Server verifies origin (allowlist `CLIENT_ORIGINS`) and ticket on HTTP upgrade. Failure → reject upgrade (401/403), no socket.
4. Server binds `userId` to the socket and sends `READY`.
5. Client sends `REGISTER` (optional resume info).

Close codes: `1000` normal, `1001` going away, `1008` policy violation (rate limit abuse), `1009` message too big, `4001` unauthenticated, `4002` session revoked (logout/password change), `4003` too many connections, `4008` heartbeat timeout.

Reconnect (client): exponential backoff 1 s → 30 s with jitter; fresh ticket each attempt; on success invalidate cached queries (see `ARCHITECTURE.md` Section 4). Do not reconnect on `4001`/`4002` (go to login).

## 2. Envelope
All frames are UTF-8 JSON text, max **16 KB** (canvas batches ≤ 8 KB).
```json
{ "v": 1, "type": "CHAT_MESSAGE", "id": "uuid", "ts": 1731700000000, "payload": {} }
```
| Field | Rule |
|---|---|
| `v` | must be `1` |
| `type` | one of the types below; unknown → `ERROR UNKNOWN_TYPE` |
| `id` | client-generated UUID for client→server events; used for ack correlation |
| `ts` | sender clock, informational only (server uses its own time) |
| `payload` | object validated by the zod schema for `type` |

**Identity is never taken from the payload.** Any `userId`, `senderId`, or `sender` field sent by the client is ignored and stripped.

### Server replies
```json
{ "v":1, "type":"ACK",   "ts":..., "payload": { "replyTo":"<id>", "ok":true, "data":{} } }
{ "v":1, "type":"ERROR", "ts":..., "payload": { "replyTo":"<id>|null", "code":"FORBIDDEN", "message":"..." } }
```
Every client→server event except `PING`, `TYPING_*`, `CANVAS_UPDATE` gets exactly one `ACK` or `ERROR`.

Error codes: `INVALID_JSON`, `INVALID_ENVELOPE`, `UNKNOWN_TYPE`, `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `CONFLICT`, `INTERNAL`.

## 3. Pipeline (every client event)
`parse JSON → size check → envelope check → rate limit → type lookup → zod payload validation → service call (authorization inside) → ACK → broadcast to authorized sockets only`.
Handlers contain no business logic and no direct DB access.

## 4. Rate Limits (token bucket per socket)
| Group | Limit |
|---|---|
| Default | 30 events / 10 s |
| `CHAT_MESSAGE`, `ROOM_MESSAGE` | 10 / 10 s |
| `TYPING_START` | 1 / 2 s per conversation |
| `CANVAS_UPDATE` | 20 / s (batched points) |
| `MESSAGE_REACTION` | 15 / 10 s |
Sustained abuse (3 violations in 60 s) → close `1008`.

## 5. Client → Server Events
| Type | Payload | Notes |
|---|---|---|
| `PING` | `{}` | optional app-level ping; server replies `PONG` |
| `REGISTER` | `{ activeConversationId?, activeRoomId? }` | server (re)joins socket to the user's conversations/rooms via services, replies `ACK` with `{ presence snapshot }` |
| `USER_STATUS` | `{ status: 'online'\|'away' }` | client idle detection; `offline` is derived by server |
| `CHAT_MESSAGE` | `{ conversationId, clientId, text?, attachments?: Attachment[], replyTo? }` | text or attachments required, text ≤ 4000, attachments ≤ 5. Idempotent on `clientId`. ACK `data: { message }` |
| `MESSAGE_EDIT` | `{ messageId, text }` | sender only, text messages, within 24 h |
| `MESSAGE_DELETE` | `{ messageId }` | sender, or group admin/owner |
| `MESSAGE_REACTION` | `{ messageId, emoji, action: 'add'\|'remove' }` | emoji must be a single emoji grapheme, ≤ 20 distinct per message |
| `MESSAGE_READ` | `{ conversationId, messageId }` | updates pointer, zeroes unread |
| `TYPING_START` / `TYPING_STOP` | `{ conversationId }` | no ACK |
| `ACTIVITY_UPDATE` | `{ type, label?, visibility?, expiresInMin? }` | |
| `ACTIVITY_CLEAR` | `{}` | |
| `ROOM_CREATE` | `{ title, durationSec, inviteUserIds? }` | host = caller. ACK `data: { room }` |
| `ROOM_INVITE` | `{ roomId, userIds[] }` | host only |
| `ROOM_JOIN` | `{ roomId }` | access check; joins socket to `focus:<id>`; ACK `data: { room, messages(last 50), serverNow }` |
| `ROOM_LEAVE` | `{ roomId }` | |
| `ROOM_START` | `{ roomId }` | host only, lobby → running |
| `ROOM_CANCEL` | `{ roomId }` | host only |
| `ROOM_MESSAGE` | `{ roomId, text }` | ≤ 500, participants only |
| `POLL_CREATE` | `{ conversationId, question, options: string[2..8], multiple?, anonymous?, closesInMin? }` | creates message + poll |
| `POLL_VOTE` | `{ pollId, optionIds: string[] }` | empty array retracts vote |
| `POLL_CLOSE` | `{ pollId }` | creator only |
| `CANVAS_JOIN` | `{ ownerType: 'conversation'\|'room', ownerId }` | ACK `data: { strokes, seq }` |
| `CANVAS_LEAVE` | `{ ownerType, ownerId }` | |
| `CANVAS_UPDATE` | `{ ownerType, ownerId, strokeId, phase: 'start'\|'move'\|'end', tool, color, size, points }` | `points` flat normalized `[x,y,...]`, ≤ 100 per frame; stroke persisted on `end` only |
| `CANVAS_CLEAR` | `{ ownerType, ownerId }` | room host / conversation admin |

## 6. Server → Client Events
| Type | Payload | Sent to |
|---|---|---|
| `READY` | `{ userId, serverNow, heartbeatSec: 30 }` | the socket |
| `PONG` | `{}` | the socket |
| `ACK` / `ERROR` | see Section 2 | the socket |
| `SESSION_REVOKED` | `{}` | then close `4002` |
| `PRESENCE_UPDATE` | `{ userId, status: 'online'\|'away'\|'offline', lastSeenAt? }` | friends and shared-conversation members who may see presence (`showPresence`) |
| `MESSAGE_NEW` | `{ message }` | conversation members (including sender's other tabs) |
| `MESSAGE_EDITED` | `{ conversationId, messageId, text, editedAt }` | members |
| `MESSAGE_DELETED` | `{ conversationId, messageId, deletedAt }` | members |
| `MESSAGE_REACTION_UPDATED` | `{ conversationId, messageId, reactions }` | members |
| `MESSAGE_READ_UPDATED` | `{ conversationId, userId, lastReadMessageId }` | members (respects `showReadReceipts`) |
| `CONVERSATION_UPDATED` | `{ conversation }` | members (created, renamed, members changed, unread changed) |
| `CONVERSATION_REMOVED` | `{ conversationId }` | removed member |
| `TYPING_UPDATE` | `{ conversationId, userId, typing: boolean }` | other members; server auto-expires after 5 s |
| `FRIEND_UPDATED` | `{ userId, friendship }` | both users |
| `ACTIVITY_CHANGED` | `{ userId, activity\|null }` | users allowed to see it (visibility filtered per recipient) |
| `ROOM_INVITED` | `{ room, invitedBy }` | invited users |
| `ROOM_STATE` | `{ room, serverNow }` | participants (full state on any change) |
| `ROOM_PARTICIPANT_JOINED` / `ROOM_PARTICIPANT_LEFT` | `{ roomId, user, at }` | participants |
| `ROOM_MESSAGE_NEW` | `{ roomId, message }` | participants (includes system lines) |
| `ROOM_TIMER_UPDATE` | `{ roomId, status, endsAt, serverNow }` | participants; on start and every 15 s as drift correction |
| `ROOM_COMPLETED` | `{ roomId, completedAt, durationSec }` | participants and invited users |
| `ROOM_CANCELLED` | `{ roomId }` | participants |
| `POLL_CREATED` | `{ poll, message }` | conversation members |
| `POLL_UPDATED` | `{ pollId, counts, closedAt }` | members; voters list never sent for anonymous polls |
| `CANVAS_STATE` | `{ ownerType, ownerId, strokes, seq }` | joiner only |
| `CANVAS_UPDATED` | same shape as `CANVAS_UPDATE` plus `userId` | other canvas participants |
| `CANVAS_CLEARED` | `{ ownerType, ownerId, userId }` | canvas participants |

## 7. Rooms (server-side membership)
| Room key | Members | Joined |
|---|---|---|
| `user:<id>` | all sockets of the user | on connect |
| `conv:<id>` | members' sockets | on connect/`REGISTER` and when added to a conversation |
| `focus:<id>` | participants' sockets | `ROOM_JOIN` |
| `canvas:<type>:<id>` | participants who sent `CANVAS_JOIN` | access verified through services |
Removal from a conversation or room immediately removes the user's sockets from that room.

## 8. Presence & Typing
- Online when ≥ 1 socket. When the last socket closes, wait **20 s**; if none reconnects, broadcast `offline` and persist `lastSeenAt`.
- `away` set by `USER_STATUS`; any user event returns to `online`.
- Typing is ephemeral (never persisted), keyed `userId+conversationId`, auto-stop after 5 s without `TYPING_START`.
- Users with `showPresence=false` always appear `offline` to others.

## 9. Focus Timer Contract
- Server is the only authority. Start sets `endsAt = now + durationSec`.
- Clients compute remaining = `endsAt − (Date.now() + offset)` where `offset = serverNow − Date.now()` measured when the event arrived. Display only; never decide completion locally.
- `ROOM_TIMER_UPDATE` every 15 s corrects drift. Server timer fires `ROOM_COMPLETED` at `endsAt`; after a restart `jobs/focusTimer.js` re-arms from MongoDB.

## 10. Idempotency & Ordering
- `CHAT_MESSAGE` dedupes on `(conversationId, clientId)`; a retry returns the original message in `ACK`.
- Messages are ordered by `_id`. Clients insert by `_id`, replacing optimistic rows matched by `clientId`.
- No server replay. After reconnect the client refetches via HTTP.

## 11. Heartbeat
Server sends WebSocket `ping` frames every 30 s; a socket that has not answered `pong` by the next cycle is terminated with `4008`. Browsers answer automatically. Application-level `PING`/`PONG` is optional for latency display.

## 12. Limits
Max sockets per user: 5 (oldest closed with `4003`). Max frame 16 KB. Max room participants 20. Max conversation fan-out 50.

## 13. Change Process
New or changed events require: proposal to Chat 00, update of this file, then implementation in `backend/src/ws/handlers` and `frontend/src/socket/handlers`. Event type constants live in `constants/eventTypes.js` on both sides and must match this file.

## 14. Implementation Notes — Phase 3 (Chat 04, 2026-11-22)
Built: server core, session (`PING`, `REGISTER`) and messaging (`CHAT_MESSAGE`, `MESSAGE_EDIT/DELETE/REACTION/READ`). No event name, envelope or payload above was changed. The items below fill gaps the protocol left open; **each is reported to Chat 00 for confirmation**.

| # | Topic | What the server does | Needs Chat 00 |
|---|---|---|---|
| 1 | ACK `data` for `MESSAGE_EDIT/DELETE/REACTION/READ` | Section 5 gives none: sends `data: {}` (the broadcast carries the result). `CHAT_MESSAGE` ACK is `{ message }`; `REGISTER` ACK is `{ presence }` | confirm |
| 2 | `REGISTER` presence snapshot | **Phase 4:** `{ presence: { <userId>: { status } } }` for friends + online members of the user's conversations; offline users are omitted (frontend treats absent as offline) | none |
| 3 | Who gets `MESSAGE_NEW/EDITED/DELETED/REACTION_UPDATED` | Every socket of the `memberIds` the service returns for that write, **except the sending socket** (it has the ACK). Delivery does not depend on `conv:<id>` room state, so it is correct the moment membership changes | confirm |
| 4 | `CONVERSATION_UPDATED` after a new message | **Not** sent per message (a 50-member group would cost 50 reads per message). Sent when a conversation is created/renamed/members change/mute. The frontend already refetches the list (debounced) for unread counts. Protocol text says "unread changed" | **decide**: per-message push or not |
| 5 | `MESSAGE_READ_UPDATED` audience | Sockets in `conv:<id>`; if the reader has `showReadReceipts=false`, only the reader's own sockets. Needs one `auth.service.me()` read per event | Chat 03 could add `memberIds` + `showReadReceipts` to the `message:read` event to save that read |
| 6 | Upgrade rejection | HTTP `401` bad/used/expired ticket or inactive user, `403` Origin not in `CLIENT_ORIGINS`, `404` path other than `/ws`, `503` while shutting down. **No `Origin` header is accepted** (non-browser clients, same as HTTP CORS); the ticket is still required | confirm |
| 7 | `id` on client frames | Required (non-empty string, max 64) on every client frame including `PING` and `TYPING_*`; missing → `ERROR INVALID_ENVELOPE` | confirm |
| 8 | Not-yet-implemented types | Phase 4+ types get `ERROR UNKNOWN_TYPE`, except no-reply types (`PING`, `TYPING_*`, `CANVAS_UPDATE`) which are dropped silently. `CANVAS_*` stays unregistered until Phase 6 (see `backend/src/ws/handlers/README.md`) | none |
| 9 | Close code `1011` | Used if connect-time setup fails (DB error loading memberships). Not in Section 1; the frontend treats any unknown code as "reconnect with backoff" | add to table |
| 10 | Per-socket ordering | Events of one socket are processed strictly in order; at most 50 queued, extra → `ERROR RATE_LIMITED` | confirm |
| 11 | Frames > 16 KB | `ws` closes the socket with `1009` (before any parsing) | none |
| 12 | Rate limiter | Token bucket per socket and group as Section 4. Phase 3 had set a 5/10 s `typing` bucket that Section 4 does not contain; **corrected in Phase 4** to a 30/10 s outer abuse bound, with Section 4's rule (1 `TYPING_START` per 2 s per conversation) enforced in `ws/typing.js` | none |
| 13 | Slow consumers | A socket with > 2 MB unsent is terminated | add to Section 12 |

Registered handlers live in `backend/src/ws/handlers/*.handlers.js`; `ws/index.js` lists them in `ALL_HANDLERS`.

### Phase 4 notes — presence and typing (Chat 04, 2026-11-23)
Built: `USER_STATUS`, `TYPING_START/STOP`, `PRESENCE_UPDATE`, `TYPING_UPDATE`, the `REGISTER` snapshot, the 20 s offline grace and `lastSeenAt` persistence. No event name, envelope or payload was changed.

| # | Topic | What the server does | Needs Chat 00 / 03 |
|---|---|---|---|
| 14 | `lastSeenAt` persistence | No service wrote `User.lastSeenAt`. With the owner's approval Chat 04 added `recordLastSeen(userId, at)` to `presence.service.js` (one atomic `$max` update, so it can never move backwards). It is saved when the grace period ends, even for users with `showPresence=false` | **Chat 03: review/adopt** |
| 15 | `showPresence` changed while connected | Takes effect at the user's next presence change (connect, away, offline). No service event announces a settings change | **Chat 03: emit e.g. `user:settings`** so the change is instant |
| 16 | Blocked users | Presence goes to friends and to online members of shared conversations; typing to members of the conversation. A block does not (yet) hide presence or typing between two members of the same group or DM | **decide** the rule; needs a block check from a service |
| 17 | `lastSeenAt` for users already offline | Only sent inside the offline `PRESENCE_UPDATE`. No HTTP serializer exposes `lastSeenAt` and the snapshot omits offline users, so "last seen" cannot be shown for someone who was offline before you connected | **decide** whether Chat 03 should expose it |
| 18 | Status model | Per socket: `online`/`away`. User: `online` if any tab is online, `away` if all are, offline after the 20 s grace. Any client event except `PING` and `USER_STATUS` returns that socket to `online` | confirm |
| 19 | `PRESENCE_UPDATE` audience | Friends (`listFriends`) + online members of the conversations the user is in (socket rooms), never the user. Costs one friends read per presence change, none per message | confirm |
| 20 | Typing | Every accepted `TYPING_START` is relayed (the client resends every 3 s and expires entries after 6 s), re-arms the 5 s auto-stop and is limited to one relay per 2 s per socket and conversation (extra STARTs only re-arm). Typing stops at once when the user's last socket closes. Sender's own tabs never receive it. A socket that is not in `conv:<id>` is ignored without an ERROR | confirm |
| 21 | Scale | Presence and typing state is in memory (single instance, D8) | none |
| 22 | Phase 5 delivery model | Room events (`ROOM_*`, `POLL_*`) go to the audience user ids returned by the service, i.e. all tabs of those users, **including the sender's other tabs and the sender** for room events (the frontend updates state from events). `focus:<id>` sockets are used for timer drift ticks only. | none |
| 23 | Polls | `POLL_CREATE` ACK `{poll, message}`; `POLL_CREATED` to members except the sender socket. `POLL_VOTE` ACK `{pollId, counts, myVote, closedAt}`; `POLL_UPDATED {pollId, counts, closedAt}` to others. The voter's other tabs get counts only (no `myVote`). `POLL_CLOSE` ACK + `POLL_UPDATED` to all including the closer. Expiry by time emits no event (the frontend hides it locally). | Chat 00: confirm |
| 24 | Activity | `ACTIVITY_UPDATE` ACK `{activity}`, `ACTIVITY_CLEAR` ACK `{}`. `ACTIVITY_CHANGED` (service event) fans out: visibility `nobody` gives friends `null` and the owner the real value; clear gives everyone `null`. Time expiry emits no event. | none |
| 25 | Focus rooms | Handlers: `ROOM_CREATE/INVITE/JOIN/LEAVE/START/CANCEL/MESSAGE`; events `ROOM_INVITED`, `ROOM_STATE {room, serverNow}`, `ROOM_PARTICIPANT_JOINED/LEFT`, `ROOM_MESSAGE_NEW`, `ROOM_TIMER_UPDATE`, `ROOM_COMPLETED`, `ROOM_CANCELLED` (also sent to invited users). `ROOM_JOIN` ACK `{room, messages, serverNow}` with `serverNow` in epoch ms. Authorization, limits (3 open rooms per host, 20 participants, provisional) come from Chat 03 services. Disconnect does not remove a participant. User objects are picked so email is not leaked. | Chat 00/03: confirm limits |
| 26 | Server timer | `jobs/focusTimer.js`: one precise timeout per running room, 15 s drift ticks, sweep every 4th tick (60 s), re-armed from MongoDB at startup, atomic `completeRoomIfDue` so completion fires once. Single instance (D8). | none |
| 27 | Canvas (Phase 6) | Still deferred. Integration point documented in `ws/handlers/README.md`. Blocked on a canvas service and a stroke format. `CANVAS_*` types stay silent no-reply. | Chat 00/03 |
