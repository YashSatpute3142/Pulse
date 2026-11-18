import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SendHorizontal, X } from 'lucide-react';
import { useMessaging } from '../useMessaging.js';
import { MAX_TEXT } from '../constants.js';
import { useTypingSender } from '../../presence/useTypingSender.js';
import { getDraft, setDraft } from '../drafts.js';
import { cx } from '../../../utils/cx.js';

const LINE = 24;
const MAX_LINES = 5;

/**
 * Composer: pinned bottom, pb-safe, min 48, grows to 5 lines then scrolls, 16px font on touch (index.css).
 * Enter sends and Shift+Enter adds a line on devices with a fine pointer; on touch, return adds a line and the send button sends.
 * Stays usable offline: messages queue (outbox) and show "Sending…".
 */
export function Composer({ conversationId, title, replyTo, replySender, onCancelReply, autoFocus }) {
  const { sendMessage } = useMessaging();
  const [text, setText] = useState(() => getDraft(conversationId));
  const area = useRef(null);
  const { notifyInput, stop } = useTypingSender(conversationId);

  useEffect(() => { setDraft(conversationId, text); }, [conversationId, text]);
  useLayoutEffect(() => {
    const el = area.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, LINE * MAX_LINES + 16)}px`;
  }, [text]);
  useEffect(() => { if (autoFocus && window.matchMedia('(pointer: fine)').matches) area.current?.focus(); }, [autoFocus, conversationId]);
  useEffect(() => { if (replyTo) area.current?.focus(); }, [replyTo]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_TEXT;
  const submit = () => {
    if (!canSend) return;
    stop();
    sendMessage({ conversationId, text: trimmed, replyTo });
    setText(''); setDraft(conversationId, '');
    onCancelReply?.();
    area.current?.focus();
  };

  return (
    <div className="pb-safe shrink-0 border-t border-line bg-canvas px-4 pt-3 md:px-8">
      <div className="mx-auto max-w-[880px] pb-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-sm border-l-2 border-line-strong bg-s3 px-2.5 py-1.5 text-[13px] text-ink-muted">
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-ink">Replying to {replySender}</span> {replyTo.text}</span>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="hit-44 grid size-6 shrink-0 place-items-center rounded-sm [@media(hover:hover)]:hover:bg-s2"><X size={14} strokeWidth={1.5} aria-hidden="true" /></button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-control bg-s2 p-1 pl-3">
          <textarea
            ref={area} rows={1} value={text} maxLength={MAX_TEXT + 200} aria-label={`Message ${title}`} placeholder={`Message ${title}`}
            enterKeyHint="send"
            onChange={(e) => { setText(e.target.value); notifyInput(e.target.value); }}
            onBlur={stop}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); submit(); }
            }}
            className="max-h-[136px] min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="button" aria-label="Send message" disabled={!canSend} onClick={submit}
            className={cx('hit-coarse grid size-10 shrink-0 place-items-center rounded-md bg-accent text-on-accent transition-colors duration-[120ms] [@media(hover:hover)]:hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50 md:size-9')}
          ><SendHorizontal size={18} strokeWidth={1.5} aria-hidden="true" /></button>
        </div>
        {trimmed.length > MAX_TEXT - 400 && (
          <p aria-live="polite" className={cx('mt-1 text-right font-mono text-xs', trimmed.length > MAX_TEXT ? 'text-danger' : 'text-ink-faint')}>{trimmed.length}/{MAX_TEXT}</p>
        )}
      </div>
    </div>
  );
}
