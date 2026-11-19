import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BarChart3, Loader2, Paperclip, SendHorizontal, Sparkles, X } from 'lucide-react';
import { uploadsApi } from '../../../api/endpoints/extras.js';
import { SparkCard } from './SparkCard.jsx';
import { PollModal } from '../polls/PollModal.jsx';
import { formatSize } from '../../../utils/size.js';
import { useMessaging } from '../useMessaging.js';
import { MAX_TEXT } from '../constants.js';
import { useTypingSender } from '../../presence/useTypingSender.js';
import { getDraft, setDraft } from '../drafts.js';
import { cx } from '../../../utils/cx.js';

const LINE = 24;
const MAX_LINES = 5;
const MAX_ATTACH = 5; // client-side sanity limit; the server whitelist and size limit are the real rules

/**
 * Composer: pinned bottom, pb-safe, min 48, grows to 5 lines then scrolls, 16px font on touch (index.css).
 * Enter sends and Shift+Enter adds a line on devices with a fine pointer; on touch, return adds a line and the send button sends.
 * Stays usable offline: messages queue (outbox) and show "Sending…".
 */
export function Composer({ conversationId, title, replyTo, replySender, onCancelReply, autoFocus }) {
  const { sendMessage } = useMessaging();
  const [text, setText] = useState(() => getDraft(conversationId));
  const area = useRef(null);
  const picker = useRef(null);
  const [files, setFiles] = useState([]); // { key, name, size, status: 'uploading'|'done'|'error', attachment?, error? }
  const [spark, setSpark] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
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
  const attachments = files.filter((f) => f.status === 'done').map((f) => f.attachment);
  const uploading = files.some((f) => f.status === 'uploading');
  const canSend = (trimmed.length > 0 || attachments.length > 0) && trimmed.length <= MAX_TEXT && !uploading;

  const pick = (e) => {
    const chosen = [...e.target.files].slice(0, Math.max(0, MAX_ATTACH - files.length));
    e.target.value = '';
    chosen.forEach((file) => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setFiles((f) => [...f, { key, name: file.name, size: file.size, status: 'uploading' }]);
      uploadsApi.upload(file)
        .then((attachment) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: 'done', attachment } : x))))
        .catch((err) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: 'error', error: err?.message || 'Upload failed' } : x))));
    });
  };
  const submit = () => {
    if (!canSend) return;
    stop();
    sendMessage({ conversationId, text: trimmed, replyTo, attachments });
    setText(''); setDraft(conversationId, ''); setFiles([]);
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
        {spark && <SparkCard onClose={() => setSpark(false)} onUse={(t) => { setText(t); area.current?.focus(); }} />}
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
            {files.map((f) => (
              <li key={f.key} className={cx('flex max-w-full items-center gap-2 rounded-md border bg-s2 py-1 pl-2.5 pr-1 text-[13px]', f.status === 'error' ? 'border-danger text-danger' : 'border-line text-ink')}>
                {f.status === 'uploading' && <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden="true" />}
                <span className="truncate">{f.name}</span>
                <span className="font-mono text-xs text-ink-muted">{f.status === 'error' ? f.error : f.status === 'uploading' ? 'uploading…' : formatSize(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} className="hit-44 grid size-6 place-items-center rounded-sm text-ink-muted [@media(hover:hover)]:hover:bg-s3"><X size={14} strokeWidth={1.5} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1 rounded-lg border border-control bg-s2 p-1 pl-1">
          <input ref={picker} type="file" multiple hidden onChange={pick} aria-label="Choose files to attach" />
          <ToolButton label="Attach files" onClick={() => picker.current?.click()} disabled={files.length >= MAX_ATTACH}><Paperclip size={18} strokeWidth={1.5} aria-hidden="true" /></ToolButton>
          <ToolButton label="Create a poll" onClick={() => setPollOpen(true)}><BarChart3 size={18} strokeWidth={1.5} aria-hidden="true" /></ToolButton>
          <ToolButton label="Get a spark" onClick={() => setSpark((s) => !s)} pressed={spark}><Sparkles size={18} strokeWidth={1.5} aria-hidden="true" /></ToolButton>
          <textarea
            ref={area} rows={1} value={text} maxLength={MAX_TEXT + 200} aria-label={`Message ${title}`} placeholder={`Message ${title}`}
            enterKeyHint="send"
            onChange={(e) => { setText(e.target.value); notifyInput(e.target.value); }}
            onBlur={stop}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); submit(); }
            }}
            className="max-h-[136px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 leading-6 text-ink outline-none placeholder:text-ink-muted"
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
      <PollModal open={pollOpen} onClose={() => setPollOpen(false)} conversationId={conversationId} />
    </div>
  );
}

function ToolButton({ label, onClick, disabled, pressed, children }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}
      className={cx('hit-coarse grid size-10 shrink-0 place-items-center rounded-md transition-colors duration-[120ms] disabled:opacity-50 md:size-9 [@media(hover:hover)]:hover:bg-s3', pressed ? 'text-accent-text' : 'text-ink-muted [@media(hover:hover)]:hover:text-ink')}>
      {children}
    </button>
  );
}
