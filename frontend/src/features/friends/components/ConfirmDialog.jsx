import { Modal } from '../../../components/ui/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={(<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>)}>
      <p className="text-sm text-ink-muted">{body}</p>
    </Modal>
  );
}
