import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Timer } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePageFocus } from '../hooks/usePageFocus.js';
import { useAuth } from '../features/auth/useAuth.js';
import { useSocket } from '../socket/useSocket.js';
import { useRemaining, useRoom, useRoomActions } from '../features/focus/hooks/useFocus.js';
import { isHost } from '../features/focus/cache.js';
import { TimerRing } from '../features/focus/components/TimerRing.jsx';
import { ParticipantRow } from '../features/focus/components/ParticipantRow.jsx';
import { RoomChat } from '../features/focus/components/RoomChat.jsx';
import { InviteModal } from '../features/focus/components/InviteModal.jsx';

function Back() {
  return <Link to="/focus" className="hit-coarse inline-flex items-center gap-1.5 text-sm text-ink-muted [@media(hover:hover)]:hover:text-ink"><ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />All rooms</Link>;
}

function Room({ room, messages, offset }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const actions = useRoomActions();
  const h1 = usePageFocus();
  const remaining = useRemaining(room, offset);
  const [invite, setInvite] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState('');
  const host = isHost(room, user.id);
  const member = room.participants.some((p) => p.user.id === user.id);
  const live = room.status === 'lobby' || room.status === 'running';
  useDocumentTitle(room.title);

  const run = (key, fn, after) => async () => {
    setBusy(key);
    try { await fn(); after?.(); } catch (e) { toast.error(e?.message || 'That did not work. Try again.'); } finally { setBusy(''); }
  };
  const leave = run('leave', () => actions.leave(room.id), () => navigate('/focus'));
  const start = run('start', () => actions.start(room.id));
  const cancel = run('cancel', () => actions.cancel(room.id), () => setConfirmCancel(false));

  const status = room.status === 'running'
    ? <><span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-live" />Session running</>
    : room.status === 'lobby' ? (host ? 'Ready when you are' : 'Waiting for host')
      : room.status === 'completed' ? 'Session complete' : 'This room was cancelled';

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-8">
        <Back />
        <header className="text-center">
          <h1 ref={h1} tabIndex={-1} className="font-display text-[26px] font-semibold text-ink outline-none md:text-[30px]">{room.title}</h1>
          <p className="mt-1 font-mono text-[13px] text-ink-muted">{Math.round(room.durationSec / 60)} minute session</p>
        </header>
        <TimerRing room={room} remaining={remaining} />
        <p role="status" className="text-center text-sm text-ink-muted">{status}</p>
        <ParticipantRow room={room} canInvite={host && live && room.participants.length < 20} onInvite={() => setInvite(true)} />
        <div className="flex flex-wrap justify-center gap-2">
          {host && room.status === 'lobby' && <Button onClick={start} loading={busy === 'start'}>Start</Button>}
          {host && live && <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel room</Button>}
          {member && <Button variant="ghost" onClick={leave} loading={busy === 'leave'}>Leave</Button>}
          {!live && <Button variant="secondary" onClick={() => navigate('/focus')}>Back to rooms</Button>}
        </div>
      </div>
      <aside aria-label="Chat" className="flex h-[420px] shrink-0 flex-col border-t border-line lg:h-full lg:w-[360px] lg:border-l lg:border-t-0">
        <RoomChat room={room} messages={messages} meId={user.id} canWrite={member && live} />
      </aside>
      <InviteModal open={invite} onClose={() => setInvite(false)} room={room} />
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this room?"
        footer={(<><Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep room</Button><Button variant="danger" onClick={cancel} loading={busy === 'cancel'}>Cancel room</Button></>)}>
        <p className="text-sm text-ink-muted">Everyone in the room is told it was cancelled and the timer stops.</p>
      </Modal>
    </div>
  );
}

export default function FocusRoom() {
  const { roomId } = useParams();
  const { status } = useSocket();
  const q = useRoom(roomId);
  const h1 = usePageFocus();
  useDocumentTitle('Focus room');
  if (q.isSuccess) return <Room room={q.data.room} messages={q.data.messages} offset={q.data.offset} />;
  return (
    <div className="flex flex-col gap-6 px-4 pt-4 md:px-8 md:pt-8">
      <Back />
      <h1 ref={h1} tabIndex={-1} className="sr-only">Focus room</h1>
      {q.isError
        ? <ErrorState title="Could not open this room" message={q.error?.message} onRetry={() => q.refetch()} />
        : status !== 'open' && !q.isFetching
          ? <EmptyState icon={Timer} title="Connecting to Pulse" description="Rooms run over a live connection. This opens as soon as you are back online." className="!p-0" />
          : <div aria-busy="true" className="flex flex-col items-center gap-4"><Skeleton className="size-[320px] !rounded-full" /><Skeleton className="h-6 w-48" /></div>}
    </div>
  );
}
