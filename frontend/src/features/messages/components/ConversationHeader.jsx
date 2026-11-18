import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Info, PanelRight } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { UserRow } from '../../../components/common/UserRow.jsx';
import { usePresence } from '../../presence/usePresence.js';
import { useTyping } from '../../presence/useTyping.js';
import { conversationAvatarUrl, conversationSubtitle, conversationTitle, otherMember } from '../../conversations/utils.js';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle.js';
import { usePageFocus } from '../../../hooks/usePageFocus.js';
import { useIsMobile } from '../../../hooks/useMediaQuery.js';
import { useShell } from '../../../layouts/shellContext.js';

/**
 * Mobile: back chevron (44), avatar 32, name + status line; tapping it opens the Details sheet. Desktop: avatar 36.
 * The only h1 on the route; focus moves here on navigation.
 */
export function ConversationHeader({ conversation, meId }) {
  const mobile = useIsMobile();
  const [details, setDetails] = useState(false);
  const { activityDocked, activityCollapsed, toggleActivity, openActivityDrawer } = useShell();
  const title = conversationTitle(conversation, meId);
  const other = conversation.type === 'direct' ? otherMember(conversation, meId) : null;
  const presence = usePresence(other?.id);
  const typing = useTyping(conversation.id).some((id) => id !== meId);
  useDocumentTitle(title);
  const h1 = usePageFocus();
  const showPanelToggle = !mobile && (!activityDocked || activityCollapsed);
  const info = (
    <>
      <Avatar name={title} src={conversationAvatarUrl(conversation, meId)} size={mobile ? 28 : 36} className={mobile ? 'size-8' : undefined} presence={other ? presence : undefined} />
      <span className="min-w-0 text-left">
        <h1 ref={h1} tabIndex={-1} className="truncate text-[15px] font-semibold text-ink outline-none">{title}</h1>
        <span className="block truncate text-[13px] text-ink-muted">{typing ? <span className="text-accent">typing…</span> : <>{conversationSubtitle(conversation, meId)}{other && presence !== 'offline' ? ` · ${presence}` : ''}</>}</span>
      </span>
    </>
  );
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 md:px-6">
      {mobile && <Link to="/messages" aria-label="Back to messages" className="hit-44 grid size-10 shrink-0 place-items-center rounded-md text-ink"><ChevronLeft size={22} strokeWidth={1.5} aria-hidden="true" /></Link>}
      <button type="button" onClick={() => setDetails(true)} aria-label={`${title}, details`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pl-2 pr-2">
        {info}
      </button>
      {showPanelToggle && <IconButton label="Show live activity" onClick={activityDocked ? toggleActivity : openActivityDrawer}><PanelRight size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      <IconButton label="Conversation details" onClick={() => setDetails(true)}><Info size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>

      <Modal open={details} onClose={() => setDetails(false)} title={conversation.type === 'group' ? title : 'Details'}>
        <h3 className="mb-1 font-mono text-xs uppercase tracking-wider text-ink-faint">{conversation.type === 'group' ? `${conversation.members.length} members` : 'Member'}</h3>
        <ul className="-mx-4">
          {conversation.members.map((m) => (
            <li key={m.user.id}>
              <UserRow user={m.user} live={m.user.id !== meId} actions={m.role !== 'member' ? <span className="font-mono text-xs text-ink-muted">{m.role}</span> : null} />
            </li>
          ))}
        </ul>
      </Modal>
    </header>
  );
}
