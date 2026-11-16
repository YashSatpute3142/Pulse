# PULSE — PROJECT OVERVIEW
Owner: Chat 00 (Master Architect). Status: v1.0 draft, pending codebase audit.

## 1. Vision
**Pulse** is a real-time social communication platform. Tagline: **"Conversations that feel alive."**
People talk through messages, publish what they are doing (Live Activity), and work together in shared focus sessions (Focus Rooms). It must have its own identity, not a WhatsApp or Discord clone, and must not look like generic AI-generated UI (see `DESIGN_SYSTEM.md`, Section 1).

## 2. Feature Scope
| Area | Features |
|---|---|
| Accounts | Register, login, profiles, privacy settings, JWT auth with refresh rotation |
| Social | Friends, requests, blocking, user search |
| Messaging | Direct and group chats, persistent history with pagination, replies, reactions, edit, delete, typing indicators, read receipts, unread counts, conversation search, image and document sharing |
| Presence | Online / away / offline, multi-tab aware |
| **Live Activity** (signature) | Publish current activity, live friend feed, visibility control (everyone / friends / nobody), clear or change anytime |
| **Focus Rooms** (signature) | Create room, title, duration, invite friends, join/leave, participants, server-controlled synchronized timer, room chat, completion notice |
| Extras | Conversation Sparks, Instant Polls, Shared Live Canvas (each a separate module) |

## 3. Non-Goals (v1)
Voice/video calls, end-to-end encryption, native mobile apps, push notifications, message search across conversations, multi-instance scaling (designed for, not built), email verification (pending decision, see Open Questions).

## 4. Technology Stack (locked)
| Layer | Choice |
|---|---|
| Frontend | React, Vite, JavaScript, Tailwind CSS v4, `react-router-dom`, `@tanstack/react-query`, `lucide-react` |
| Backend | Node.js, Express (ESM), native `ws` (**no Socket.IO**) |
| Database | MongoDB (Atlas), Mongoose 8 |
| Auth | JWT access token (15 min, memory only) + rotating refresh token (httpOnly cookie) |
| Validation | `zod` |
| Security | `helmet`, `cors`, `express-rate-limit`, `bcrypt`, `cookie-parser` |
| Uploads | `multer` + Cloudinary |
| Logging | `pino` |
| Testing | Vitest, React Testing Library, Supertest, `mongodb-memory-server`, `ws` test client |
| Deploy | Vercel (frontend), Render (backend) |

New dependencies must be justified in an Implementation Report and approved by Chat 00.

## 5. Team (AI chats)
| Chat | Role |
|---|---|
| 00 | Master Architect / PM |
| 01 | UI/UX Designer |
| 02 | Frontend Architect |
| 03 | Backend Architect |
| 04 | WebSocket Specialist |
| 05 | Database Architect |
| 06 | Feature Development |
| 07 | Security & QA |
| 08 | DevOps |

Ownership details are in `ARCHITECTURE.md` Section 7.

## 6. Document Index (source of truth)
`PROJECT_OVERVIEW.md` · `ARCHITECTURE.md` · `FOLDER_STRUCTURE.md` · `DATABASE_SCHEMA.md` · `API_CONTRACT.md` · `WEBSOCKET_PROTOCOL.md` · `DESIGN_SYSTEM.md` · `DEVELOPMENT_ROADMAP.md` · `IMPLEMENTATION_STATUS.md` · `ENVIRONMENT_VARIABLES.md`

Contracts (`API_CONTRACT`, `WEBSOCKET_PROTOCOL`, `DATABASE_SCHEMA`, `DESIGN_SYSTEM`) change only through Chat 00.

## 7. Working Rules (summary of the Master prompt)
1. Inspect before editing. 2. Never rewrite unnecessarily. 3. Respect module ownership. 4. No fake implementations. 5. Stay consistent with contracts. 6. Security first. 7. Test every change and report honestly. 8. Document every change. Every task ends with the 15-point **Implementation Report**.

## 8. Open Questions (need owner decision)
1. Where is the existing codebase and how will it be shared for the audit?
2. Cloudinary for uploads, or another provider?
3. Email verification and password reset in v1?
4. Can any registered user DM anyone, or only friends? (Docs currently assume: anyone may send a friend request; DMs require accepted friendship. Change if you disagree.)
5. Limits: 50 group members, 10 MB attachments (proposed defaults).
6. Message send when offline: queue and retry for 30 s, then mark failed (proposed default).
7. ~~Design: accent colour, logo mark, message layout~~ Resolved 2026-11-16: all three approved (see `DESIGN_SYSTEM.md` v1.1). Still to review: drawn logo, mockups, light-theme token adjustments.
8. Focus room access: host, invited, or friends of host (proposed).
9. Message edit window: 24 h (proposed).
