import { useState } from 'react';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useActivityMutations, useMyActivity } from '../hooks/useActivity.js';
import { ACTIVITY_TYPES, EXPIRY, MAX_LABEL, VISIBILITY } from '../constants.js';
import { cx } from '../../../utils/cx.js';

/** Editor (DESIGN_SYSTEM): 2-column tile picker, "What exactly?", Everyone / Friends / Nobody, auto-clear, Update + Clear. */
export function ActivityEditor() {
  const toast = useToast();
  const mine = useMyActivity();
  const { set, clear } = useActivityMutations();
  const [type, setType] = useState(mine?.type || 'studying');
  const [label, setLabel] = useState(mine?.label || '');
  const [visibility, setVisibility] = useState(mine?.visibility || 'friends');
  const [expiry, setExpiry] = useState('');
  const helper = VISIBILITY.find((v) => v.value === visibility).helper;

  const update = (e) => {
    e.preventDefault();
    const body = { type, visibility };
    if (label.trim()) body.label = label.trim();
    if (expiry) body.expiresInMin = Number(expiry);
    set.mutate(body, { onSuccess: () => toast.show('Activity updated'), onError: (err) => toast.error(err.message) });
  };
  const doClear = () => clear.mutate(undefined, { onSuccess: () => { setLabel(''); toast.show('Activity cleared'); }, onError: (err) => toast.error(err.message) });

  return (
    <form onSubmit={update} className="flex flex-col gap-4" aria-label="Set your activity">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">What are you up to?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITY_TYPES.map(({ id, label: l, Icon }) => (
            <label key={id} className={cx('hit-coarse flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
              type === id ? 'border-accent bg-accent-soft' : 'border-line bg-s2 [@media(hover:hover)]:hover:bg-s3')}>
              <input type="radio" name="activity-type" value={id} checked={type === id} onChange={() => setType(id)} className="sr-only" />
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />{l}
            </label>
          ))}
        </div>
      </fieldset>
      <Input label="What exactly?" value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder="Optional, e.g. Organic chemistry" />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Who can see it</span>
        <SegmentedControl label="Who can see it" options={VISIBILITY} value={visibility} onChange={setVisibility} />
        <p className="mt-1.5 text-[13px] text-ink-muted">{helper}</p>
      </div>
      <Select label="Clear automatically" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
        {EXPIRY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <div className="flex gap-2">
        <Button type="submit" loading={set.isPending}>Update</Button>
        <Button type="button" variant="secondary" onClick={doClear} disabled={!mine || clear.isPending}>Clear</Button>
      </div>
    </form>
  );
}
