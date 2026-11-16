# PULSE — WEBSOCKET PROTOCOL v1.0
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
