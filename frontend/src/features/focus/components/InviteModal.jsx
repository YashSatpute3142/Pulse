import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useRoomActions } from '../hooks/useFocus.js';
import { FriendMultiSelect } from './FriendMultiSelect.jsx';

export function InviteModal({ open, onClose, room }) {
  const toast = useToast();
  const actions = useRoomActions();
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exclude = [...room.participants.map((p) => p.user.id), ...(room.invitedIds || [])];
  const close = () => { setPicked([]); setError(''); onClose(); };
  const send = async () => {
    setBusy(true); setError('');
    try { await actions.invite(room.id, picked); toast.show(`Invited ${picked.length} ${picked.length === 1 ? 'friend' : 'friends'}`); close(); } catch (e) { setError(e?.message || 'Could not send invites.'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={close} title="Invite friends"
      footer={(<><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={send} loading={busy} disabled={!picked.length}>Send invites</Button></>)}>
      <FriendMultiSelect value={picked} onChange={setPicked} exclude={exclude} max={Math.max(0, 20 - room.participants.length)} />
      {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
    </Modal>
  );
}
