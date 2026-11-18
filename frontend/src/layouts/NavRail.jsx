import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { NAV_ITEMS } from './navItems.js';
import { Mark } from '../components/common/Logo.jsx';
import { Tooltip } from '../components/ui/Tooltip.jsx';
import { CountPill } from '../components/ui/CountPill.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { useAuth } from '../features/auth/useAuth.js';
import { useSocket } from '../socket/useSocket.js';
import { useUnreadTotal } from '../features/conversations/hooks/useConversations.js';
import { cx } from '../utils/cx.js';

function RailItem({ to, label, icon: Icon, active, end, badge }) {
  return (
    <div className="relative flex w-full justify-center">
      {active && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 bg-accent" />}
      <Tooltip label={label}>
        <NavLink
          to={to} end={end} aria-label={label}
          className={cx('relative grid size-11 place-items-center rounded-md text-ink-muted transition-colors duration-[120ms] [@media(hover:hover)]:hover:text-ink', active && 'bg-s3 text-ink')}
        >
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
          {badge > 0 && <CountPill count={badge} label={`${badge} unread messages`} className="absolute -right-1 -top-1" />}
        </NavLink>
      </Tooltip>
    </div>
  );
}

/** Nav rail 64: mark 32 top, five icon buttons 44x44, settings + own avatar bottom. Icons only, tooltip + aria-label. */
export function NavRail() {
  const unreadMessages = useUnreadTotal();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { status } = useSocket();
  const isActive = (item) => !!matchPath({ path: item.match || item.to, end: !!item.end }, pathname);
  return (
    <nav aria-label="Primary" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-canvas py-3">
      <div className="mb-3"><Mark size={32} /></div>
      {NAV_ITEMS.map((item) => (
        <RailItem key={item.to} {...item} active={isActive(item)} badge={item.label === 'Messages' ? unreadMessages : 0} />
      ))}
      <div className="mt-auto flex w-full flex-col items-center gap-3">
        <RailItem to="/settings" label="Settings" icon={Settings} active={!!matchPath('/settings/*', pathname)} />
        {user && <Avatar name={user.displayName} src={user.avatarUrl} size={36} presence={status === 'open' ? 'online' : 'offline'} decorative={false} />}
      </div>
    </nav>
  );
}
