import { useState } from 'react';
import { Button } from '../../../components/ui/Button.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { SettingRow } from './SettingRow.jsx';

export function AccountSection() {
  const { user, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const signOut = async () => { setBusy(true); await logout(); }; // RequireAuth redirects to /login once the session ends
  return (
    <section aria-labelledby="account-h" className="flex flex-col">
      <h2 id="account-h" className="font-mono text-xs uppercase tracking-wider text-ink-faint">Account</h2>
      <SettingRow label={user?.displayName} helper={user ? `@${user.username} · ${user.email}` : undefined} />
      <SettingRow label="Sign out" helper="You will need to sign in again on this device.">
        <Button variant="secondary" onClick={() => setConfirming(true)}>Sign out</Button>
      </SettingRow>
      <Modal
        open={confirming} onClose={() => !busy && setConfirming(false)} title="Sign out of Pulse?"
        footer={(<><Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button><Button onClick={signOut} loading={busy}>Sign out</Button></>)}
      >
        <p className="text-sm text-ink-muted">Your messages stay on the server. This ends the session on this device.</p>
      </Modal>
    </section>
  );
}
