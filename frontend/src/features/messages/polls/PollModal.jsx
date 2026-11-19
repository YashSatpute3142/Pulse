import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Toggle } from '../../../components/ui/Toggle.jsx';
import { useSocket } from '../../../socket/useSocket.js';
import { C2S } from '../../../constants/eventTypes.js';
import { useQueryClient } from '@tanstack/react-query';
import { applyStoredMessage } from '../cacheUpdates.js';
import { setPoll } from './pollCache.js';

const MIN = 2;
const MAX = 8; // WEBSOCKET_PROTOCOL POLL_CREATE: options 2..8
const CLOSE = [{ v: '', l: 'Never' }, { v: '60', l: 'In 1 hour' }, { v: '1440', l: 'In 1 day' }, { v: '10080', l: 'In 1 week' }];

export function PollModal({ open, onClose, conversationId }) {
  const qc = useQueryClient();
  const { status, send } = useSocket();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closes, setCloses] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && filled.length >= MIN && new Set(filled.map((o) => o.toLowerCase())).size === filled.length;
  const reset = () => { setQuestion(''); setOptions(['', '']); setMultiple(false); setAnonymous(false); setCloses(''); setError(''); };
  const close = () => { reset(); onClose(); };
  const setOpt = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await send(C2S.POLL_CREATE, { conversationId, question: question.trim(), options: filled, ...(multiple ? { multiple } : {}), ...(anonymous ? { anonymous } : {}), ...(closes ? { closesInMin: Number(closes) } : {}) });
      if (data?.poll) { setPoll(qc, data.poll); if (data.message) applyStoredMessage(qc, data.message); }
      close();
    } catch (err) { setError(err?.message || 'Could not create the poll.'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={close} title="Create a poll"
      footer={(<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="poll-form" loading={busy} disabled={!valid || status !== 'open'}>Post poll</Button></>)}>
      <form id="poll-form" onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Question" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><Input aria-label={`Option ${i + 1}`} value={o} maxLength={80} placeholder={`Option ${i + 1}`} onChange={(e) => setOpt(i, e.target.value)} /></div>
              {options.length > MIN && <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} className="hit-44 grid size-8 place-items-center rounded-md text-ink-muted [@media(hover:hover)]:hover:bg-s3"><X size={16} strokeWidth={1.5} aria-hidden="true" /></button>}
            </div>
          ))}
          {options.length < MAX && <Button variant="ghost" size="sm" className="self-start" onClick={() => setOptions((x) => [...x, ''])}><Plus size={14} strokeWidth={1.5} aria-hidden="true" />Add option</Button>}
        </fieldset>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink">Allow multiple answers</span><Toggle label="Allow multiple answers" checked={multiple} onChange={setMultiple} /></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink">Anonymous votes</span><Toggle label="Anonymous votes" checked={anonymous} onChange={setAnonymous} /></div>
        <Select label="Close poll" value={closes} onChange={(e) => setCloses(e.target.value)}>{CLOSE.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</Select>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
