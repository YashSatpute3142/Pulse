import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './guards/RequireAuth.jsx';
import { PublicOnly } from './guards/PublicOnly.jsx';
import RouteError from './RouteError.jsx';
import { Splash } from '../components/common/Splash.jsx';

// Every screen is code-split. `page(() => import(...))` adapts a default-export module to a data-router lazy route.
const page = (load) => async () => ({ Component: (await load()).default });

const routes = [
  {
    errorElement: <RouteError />,
    HydrateFallback: Splash, // no blank flash while the first lazy route chunk loads
    children: [
      {
        element: <PublicOnly />,
        children: [
          {
            lazy: page(() => import('../layouts/AuthLayout.jsx')),
            children: [
              { path: '/login', lazy: page(() => import('../pages/Login.jsx')) },
              { path: '/register', lazy: page(() => import('../pages/Register.jsx')) },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/',
            lazy: page(() => import('../layouts/ShellSwitch.jsx')),
            children: [
              { index: true, lazy: page(() => import('../pages/Home.jsx')) },
              { path: 'messages', lazy: page(() => import('../pages/Messages.jsx')) },
              { path: 'messages/:conversationId', lazy: page(() => import('../pages/Conversation.jsx')) },
              { path: 'activity', lazy: page(() => import('../pages/Activity.jsx')) },
              { path: 'focus', lazy: page(() => import('../pages/FocusRooms.jsx')) },
              { path: 'focus/:roomId', lazy: page(() => import('../pages/FocusRoom.jsx')) },
              { path: 'friends', lazy: page(() => import('../pages/Friends.jsx')) },
              { path: 'settings', lazy: page(() => import('../pages/Settings.jsx')) },
              { path: '*', lazy: page(() => import('../pages/NotFound.jsx')) },
            ],
          },
        ],
      },
      // Dev-only component gallery; the branch is removed from production builds.
      ...(import.meta.env.DEV ? [{ path: '/dev/ui', lazy: page(() => import('../dev/UiGallery.jsx')) }] : []),
    ],
  },
];

export const router = createBrowserRouter(routes);
export { routes };
