import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { useRoomActions } from '../hooks/useFocus.js';
import { useSocket } from '../../../socket/useSocket.js';
import { DURATIONS, MAX_TITLE } from '../constants.js';
import { FriendMultiSelect } from './FriendMultiSelect.jsx';

export function NewRoomModal({ open, onClose }) {
  const navigate = useNavigate();
  const { status } = useSocket();
  const actions = useRoomActions();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('25');
  const [invite, setInvite] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { setTitle(''); setMinutes('25'); setInvite([]); setError(''); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const room = await actions.create({ title: title.trim(), durationSec: Number(minutes) * 60, inviteUserIds: invite });
      close();
      navigate(`/focus/${room.id}`);
    } catch (err) { setError(err?.message || 'Could not create the room.'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={close} title="New focus room"
      footer={(<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" form="new-room-form" loading={busy} disabled={!title.trim() || status !== 'open'}>Create room</Button>
      </>)}>
      <form id="new-room-form" onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Room name" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Thesis sprint" />
        <Select label="Session length" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
          {DURATIONS.map((m) => <option key={m} value={m}>{m} minutes</option>)}
        </Select>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Invite friends <span className="font-normal text-ink-muted">({invite.length} selected, optional)</span></span>
          <FriendMultiSelect value={invite} onChange={setInvite} />
        </div>
        {status !== 'open' && <p className="text-[13px] text-ink-muted">Reconnecting to Pulse. You can create a room once you are back online.</p>}
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
