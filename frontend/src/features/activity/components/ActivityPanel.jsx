import { PanelRightClose } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { ActivityList } from './ActivityList.jsx';

/** Right "Live now" panel (320 docked >= 1280, same content in the drawer below). Scrolls on its own. */
export function ActivityPanel({ onCollapse, showHeader = true }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeader && (
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink-faint">Live now</h2>
          {onCollapse && <IconButton label="Hide live activity" onClick={onCollapse} tooltip={false}><PanelRightClose size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto"><ActivityList /></div>
    </div>
  );
}
