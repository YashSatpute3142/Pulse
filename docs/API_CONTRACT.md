# PULSE — API CONTRACT (REST) v1.0
Owner: Chat 03 (Backend). Consumers: Chat 02, Chat 06. Approved by Chat 00.
Base URL: `${VITE_API_URL}/api/v1`. JSON only (except uploads).

## 1. Conventions
- **Auth:** `Authorization: Bearer <accessToken>` on all routes except those marked Public. Refresh uses the httpOnly cookie `pulse_rt` (`credentials: 'include'`).
- **Success:** `{ "data": <payload>, "meta": { ... } }` (`meta` optional).
- **Error:** `{ "error": { "code": "STRING", "message": "text", "details": {} } }`.
- **IDs:** strings. **Dates:** ISO 8601 UTC.
- **Pagination (cursor):** `?before=<id>&limit=30` (max 50). Response `meta: { hasMore, nextCursor }`.
- **Rate limits:** auth routes 10/min/IP, general 120/min/user, uploads 20/min/user. Exceeded → 429 `RATE_LIMITED` with `Retry-After`.

## 2. Error Codes
| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod failure, `details.fields` |
| 401 | `UNAUTHENTICATED` | missing/invalid/expired token |
| 401 | `TOKEN_REUSED` | refresh reuse detected, family revoked |
| 403 | `FORBIDDEN` | authenticated but not allowed |
| 404 | `NOT_FOUND` | also used to hide existence from unauthorized users |
| 409 | `CONFLICT` | duplicate (username, email, friend request, DM) |
| 413 | `PAYLOAD_TOO_LARGE` | |
| 415 | `UNSUPPORTED_MEDIA` | upload type rejected |
| 429 | `RATE_LIMITED` | |
| 500 | `INTERNAL` | no internals leaked |

## 3. Shared Shapes
```ts
User        { id, username, displayName, avatarUrl, bio, createdAt }
Me          User + { email, settings: { theme, activityVisibility, showPresence, showReadReceipts } }
Attachment  { kind: 'image'|'file', url, name, mime, size, width?, height? }
Message     { id, conversationId, senderId|null, type, text, attachments[], replyTo: ReplyPreview|null,
              pollId|null, reactions: [{ emoji, userIds[] }], editedAt|null, deletedAt|null, createdAt, clientId? }
ReplyPreview{ id, senderId, text (<=120), type, deletedAt }
Conversation{ id, type, title|null, avatarUrl|null, members: [{ user: User, role }],
              lastMessage: { messageId, senderId, preview, type, at }|null,
              unreadCount, lastReadMessageId, mutedUntil|null, updatedAt }
Friend      { user: User, since, status }
Activity    { userId, type, label, visibility, startedAt, updatedAt, expiresAt|null }
FocusRoom   { id, title, hostId, durationSec, status, startedAt|null, endsAt|null,
              participants: [{ user: User, joinedAt }], invitedIds[] }
Poll        { id, conversationId, messageId, creatorId, question, options: [{ id, text }],
              multiple, anonymous, closesAt, closedAt, counts: { [optionId]: number }, myVote: string[] }
```
`unreadCount` and `lastReadMessageId` are the requesting user's own values.

## 4. Endpoints

### 4.1 Auth
| Method & path | Auth | Body | Response |
|---|---|---|---|
| `POST /auth/register` | Public | `{ username, email, password, displayName }` | `{ user: Me, accessToken }` + sets refresh cookie |
| `POST /auth/login` | Public | `{ identifier, password }` (email or username) | `{ user: Me, accessToken }` + cookie |
| `POST /auth/refresh` | Cookie | — | `{ user: Me, accessToken }` + rotated cookie; 401 if missing/invalid |
| `POST /auth/logout` | Cookie | — | `204`; revokes token family, clears cookie, closes sockets |
| `POST /auth/ws-ticket` | Yes | — | `{ ticket, expiresInSec: 30 }` |
| `GET /auth/me` | Yes | — | `Me` |

Password policy: 8–72 chars, not equal to username/email. Username: 3–24, `[a-z0-9_]`, case-insensitive unique.

### 4.2 Users
| Method & path | Notes |
|---|---|
| `GET /users/search?q=` | Prefix match on username/displayName, max 20, excludes self and blockers |
| `GET /users/:id` | Public profile + `friendship: 'none'|'pending_in'|'pending_out'|'friends'|'blocked'` |
| `PATCH /users/me` | `{ displayName?, bio?, avatarUrl? }` |
| `PATCH /users/me/settings` | `{ theme?, activityVisibility?, showPresence?, showReadReceipts? }` |
| `POST /users/me/password` | `{ currentPassword, newPassword }`; revokes other sessions |

### 4.3 Friends
| Method & path | Notes |
|---|---|
| `GET /friends` | accepted friends `Friend[]` |
| `GET /friends/requests` | `{ incoming: Friend[], outgoing: Friend[] }` |
| `POST /friends/requests` | `{ userId }` → 201; 409 if exists |
| `POST /friends/requests/:userId/accept` | |
| `POST /friends/requests/:userId/decline` | also cancels an outgoing request |
| `DELETE /friends/:userId` | unfriend |
| `POST /friends/:userId/block`, `DELETE /friends/:userId/block` | |

Friend changes also push WS events (`FRIEND_UPDATED`, see protocol).

### 4.4 Conversations
| Method & path | Notes |
|---|---|
| `GET /conversations?q=&before=&limit=` | Inbox, sorted by `updatedAt` desc; `q` matches title or other member name |
| `POST /conversations` | Direct: `{ type:'direct', userId }` → returns existing if present (200) or creates (201). Group: `{ type:'group', title, memberIds[] }` (2–49 others, all must be friends) |
| `GET /conversations/:id` | Members only |
| `PATCH /conversations/:id` | group: `{ title?, avatarUrl? }` admins/owner |
| `POST /conversations/:id/members` | `{ userIds[] }` admins/owner |
| `DELETE /conversations/:id/members/:userId` | admin removes, or self leaves |
| `POST /conversations/:id/read` | `{ messageId }` → sets pointer, zeroes unread; also pushes `MESSAGE_READ_UPDATED` |
| `PATCH /conversations/:id/mute` | `{ mutedUntil: ISO|null }` |

### 4.5 Messages (history only; writes go through WebSocket)
| Method & path | Notes |
|---|---|
| `GET /conversations/:id/messages?before=&limit=30` | Newest first. `meta: { hasMore, nextCursor }`. Replies include `ReplyPreview`. Deleted messages returned with `deletedAt` and empty content |
| `GET /conversations/:id/messages/:messageId` | single fetch (used for reply jump) |
| `GET /conversations/:id/read-state` | `[ { userId, lastReadMessageId } ]` for seen-by display |

HTTP fallback `POST /conversations/:id/messages` is **not** in v1 (needs Chat 00 approval).

### 4.6 Uploads
`POST /uploads` (multipart, field `file`, optional `conversationId`) → `Attachment` + `publicId` (server-only; not exposed). Limits: images (jpeg, png, webp, gif) ≤ 10 MB; files (pdf, txt, docx, xlsx, pptx, zip) ≤ 10 MB; type checked by magic bytes. The client sends the returned descriptor inside `CHAT_MESSAGE.payload.attachments`; the server re-verifies it belongs to the uploader.

### 4.7 Activity
| Method & path | Notes |
|---|---|
| `GET /activity/me` | `Activity|null` |
| `GET /activity/feed` | Visible activities of friends (+ `everyone` if enabled), `[ { user: User, activity, presence } ]` |
| `PUT /activity/me` | HTTP equivalent for non-realtime clients: `{ type, label?, visibility?, expiresInMin? }`; also broadcasts |
| `DELETE /activity/me` | clear |

The WebSocket events are the primary path in the UI; both go through `activity.service`.

### 4.8 Focus Rooms
| Method & path | Notes |
|---|---|
| `GET /focus-rooms?scope=joinable\|mine` | lobby/running rooms the user may access |
| `GET /focus-rooms/:id` | detail incl. participants; 403 if no access |
| `GET /focus-rooms/:id/messages?before=&limit=` | room chat history |
| `GET /time` | Public. `{ now: ISO }` for client clock offset |

Create/join/leave/start/message are WebSocket events (see protocol).

### 4.9 Polls & Sparks
| Method & path | Notes |
|---|---|
| `GET /polls/:id` | members of the poll's conversation only |
| `GET /sparks/random?kind=question\|challenge` | `{ id, kind, text }` |

### 4.10 Health
`GET /health` → `{ status: 'ok', uptime, db: 'up'|'down' }` (Public, no secrets). Returns 503 if DB is down.

## 5. Security Notes
- Every service method receives `actorId` from the token, never from the body.
- Missing resource and forbidden resource both return `404` where existence is sensitive (conversations, rooms, polls).
- CORS allowlist from `CLIENT_ORIGINS`, `credentials: true`.
- Changes to this file go through Chat 00. Breaking changes require a version bump (`/api/v2`).
