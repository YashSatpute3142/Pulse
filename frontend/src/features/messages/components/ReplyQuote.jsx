// Quote strip above reply text: --s3, 2px border-strong left rule, radius 4, sender 600 + one truncated line.
export function ReplyQuote({ reply, senderName, onJump }) {
  const removed = !!reply.deletedAt;
  return (
    <button
      type="button" onClick={() => onJump?.(reply.id)} aria-label={`Reply to ${senderName}: ${removed ? 'message removed' : reply.text}. Jump to message`}
      className="mb-1.5 block w-full max-w-full rounded-sm border-l-2 border-line-strong bg-s3 px-2.5 py-1 text-left text-[13px] text-ink-muted"
    >
      <span className="font-semibold text-ink">{senderName}</span>{' '}
      <span className={removed ? 'italic' : undefined}>{removed ? 'Message removed' : reply.text}</span>
    </button>
  );
}
