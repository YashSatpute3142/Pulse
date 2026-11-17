import { useCallback, useMemo, useState } from 'react';
import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { NavRail } from './NavRail.jsx';
import { ShellContext } from './shellContext.js';
import { ConversationListPane } from '../features/conversations/components/ConversationListPane.jsx';
import { ActivityPanel } from '../features/activity/components/ActivityPanel.jsx';
import { ConnectionBanner } from '../components/common/ConnectionBanner.jsx';
import { SkipLink } from '../components/common/SkipLink.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useSocket } from '../socket/useSocket.js';
import { safeStorage } from '../utils/storage.js';

const PANEL_KEY = 'pulse-activity-panel';

/**
 * >= 768. Zones: nav 64 | conversation list 280 (md) / 300 (lg+) | main | activity 320 (docked >= 1280, drawer below).
 * Conversation list + activity panel appear on Home and Messages only (Activity, Focus, Friends, Settings use the full width).
 * Wide >= 1536: widths stay fixed, the main pane grows.
 */
export default function AppShell() {
  const { pathname } = useLocation();
  const { status } = useSocket();
  const online = useOnlineStatus();
  const docked = useMediaQuery('(min-width: 1280px)');
  const withPanes = !!matchPath('/', pathname) || !!matchPath('/messages/*', pathname);
  const [collapsed, setCollapsed] = useState(() => safeStorage.get(PANEL_KEY) === 'collapsed');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleActivity = useCallback(() => setCollapsed((c) => { safeStorage.set(PANEL_KEY, c ? 'open' : 'collapsed'); return !c; }), []);
  const openActivityDrawer = useCallback(() => setDrawerOpen(true), []);
  const ctx = useMemo(() => ({ activityDocked: docked, activityCollapsed: collapsed, toggleActivity, openActivityDrawer }), [docked, collapsed, toggleActivity, openActivityDrawer]);

  return (
    <ShellContext.Provider value={ctx}>
      <SkipLink />
      <div className="flex h-dvh bg-canvas">
        <NavRail />
        {withPanes && (
          <aside aria-label="Conversations" className="w-[280px] shrink-0 border-r border-line bg-s1 lg:w-[300px]">
            <ConversationListPane />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <ConnectionBanner status={status} online={online} />
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        {withPanes && docked && !collapsed && (
          <aside aria-label="Live activity" className="w-80 shrink-0 border-l border-line bg-s1">
            <ActivityPanel onCollapse={toggleActivity} />
          </aside>
        )}
      </div>
      <Drawer open={drawerOpen && (!docked || collapsed)} onClose={() => setDrawerOpen(false)} title="Live now">
        <ActivityPanel showHeader={false} />
      </Drawer>
    </ShellContext.Provider>
  );
}
