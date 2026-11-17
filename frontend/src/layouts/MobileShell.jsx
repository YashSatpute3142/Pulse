import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar.jsx';
import { ShellContext } from './shellContext.js';
import { ConnectionBanner } from '../components/common/ConnectionBanner.jsx';
import { SkipLink } from '../components/common/SkipLink.jsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useVisualViewport } from '../hooks/useVisualViewport.js';
import { useSocket } from '../socket/useSocket.js';

const mobileCtx = { activityDocked: false, activityCollapsed: false, toggleActivity: () => {}, openActivityDrawer: () => {} };

/**
 * < 768. Column: banner, main (scrolls), bottom tab bar. The tab bar is hidden on /messages/:id and /focus/:id
 * and while the on-screen keyboard is open (visualViewport). Height uses dvh, never vh.
 */
export default function MobileShell() {
  const { pathname } = useLocation();
  const { status } = useSocket();
  const online = useOnlineStatus();
  const { keyboardOpen } = useVisualViewport();
  const immersive = !!matchPath('/messages/:id', pathname) || !!matchPath('/focus/:id', pathname);
  const showTabs = !immersive && !keyboardOpen;

  return (
    <ShellContext.Provider value={mobileCtx}>
      <SkipLink />
      <div className="flex h-dvh flex-col bg-canvas">
        <ConnectionBanner status={status} online={online} />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
        {showTabs && <TabBar />}
      </div>
    </ShellContext.Provider>
  );
}
