# PULSE — DATABASE SCHEMA v1.0
Owner: Chat 05 (Database Architect). Consumers: Chat 03 (Backend), 04 (WebSocket), 06 (Features).
Place in `docs/DATABASE_SCHEMA.md`. MongoDB (Atlas) + Mongoose 8, ESM.

Changes to this file require Chat 00 approval. Backend/WS chats must not add fields or indexes without updating it.

---

## 1. Principles

1. **Reference, don't embed unbounded data.** Messages, room messages and canvas strokes are their own collections. Embedded arrays are used only when bounded (conversation members ≤ 50, room participants ≤ 20, poll votes ≤ 50, reactions ≤ 20 emoji per message).
2. **IDs:** native `ObjectId`. API returns them as strings. Client-generated `clientId` (UUID) is used for idempotent sends.
3. **Cursor pagination only** (by `_id`), never `skip`.
4. **Soft delete** for messages (`deletedAt`); content is blanked on delete so it cannot leak.
5. **Atomic updates** (`$inc`, `$addToSet`, `$pull`, arrayFilters, unique indexes) instead of read-modify-write. Race conditions (double vote, double join) are prevented at the DB level, not just in service code.
6. **Presence is in memory** (WebSocket connection manager). Only `lastSeenAt` is persisted, on last-socket disconnect.
7. **Timestamps:** `{ timestamps: true }` on every schema.
8. **Hide secrets:** `passwordHash` has `select: false`; `toJSON` transform removes `__v` and `passwordHash`.
9. Read paths use `.lean()` and field projection.

---

## 2. Collections Overview

| Collection | Purpose | Approx. growth |
|---|---|---|
| `users` | Accounts and profile/preferences | low |
| `refreshtokens` | Hashed refresh tokens, rotation families | medium, TTL cleaned |
| `friendships` | Friend requests, accepted friends, blocks | low–medium |
| `conversations` | Direct and group conversations + per-member read state | medium |
| `messages` | All conversation messages | **high** |
| `activities` | One live-activity doc per user | = users |
| `focusrooms` | Focus sessions + participants | medium |
| `roommessages` | Chat inside focus rooms | medium |
| `polls` | Polls with votes | low–medium |
| `canvassessions` | Shared canvas metadata | low |
| `canvasstrokes` | Individual strokes | medium, TTL cleaned |

Sparks (conversation starters) are a static array in backend code (`constants/sparks.js`), not a collection.

---

## 3. Schemas

### 3.1 User
```js
const userSchema = new Schema({
  username:      { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
  usernameLower: { type: String, required: true },          // set in pre-validate; unique
  email:         { type: String, required: true, trim: true, lowercase: true },
  passwordHash:  { type: String, required: true, select: false },
  displayName:   { type: String, required: true, trim: true, maxlength: 40 },
  displayNameLower: { type: String, required: true },
  avatarUrl:     { type: String, default: null },
  bio:           { type: String, default: '', maxlength: 160 },
  settings: {
    theme:              { type: String, enum: ['system', 'dark', 'light'], default: 'system' },
    activityVisibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'friends' },
    showPresence:       { type: Boolean, default: true },   // false => always appears offline to others
    showReadReceipts:   { type: Boolean, default: true },
  },
  lastSeenAt:    { type: Date, default: null },
  tokenVersion:  { type: Number, default: 0 },              // bump to invalidate all access tokens
  disabledAt:    { type: Date, default: null },
}, { timestamps: true });

userSchema.index({ usernameLower: 1 }, { unique: true });
userSchema.index({ email: 1 },         { unique: true });
userSchema.index({ displayNameLower: 1 });                  // prefix search
```
Search: `GET /users/search?q=` uses an anchored, escaped prefix regex on `usernameLower` / `displayNameLower` (index-friendly), limit 20.

### 3.2 RefreshToken
```js
const refreshTokenSchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  tokenHash:  { type: String, required: true },             // SHA-256 of the token
  familyId:   { type: String, required: true },             // rotation chain id
  replacedBy: { type: ObjectId, ref: 'RefreshToken', default: null },
  revokedAt:  { type: Date, default: null },
  expiresAt:  { type: Date, required: true },
  userAgent:  { type: String, default: '' },
  ip:         { type: String, default: '' },
}, { timestamps: true });

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });   // TTL
```
Reuse of a revoked token ⇒ revoke the whole `familyId` (auth service, Chat 03).

### 3.3 Friendship
Normalized so a pair has exactly one document.
```js
const friendshipSchema = new Schema({
  userA:       { type: ObjectId, ref: 'User', required: true },   // lexicographically smaller id
  userB:       { type: ObjectId, ref: 'User', required: true },   // larger id
  requestedBy: { type: ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
  blockedBy:   { type: ObjectId, ref: 'User', default: null },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendshipSchema.index({ userA: 1, status: 1 });
friendshipSchema.index({ userB: 1, status: 1 });
```
Helper `pairKey(idX, idY)` in `utils/ids.js` returns `[userA, userB]`, used everywhere. Friend list = query both indexes with `$or`.

### 3.4 Conversation
```js
const memberSchema = new Schema({
  user:              { type: ObjectId, ref: 'User', required: true },
  role:              { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt:          { type: Date, default: Date.now },
  lastReadMessageId: { type: ObjectId, default: null },
  lastReadAt:        { type: Date, default: null },
  unreadCount:       { type: Number, default: 0, min: 0 },
  mutedUntil:        { type: Date, default: null },
  leftAt:            { type: Date, default: null },            // soft leave keeps history readable to admins
}, { _id: false });

const conversationSchema = new Schema({
  type:      { type: String, enum: ['direct', 'group'], required: true },
  directKey: { type: String, default: undefined },             // "idA:idB" sorted; direct only
  title:     { type: String, trim: true, maxlength: 60 },      // group only
  avatarUrl: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  members:   { type: [memberSchema], validate: [v => v.length >= 2 && v.length <= 50, 'members 2-50'] },
  lastMessage: {
    messageId: ObjectId,
    senderId:  ObjectId,
    preview:   String,            // max 120 chars; "Photo", "Document", "Poll" for non-text
    type:      String,
    at:        Date,
  },
}, { timestamps: true });

conversationSchema.index({ 'members.user': 1, updatedAt: -1 });          // inbox list
conversationSchema.index({ directKey: 1 },
  { unique: true, partialFilterExpression: { type: 'direct' } });        // one DM per pair
```
- **Unread counts:** on message create, one atomic update increments `unreadCount` for every member except the sender: `updateOne({_id}, {$inc:{'members.$[o].unreadCount':1}, $set:{lastMessage, updatedAt}}, {arrayFilters:[{'o.user':{$ne:senderId}}]})`. On read: set `lastReadMessageId`, `lastReadAt`, `unreadCount: 0` for that member.
- **Read receipts** are derived: "seen by" for message M = members whose `lastReadMessageId >= M._id` (ObjectIds are time-ordered). No per-message receipt writes.
- Conversation search: `q` matches `title` (prefix, case-insensitive) or the other member's display name via the `users` prefix index (service performs the user lookup first, then filters conversations by those ids).

### 3.5 Message
```js
const attachmentSchema = new Schema({
  kind:     { type: String, enum: ['image', 'file'], required: true },
  url:      { type: String, required: true },
  publicId: { type: String, required: true },     // storage id, for deletion
  name:     { type: String, maxlength: 200 },
  mime:     { type: String },
  size:     { type: Number },                     // bytes
  width: Number, height: Number,
}, { _id: false });

const messageSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: ObjectId, ref: 'User', default: null },     // null for system
  type:           { type: String, enum: ['text', 'image', 'file', 'poll', 'system'], default: 'text' },
  text:           { type: String, default: '', maxlength: 4000 },
  attachments:    { type: [attachmentSchema], default: [], validate: [v => v.length <= 5, 'max 5'] },
  replyTo:        { type: ObjectId, ref: 'Message', default: null },
  pollId:         { type: ObjectId, ref: 'Poll', default: null },
  reactions: [{ _id: false, emoji: { type: String, maxlength: 16 }, users: [{ type: ObjectId, ref: 'User' }] }],
  clientId:       { type: String, default: undefined },               // idempotency key
  editedAt:       { type: Date, default: null },
  deletedAt:      { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, _id: -1 });                  // history pagination
messageSchema.index({ conversationId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });   // dedupe retries
```
- History query: `find({ conversationId, _id: { $lt: before } }).sort({ _id: -1 }).limit(limit+1)`; `hasMore` from the extra row.
- Reply preview is populated on read (`replyTo` lookup, projected to `senderId, text(first 120), type, deletedAt`).
- Edit: only sender, only `type: text`, within 24 h of creation (policy, enforced by service). Sets `editedAt`.
- Delete: sender (or group admin), sets `deletedAt`, blanks `text`, empties `attachments`, removes files from storage.
- Reactions: add `$addToSet` to the matching emoji entry (or `$push` new entry); remove `$pull`; remove empty entries. One user may react with several different emoji, once each.

### 3.6 Activity
One document per user; upserted.
```js
const activitySchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['studying','coding','gaming','music','working','break','available'], required: true },
  label:      { type: String, trim: true, maxlength: 60, default: '' },   // "Organic Chem"
  visibility: { type: String, enum: ['everyone','friends','nobody'], default: 'friends' },
  startedAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, default: null },
}, { timestamps: true });                                                  // updatedAt = "updated 12m ago"

activitySchema.index({ userId: 1 }, { unique: true });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });         // docs with null are not expired
```
Clearing = delete the doc. Because TTL deletion is silent and runs about once a minute, a server job also sweeps expired activities and broadcasts `ACTIVITY_CHANGED` (cleared); TTL is only the backstop. `visibility` is copied from the user's default at publish time and can be overridden per activity.
Feed query: friends' ids (from Friendship) + `visibility in (everyone, friends)` + `everyone` for non-friends if allowed; the service enforces this, never the client.

### 3.7 FocusRoom
```js
const focusRoomSchema = new Schema({
  title:       { type: String, required: true, trim: true, maxlength: 60 },
  hostId:      { type: ObjectId, ref: 'User', required: true },
  durationSec: { type: Number, required: true, min: 300, max: 14400 },     // 5 min - 4 h
  status:      { type: String, enum: ['lobby','running','completed','cancelled'], default: 'lobby' },
  startedAt:   { type: Date, default: null },
  endsAt:      { type: Date, default: null },                              // timer authority
  completedAt: { type: Date, default: null },
  invited:     [{ type: ObjectId, ref: 'User' }],
  participants: [{
    _id: false,
    user:     { type: ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt:   { type: Date, default: null },                               // null = currently in room
  }],
}, { timestamps: true });

focusRoomSchema.index({ status: 1, endsAt: 1 });                           // timer recovery on restart
focusRoomSchema.index({ 'participants.user': 1, status: 1 });
focusRoomSchema.index({ invited: 1, status: 1 });
focusRoomSchema.index({ hostId: 1, createdAt: -1 });
```
- Access: host, invited users, or friends of host (policy decided in Stage 5). Join is rejected otherwise.
- Join/leave use atomic updates with `arrayFilters` (a user cannot appear twice as active).
- Start (host only): atomic `findOneAndUpdate({_id, status:'lobby', hostId}, {status:'running', startedAt: now, endsAt: now+duration})`.
- On boot, `jobs/focusTimer.js` loads `status:'running'` rooms and re-arms timers; rooms whose `endsAt` has passed are completed immediately.
- If a running room has had zero active participants for 5 minutes, it is cancelled (job).

### 3.8 RoomMessage
```js
const roomMessageSchema = new Schema({
  roomId:   { type: ObjectId, ref: 'FocusRoom', required: true },
  senderId: { type: ObjectId, ref: 'User', default: null },                // null = system line
  kind:     { type: String, enum: ['text', 'join', 'leave', 'start', 'complete'], default: 'text' },
  text:     { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

roomMessageSchema.index({ roomId: 1, _id: -1 });
roomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });   // 30-day retention
```

### 3.9 Poll
```js
const pollSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  messageId:      { type: ObjectId, ref: 'Message', default: null },
  creatorId:      { type: ObjectId, ref: 'User', required: true },
  question:       { type: String, required: true, trim: true, maxlength: 200 },
  options: { type: [{ _id: false, id: { type: String, required: true }, text: { type: String, maxlength: 80 } }],
             validate: [v => v.length >= 2 && v.length <= 8, '2-8 options'] },
  multiple:       { type: Boolean, default: false },
  anonymous:      { type: Boolean, default: false },
  votes: [{ _id: false, user: { type: ObjectId, ref: 'User' }, optionIds: [String], at: { type: Date, default: Date.now } }],
  closesAt:       { type: Date, default: null },
  closedAt:       { type: Date, default: null },
}, { timestamps: true });

pollSchema.index({ conversationId: 1, createdAt: -1 });
```
One vote per user: vote = atomic "replace my entry" (`$pull` my entry then `$push`) guarded by the filter `{ closedAt: null, 'options.id': { $all: optionIds } }`, or `bulkWrite` of both ops. For `anonymous`, the API returns counts only, never voters (the data is still stored for dedupe).
Results are computed in the service from `votes`; sent as `{ optionId: count }` plus `myVote`.

### 3.10 CanvasSession and CanvasStroke
```js
const canvasSessionSchema = new Schema({
  ownerType: { type: String, enum: ['conversation', 'room'], required: true },
  ownerId:   { type: ObjectId, required: true },
  seq:       { type: Number, default: 0 },          // monotonic stroke counter
  clearedAt: { type: Date, default: null },
}, { timestamps: true });
canvasSessionSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

const canvasStrokeSchema = new Schema({
  sessionId: { type: ObjectId, ref: 'CanvasSession', required: true },
  authorId:  { type: ObjectId, ref: 'User', required: true },
  seq:       { type: Number, required: true },
  tool:      { type: String, enum: ['pen','eraser','line','rect','ellipse'], default: 'pen' },
  color:     { type: String, match: /^#[0-9a-fA-F]{6}$/ },
  size:      { type: Number, min: 1, max: 32 },
  points:    { type: [Number], validate: [v => v.length <= 2000, 'too many points'] },   // flat [x0,y0,x1,y1...] normalized 0-1
}, { timestamps: true });
canvasStrokeSchema.index({ sessionId: 1, seq: 1 });
canvasStrokeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });   // 14-day retention
```
Live drawing events are broadcast without a DB write per point; a stroke is persisted **once** when completed (`stroke end`). "Clear" deletes strokes and sets `clearedAt`.

---

## 4. Relationships

```
User 1─* RefreshToken
User *─* User            (Friendship, normalized pair)
User *─* Conversation    (Conversation.members[].user)
Conversation 1─* Message
Message *─1 Message      (replyTo)
Message 1─0..1 Poll      (pollId <-> Poll.messageId)
User 1─0..1 Activity
User 1─* FocusRoom       (host);  User *─* FocusRoom (participants / invited)
FocusRoom 1─* RoomMessage
Conversation|FocusRoom 1─0..1 CanvasSession 1─* CanvasStroke
```

## 5. Authorization Queries (service layer, used by HTTP and WS identically)

| Check | Query |
|---|---|
| Is member of conversation | `Conversation.exists({ _id, 'members': { $elemMatch: { user, leftAt: null } } })` |
| Are friends | `Friendship.exists({ userA, userB, status: 'accepted' })` using `pairKey` |
| Blocked | `Friendship.exists({ userA, userB, status: 'blocked' })`; DMs cannot be created and activity is hidden |
| Can see activity | owner, or visibility `everyone`, or `friends` and accepted friendship |
| Can join room | host, in `invited`, or accepted friend of host |
| Can vote | member of poll's conversation, poll not closed |

Membership results may be cached per socket (invalidated on `CONVERSATION_UPDATED`), never trusted from client input.

## 6. Retention & Cleanup

| Data | Rule |
|---|---|
| Refresh tokens | TTL on `expiresAt` |
| Room messages | 30 days after creation |
| Canvas strokes | 14 days |
| Activities | TTL on optional `expiresAt` + sweeper job |
| Orphaned uploads | Weekly job compares storage ids to `messages.attachments.publicId` (Chat 08, later) |

## 7. Connection & Operational Settings (`config/db.js`)
`mongoose.set('strictQuery', true)`, `autoIndex: true` in dev, **false in production** (indexes synced by `npm run db:sync-indexes` during deploy), `maxPoolSize: 20`, `serverSelectionTimeoutMS: 8000`, retry-writes on. Connection string only from `MONGODB_URI`. Graceful `mongoose.disconnect()` on SIGTERM.

## 8. Migration from the Existing App
Unknown until the audit (Phase 0). If the current app stores chat data in memory or a different shape, no data migration is assumed; if it already uses MongoDB, Chat 05 writes a one-off script mapping old collections into Section 3 and proposes it to Chat 00 before running.

## 9. Test Plan (Chat 07 + Chat 05)
- Unique constraints: duplicate username/email, duplicate DM for one pair (race with two concurrent creates), duplicate `clientId`.
- Concurrency: 20 simultaneous votes by the same user → exactly one vote; double join → one active participant; two concurrent reads/unread increments are consistent.
- Pagination: 10k messages, no duplicates or gaps across pages; `explain()` shows index use on every list query.
- TTL and cleanup behaviour; refresh-token family revocation.

---

## IMPLEMENTATION REPORT
1. Task: Design MongoDB architecture for Pulse
2. Role: Chat 05 Database Architect
3. Files inspected: `MASTER_PLAN.md`, `DESIGN_SYSTEM.md`, master prompt (no codebase available)
4. Files created: `docs/DATABASE_SCHEMA.md`
5. Files modified: none
6. Features implemented: schema design only (no code in repo yet)
7. API changes: none (implies conversation/message payload shapes; Chat 03 formalizes in `API_CONTRACT.md`)
8. WebSocket event changes: none (Chat 04 must use `clientId` for idempotent `CHAT_MESSAGE`)
9. Database changes: 11 collections with indexes defined (Section 3)
10. Dependencies added: none (`mongoose` only, plus `mongodb-memory-server` for tests, proposed)
11. Tests executed: none
12. Test results: n/a
13. Known issues: Existing data shape unknown; room-access policy (friends of host) and message edit window (24 h) are proposals needing your OK
14. Pending work: implement models in `backend/src/models` once Phase 1 backend foundation exists; `db:sync-indexes` script
15. Integration requirements: Chat 03 implements `utils/ids.js` `pairKey`, auth queries from Section 5; Chat 04 uses unread/read semantics from 3.4; Chat 06 uses Activity/FocusRoom/Poll/Canvas contracts
