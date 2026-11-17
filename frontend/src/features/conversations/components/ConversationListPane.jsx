import { MessageSquare, Plus } from 'lucide-react';
import { SearchField } from '../../../components/common/SearchField.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';

/**
 * Conversation list pane (300 desktop / full screen on mobile).
 * Phase 2: the shell and its states only. No conversations API is wired yet, so the search and "new" controls are
 * disabled and the body says so. Phase 3 replaces the body with the real infinite list.
 */
export function ConversationListPane({ showTitle = true }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showTitle && (
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <h2 className="font-display text-xl font-semibold text-ink">Messages</h2>
          <IconButton label="New conversation (available with messaging)" disabled tooltip={false}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        </div>
      )}
      <div className="px-4 pb-3"><SearchField value="" onChange={() => {}} placeholder="Search conversations" hotkey={false} disabled /></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EmptyState icon={MessageSquare} title="Conversations load here" description="The conversation list is connected in Phase 3 (messaging)." />
      </div>
    </div>
  );
}
