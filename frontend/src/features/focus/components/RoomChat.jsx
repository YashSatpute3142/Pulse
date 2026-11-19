import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useRoomActions } from '../hooks/useFocus.js';
import { MAX_ROOM_TEXT } from '../constants.js';
import { clock } from '../../../utils/time.js';

const isSystem = (m) => m.type === 'system' || !m.senderId;

/** Room chat (360 wide on desktop). System lines are left-aligned mono 12px faint. Participants only. */
export function RoomChat({ room, messages, meId, canWrite }) {
  const toast = useToast();
  const actions = useRoomActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const log = useRef(null);
  const pinned = useRef(true);

  useLayoutEffect(() => { const el = log.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; }, [messages.length]);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, []);

  const nameOf = (m) => (m.senderId === meId ? 'You' : (m.sender?.displayName || room.participants.find((p) => p.user.id === m.senderId)?.user.displayName || 'Former participant').split(' ')[0]);
  const submit = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await actions.message(room.id, t); setText(''); } catch (err) { toast.error(err?.message || 'Message not sent'); } finally { setBusy(false); }
  };
  return (
    <section aria-label="Room chat" className="flex min-h-0 flex-1 flex-col">
      <div ref={log} role="log" aria-label="Room messages" onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="text-sm text-ink-muted">No messages yet.</p>}
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (isSystem(m)
            ? <li key={m.id} className="font-mono text-xs text-ink-faint">{m.text}</li>
            : (
              <li key={m.id} className="text-sm">
                <span className="mr-2 font-medium text-ink">{nameOf(m)}</span>
                <span className="font-mono text-[11px] text-ink-faint">{clock(new Date(m.createdAt))}</span>
                <p className="whitespace-pre-wrap break-words text-ink">{m.text}</p>
              </li>
            )))}
        </ul>
      </div>
      {canWrite && (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
          <div className="min-w-0 flex-1"><Textarea aria-label="Message the room" rows={1} maxLength={MAX_ROOM_TEXT} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the room"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) submit(e); }} className="max-h-28" /></div>
          <IconButton label="Send" type="submit" disabled={!text.trim() || busy}><Send size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        </form>
      )}
    </section>
  );
}
