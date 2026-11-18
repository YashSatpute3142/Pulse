import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { MessageRow } from './MessageRow.jsx';
import { MessageActionsSheet } from './MessageActionsSheet.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { MessageSquare } from 'lucide-react';
import { useMessages, useReadState } from '../hooks/useMessages.js';
import { useMarkRead } from '../hooks/useMarkRead.js';
import { useMessageActions } from '../hooks/useMessageActions.js';
import { useMessaging } from '../useMessaging.js';
import { buildItems, canDelete, canEdit, seenByCount } from '../grouping.js';
import { selectMessages } from '../cache.js';
import { memberById, myRole } from '../../conversations/utils.js';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll.js';
import { useIsMobile } from '../../../hooks/useMediaQuery.js';

const NEAR_BOTTOM = 80;

function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5 p-4">
      {[60, 40, 75, 50].map((w, i) => (
        <div key={i} className="flex gap-3"><Skeleton className="size-9 shrink-0" rounded="rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-4" style={{ width: `${w}%` }} /></div></div>
      ))}
    </div>
  );
}

/**
 * Scrollable history. role=log (polite, additions). Stays pinned to the bottom for your own sends and when you are already
 * at the bottom; if you scrolled up, a "New messages" pill with a count appears instead. Older pages load at the top and
 * keep your scroll position.
 */
export function MessageList({ conversation, meId, onReply }) {
  const id = conversation.id;
  const mobile = useIsMobile();
  const toast = useToast();
  const { retry, discard } = useMessaging();
  const { data, isPending, isError, error, refetch, hasNextPage, isFetching, fetchNextPage } = useMessages(id);
  const readState = useReadState(id);
  const markRead = useMarkRead(id);
  const actions = useMessageActions(id, meId);
  const messages = useMemo(() => selectMessages(data), [data]);
  const items = useMemo(() => buildItems(messages, meId), [messages, meId]);
  const role = myRole(conversation, meId);

  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const prev = useRef({ firstId: null, lastId: null, height: 0 });
  const [newCount, setNewCount] = useState(0);
  const [sheet, setSheet] = useState(null);       // message for the mobile actions sheet
  const [toDelete, setToDelete] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const topSentinel = useInfiniteScroll({ hasNextPage, isFetching, fetchNextPage, rootRef: scrollRef, rootMargin: '300px' });

  const newestReal = useMemo(() => [...messages].reverse().find((m) => !m._status), [messages]);
  const maybeMarkRead = useCallback(() => {
    if (!newestReal || document.visibilityState !== 'visible' || !atBottom.current) return;
    if (newestReal.senderId === meId) return;
    if (newestReal.id > (conversation.lastReadMessageId || '')) markRead(newestReal.id);
  }, [newestReal, meId, conversation.lastReadMessageId, markRead]);

  // Scroll management after every change to the message list.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || isPending) return;
    const first = messages[0]?.id ?? null;
    const last = messages.at(-1) ?? null;
    const p = prev.current;
    let newOthers = 0;
    if (p.lastId === null && p.firstId === null) el.scrollTop = el.scrollHeight;                         // first paint
    else if (p.firstId !== first && last && p.lastId === last.id) el.scrollTop += el.scrollHeight - p.height; // older page prepended
    else if (last && last.id !== p.lastId) {
      if (last.senderId === meId || atBottom.current) el.scrollTop = el.scrollHeight;
      else newOthers = 1;
    }
    prev.current = { firstId: first, lastId: last?.id ?? null, height: el.scrollHeight };
    if (newOthers) queueMicrotask(() => setNewCount((c) => c + newOthers));
  }, [messages, meId, isPending]);

  useEffect(() => { maybeMarkRead(); }, [maybeMarkRead]);
  useEffect(() => {
    const onVis = () => maybeMarkRead();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [maybeMarkRead]);

  const onScroll = () => {
    const el = scrollRef.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (atBottom.current) { setNewCount(0); maybeMarkRead(); }
  };
  const toBottom = () => { const el = scrollRef.current; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); };

  const jump = useCallback((messageId) => {
    const el = scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(messageId)}"]`);
    if (!el) { toast.show('Scroll up to load earlier messages, then try again.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlight(messageId);
    setTimeout(() => setHighlight(null), 1400);
  }, [toast]);

  const copy = useCallback(async (m) => {
    try { await navigator.clipboard.writeText(m.text); toast.show('Copied'); } catch { toast.error('Could not copy.'); }
  }, [toast]);

  const handlers = useMemo(() => ({
    react: actions.react, edit: actions.edit, reply: onReply, copy, jump,
    askDelete: setToDelete, openSheet: setSheet, startEdit: (m) => setEditingId(m.id), cancelEdit: () => setEditingId(null),
    retry: (m) => retry(m.clientId), discard: (m) => discard(id, m.clientId),
  }), [id, onReply, copy, jump, retry, discard, actions, setToDelete, setSheet, setEditingId]);

  const canFor = (m) => ({
    reply: !m.deletedAt && !m._status, copy: !m.deletedAt && !!m.text, edit: canEdit(m, meId), remove: canDelete(m, meId, role),
  });
  const nameOf = (userId) => memberById(conversation, userId)?.displayName || 'Former member';

  if (isPending) return <div className="min-h-0 flex-1 overflow-hidden"><HistorySkeleton /></div>;
  if (isError) return <div className="min-h-0 flex-1"><ErrorState title="Could not load messages" message={error?.message} onRetry={() => refetch()} /></div>;

  const lastOwnId = [...messages].reverse().find((m) => m.senderId === meId)?.id;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages" className="h-full overflow-y-auto overscroll-contain px-4 pb-3 md:px-8">
        <div className="mx-auto max-w-[880px]">
          {hasNextPage && <div ref={topSentinel} className="h-6">{isFetching && <p className="py-2 text-center font-mono text-xs text-ink-faint">Loading earlier messages…</p>}</div>}
          {!hasNextPage && messages.length === 0 && <EmptyState icon={MessageSquare} title="No messages yet" description="Say hello. It will show up for everyone in this conversation." />}
          {items.map((it) => {
            if (it.type === 'date') {
              return <div key={it.key} className="sticky top-0 z-10 -mx-4 bg-canvas/95 px-4 py-2 md:-mx-8 md:px-8"><div className="flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="font-mono text-xs text-ink-faint">{it.label}</span><span className="h-px flex-1 bg-line" /></div></div>;
            }
            if (it.type === 'system') {
              return <p key={it.key} className="my-2 text-center font-mono text-xs text-ink-faint">{it.message.text}</p>;
            }
            const m = it.message;
            return (
              <MessageRow
                key={it.key} item={it} meId={meId} mobile={mobile}
                sender={memberById(conversation, m.senderId)} replySender={m.replyTo ? nameOf(m.replyTo.senderId) : ''}
                seenBy={m.id === lastOwnId ? seenByCount(m, readState.data, meId) : 0}
                highlighted={highlight === m.id} editing={editingId === m.id} can={canFor(m)} handlers={handlers}
              />
            );
          })}
        </div>
      </div>
      {newCount > 0 && (
        <button type="button" onClick={toBottom} className="absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-3 text-sm font-medium text-on-accent shadow-float">
          <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
          New messages<span className="font-mono text-xs">{newCount}</span>
        </button>
      )}

      <MessageActionsSheet
        open={!!sheet} onClose={() => setSheet(null)} message={sheet} meId={meId} can={sheet ? canFor(sheet) : {}}
        onReact={(e) => actions.react(sheet, e)} onReply={() => onReply(sheet)} onCopy={() => copy(sheet)}
        onEdit={() => setEditingId(sheet.id)} onDelete={() => setToDelete(sheet)}
      />
      <Modal
        open={!!toDelete} onClose={() => setToDelete(null)} title="Delete this message?"
        footer={(<><Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { actions.remove(toDelete); setToDelete(null); }}>Delete</Button></>)}
      >
        <p className="text-sm text-ink-muted">It will be replaced with &ldquo;Message removed&rdquo; for everyone in the conversation.</p>
      </Modal>
    </div>
  );
}
