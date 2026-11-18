import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { CountPill } from '../../../components/ui/CountPill.jsx';
import { usePresence } from '../../presence/usePresence.js';
import { useTyping } from '../../presence/useTyping.js';
import { conversationAvatarUrl, conversationTitle, otherMember, previewLine } from '../utils.js';
import { formatListTime } from '../../../utils/time.js';
import { cx } from '../../../utils/cx.js';

/** Row (DESIGN_SYSTEM 8): avatar, name 500 (600 unread), mono time, one-line preview, ember unread pill. Selected = --s3 + 2px ember bar. */
export const ConversationRow = memo(function ConversationRow({ conversation, meId, selected, avatarSize = 36 }) {
  const title = conversationTitle(conversation, meId);
  const other = conversation.type === 'direct' ? otherMember(conversation, meId) : null;
  const presence = usePresence(other?.id);
  const typingIds = useTyping(conversation.id).filter((id) => id !== meId);
  const unread = conversation.unreadCount || 0;
  const time = formatListTime(conversation.lastMessage?.at || conversation.updatedAt);
  return (
    <Link
      to={`/messages/${conversation.id}`}
      aria-current={selected ? 'true' : undefined}
      className={cx('relative flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] [@media(hover:hover)]:hover:bg-s3', selected && 'bg-s3')}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <Avatar name={title} src={conversationAvatarUrl(conversation, meId)} size={avatarSize} presence={other ? presence : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx('truncate text-sm text-ink', unread ? 'font-semibold' : 'font-medium')}>{title}</span>
          <time dateTime={conversation.lastMessage?.at || conversation.updatedAt} className={cx('shrink-0 font-mono text-xs', selected ? 'text-ink-muted' : 'text-ink-faint')}>{time}</time>
        </div>
        <div className="flex items-center justify-between gap-2">
          {typingIds.length ? <span className="truncate text-sm text-accent">typing…</span> : <span className="truncate text-sm text-ink-muted">{previewLine(conversation, meId)}</span>}
          <CountPill count={unread} label={`${unread} unread ${unread === 1 ? 'message' : 'messages'}`} />
        </div>
      </div>
    </Link>
  );
});
