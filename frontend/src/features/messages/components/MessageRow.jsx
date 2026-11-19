import { memo } from 'react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { ReplyQuote } from './ReplyQuote.jsx';
import { Reactions } from './Reactions.jsx';
import { Receipt } from './Receipt.jsx';
import { EditBox } from './EditBox.jsx';
import { PollCard } from '../polls/PollCard.jsx';
import { Attachments } from './Attachments.jsx';
import { MessageToolbar } from './MessageToolbar.jsx';
import { useLongPress } from '../hooks/useLongPress.js';
import { clock } from '../../../utils/time.js';
import { cx } from '../../../utils/cx.js';

function Body({ message, editing, onSaveEdit, onCancelEdit }) {
  if (message.deletedAt) return <p className="italic text-ink-muted">Message removed</p>;
  if (editing) return <EditBox initial={message.text} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  if (message.type === 'poll' && message.pollId) return <PollCard pollId={message.pollId} />;
  return (
    <>
      {message.text && (
        <p className="whitespace-pre-wrap break-words text-[15px] text-ink">
          {message.text}
          {message.editedAt && <span className="ml-2 font-mono text-xs text-ink-faint">edited</span>}
        </p>
      )}
      <Attachments items={message.attachments} />
    </>
  );
}

/**
 * One message block. Others: no bubble, avatar + name + mono time on the first of a group. Own: right-aligned --s2 block,
 * 1px border, radius 12, 2px accent rule on the left. Text is always rendered as text (React escapes it).
 */
export const MessageRow = memo(function MessageRow({
  item, sender, replySender, meId, mobile, seenBy, highlighted, editing, can, handlers,
}) {
  const { message, own, first, last } = item;
  const pressed = useLongPress(() => handlers.openSheet(message));
  const interactive = !message.deletedAt && !message._status;
  const body = <Body message={message} editing={editing} onSaveEdit={(t) => { handlers.cancelEdit(); handlers.edit(message, t); }} onCancelEdit={handlers.cancelEdit} />;
  const toolbar = interactive && !editing && (
    <MessageToolbar
      can={can} onReact={(e) => handlers.react(message, e)} onReply={() => handlers.reply(message)}
      onCopy={() => handlers.copy(message)} onEdit={() => handlers.startEdit(message)} onDelete={() => handlers.askDelete(message)}
    />
  );
  const quote = message.replyTo && <ReplyQuote reply={message.replyTo} senderName={replySender} onJump={handlers.jump} />;
  const touchProps = interactive ? { ...pressed } : {};

  if (own) {
    return (
      <div data-msg-id={message.id} className={cx('group/msg relative flex flex-col items-end', first ? 'mt-3.5' : 'mt-1')}>
        <div {...touchProps} className={cx('relative max-w-[85%] overflow-hidden rounded-lg border bg-s2 px-4 py-2.5 [@media(hover:none)]:select-none md:max-w-[70%]', highlighted ? 'border-accent' : 'border-line', editing && 'w-full max-w-full')}>
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
          {quote}
          {body}
          {!editing && <Reactions reactions={message.reactions} meId={meId} onToggle={(e) => handlers.react(message, e)} />}
        </div>
        {toolbar}
        {last && <Receipt message={message} seenBy={seenBy} onRetry={() => handlers.retry(message)} onDiscard={() => handlers.discard(message)} />}
      </div>
    );
  }
  return (
    <div data-msg-id={message.id} className={cx('group/msg relative flex gap-3 rounded-md', first ? 'mt-3.5' : 'mt-0.5', highlighted && 'bg-accent-soft')}>
      <div className="w-7 shrink-0 md:w-9">{first && <Avatar name={sender?.displayName || '?'} src={sender?.avatarUrl} size={mobile ? 28 : 36} />}</div>
      <div {...touchProps} className="min-w-0 flex-1 [@media(hover:none)]:select-none">
        {first && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">{sender?.displayName || 'Former member'}</span>
            <time dateTime={message.createdAt} className="font-mono text-xs text-ink-faint">{clock(new Date(message.createdAt))}</time>
          </div>
        )}
        <div className="max-w-[70ch]">
          {quote}
          {body}
          <Reactions reactions={message.reactions} meId={meId} onToggle={(e) => handlers.react(message, e)} />
        </div>
      </div>
      {toolbar}
    </div>
  );
});
