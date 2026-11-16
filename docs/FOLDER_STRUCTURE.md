# PULSE — FOLDER STRUCTURE
Owner: Chat 00. Version 1.0. Created by `node setup-folders.js` (folders only, no files).

## Root
```
pulse/
├── docs/
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

## Backend
```
backend/
├── src/
│   ├── server.js                 http server + ws attach + graceful shutdown
│   ├── app.js                    express app
│   ├── config/                   env.js (zod), db.js, cloudinary.js
│   ├── models/                   User, RefreshToken, Friendship, Conversation, Message,
│   │                             Activity, FocusRoom, RoomMessage, Poll, CanvasSession, CanvasStroke
│   ├── routes/                   index + one file per resource (*.routes.js)
│   ├── controllers/              *.controller.js (HTTP in/out only)
│   ├── services/                 *.service.js (all business + authorization logic)
│   ├── middleware/               authenticate, validate, rateLimit, upload, errorHandler, notFound
│   ├── validators/               zod schemas (HTTP + WS payloads)
│   ├── ws/
│   │   ├── index.js              createWsServer(httpServer)
│   │   ├── connectionManager.js
│   │   ├── roomManager.js
│   │   ├── auth.js               ticket verification on upgrade
│   │   ├── heartbeat.js
│   │   ├── router.js             type → handler dispatch
│   │   ├── envelope.js
│   │   ├── rateLimiter.js
│   │   ├── broadcast.js
│   │   └── handlers/             message, typing, presence, activity, focusRoom, poll, canvas (*.handlers.js)
│   ├── jobs/                     focusTimer.js, activitySweeper.js
│   ├── utils/                    ApiError, asyncHandler, logger, pagination, ids (pairKey), events
│   └── constants/                eventTypes, errorCodes, limits, sparks
├── tests/                        http/, ws/, helpers/
├── .env.example
└── package.json
```

## Frontend
```
frontend/
├── index.html
├── vite.config.js
├── .env.example
├── public/
└── src/
    ├── main.jsx
    ├── app/                      App.jsx, router.jsx, providers.jsx, guards/ (RequireAuth, PublicOnly)
    ├── api/                      client.js, queryKeys.js, endpoints/
    ├── socket/                   SocketProvider.jsx, socketClient.js, eventBus.js, useSocket.js, handlers/
    ├── features/
    │   ├── auth/  profile/  friends/  conversations/  messages/
    │   ├── presence/  activity/  focus-rooms/  sparks/  polls/  canvas/  settings/
    │   │   (each: components/, hooks/, plus api/utils files as needed)
    ├── layouts/                  AppShell.jsx, AuthLayout.jsx, MobileShell.jsx
    ├── pages/                    Home, Messages, Conversation, Activity, FocusRooms, FocusRoom,
    │                             Friends, Settings, Login, Register, NotFound
    ├── components/
    │   ├── ui/                   Button, Input, Avatar, Badge, Modal, Tooltip, Skeleton, Toast ...
    │   └── common/               EmptyState, ErrorState, ConnectionBanner, ErrorBoundary
    ├── hooks/                    useDebounce, useMediaQuery, useInfiniteScroll ...
    ├── styles/                   tokens.css, index.css (Tailwind entry + @theme)
    ├── utils/
    ├── constants/                mirrors backend eventTypes / errorCodes
    ├── assets/
    └── test/
```
Note: the folder script does not create `reset.css`/`typography.css`/`animations.css`; with Tailwind v4 those live inside `styles/index.css`.

## Rules
- Pages are thin; logic in `features/*/hooks` and `api/`.
- Components never call `fetch` or the socket directly.
- Feature folders import from `components/ui` and `api/`, never from each other (shared logic moves to `hooks/` or `utils/`).
- Backend: services never import controllers or ws handlers.
- Any new top-level folder requires Chat 00 approval and an update to this file.
