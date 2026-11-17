import { Link } from 'react-router-dom';
import { PanelRight } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePageFocus } from '../hooks/usePageFocus.js';
import { useIsMobile } from '../hooks/useMediaQuery.js';
import { useAuth } from '../features/auth/useAuth.js';
import { useSocket } from '../socket/useSocket.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { IconButton } from '../components/ui/IconButton.jsx';
import { useShell } from './shellContext.js';

/**
 * One h1 per route; focus moves to it on navigation; document.title set. Mobile: 56px bar, display 20, actions right
 * (44 hit areas). Desktop: roomy heading. `showProfile` = avatar link to Settings (mobile Home/Messages).
 */
export function PageHeader({ title, subtitle, actions, showProfile = false, showActivityToggle = false, documentTitle }) {
  useDocumentTitle(documentTitle || (typeof title === 'string' ? title : ''));
  const h1 = usePageFocus();
  const mobile = useIsMobile();
  const { user } = useAuth();
  const { status } = useSocket();
  const { activityDocked, activityCollapsed, toggleActivity, openActivityDrawer } = useShell();
  const showToggle = showActivityToggle && !mobile && (!activityDocked || activityCollapsed);

  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-line bg-canvas px-4 md:min-h-0 md:border-b-0 md:px-8 md:pb-2 md:pt-8">
      <div className="min-w-0 flex-1">
        <h1 ref={h1} tabIndex={-1} className="truncate font-display text-xl font-semibold text-ink outline-none md:text-[30px] md:leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 hidden font-mono text-[13px] text-ink-muted md:block">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {showToggle && (
          <IconButton label="Show live activity" onClick={activityDocked ? toggleActivity : openActivityDrawer}>
            <PanelRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        )}
        {showProfile && mobile && user && (
          <Link to="/settings" aria-label="Settings" className="hit-44 relative inline-flex rounded-full">
            <Avatar name={user.displayName} src={user.avatarUrl} size={36} presence={status === 'open' ? 'online' : 'offline'} />
          </Link>
        )}
      </div>
    </header>
  );
}
