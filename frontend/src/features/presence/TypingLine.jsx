import { useTyping } from './useTyping.js';
import { memberById } from '../conversations/utils.js';

function label(names) {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing…`;
  return 'Several people are typing…';
}

/** Fixed-height line above the composer (no layout jump). Announced politely. */
export function TypingLine({ conversation, meId }) {
  const ids = useTyping(conversation.id).filter((id) => id !== meId);
  const names = ids.map((id) => memberById(conversation, id)?.displayName.split(' ')[0] || 'Someone');
  return (
    <div className="shrink-0 px-4 md:px-8">
      <p aria-live="polite" className="mx-auto h-5 max-w-[880px] truncate text-[13px] text-ink-muted">{names.length ? label(names) : ''}</p>
    </div>
  );
}
