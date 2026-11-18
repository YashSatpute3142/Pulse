import { Check, CheckCheck, Clock, TriangleAlert } from 'lucide-react';
import { clock } from '../../../utils/time.js';

/**
 * Meta line under the last own block, in mono. Never colour only:
 * sending = clock + "Sending…"; failed = warning + "Not delivered" + Retry/Discard; sent = one check;
 * seen = two checks + "Seen by N". ("Delivered" is not shown: the protocol has no delivery receipt.)
 */
export function Receipt({ message, seenBy, onRetry, onDiscard }) {
  const time = clock(new Date(message.createdAt));
  if (message._status === 'sending') {
    return <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-ink-faint"><Clock size={12} strokeWidth={1.5} aria-hidden="true" />Sending…</div>;
  }
  if (message._status === 'failed') {
    return (
      <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 font-mono text-xs text-danger" role="alert">
        <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
        <span>Not delivered{message._error ? ` · ${message._error}` : ''}</span>
        <button type="button" onClick={onRetry} className="hit-coarse font-medium text-accent-text underline-offset-2 hover:underline">Retry</button>
        <button type="button" onClick={onDiscard} className="hit-coarse text-ink-muted underline-offset-2 hover:underline">Discard</button>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-ink-faint">
      <time dateTime={message.createdAt}>{time}</time>
      {seenBy > 0
        ? (<><CheckCheck size={14} strokeWidth={1.5} aria-hidden="true" className="text-ink" /><span className="text-ink-muted">Seen by {seenBy}</span></>)
        : (<><Check size={14} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">Sent</span></>)}
    </div>
  );
}
