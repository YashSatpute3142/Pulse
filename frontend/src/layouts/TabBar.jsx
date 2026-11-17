import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems.js';
import { CountPill } from '../components/ui/CountPill.jsx';
import { cx } from '../utils/cx.js';

/** Mobile bottom tabs: 56 + safe area, --s1, top border. Icon 22, 11px label, 2px ember bar on the selected top edge. */
export function TabBar({ unreadMessages = 0 }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="pb-safe flex shrink-0 border-t border-line bg-s1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end, match }) => {
        const active = !!matchPath({ path: match || to, end: !!end }, pathname);
        return (
          <NavLink key={to} to={to} end={end} className={cx('relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5', active ? 'text-ink' : 'text-ink-muted')}>
            {active && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 bg-accent" />}
            <span className="relative">
              <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
              {label === 'Messages' && unreadMessages > 0 && <CountPill count={unreadMessages} label={`${unreadMessages} unread messages`} className="absolute -right-3 -top-2" />}
            </span>
            <span className="text-[11px] leading-none">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
