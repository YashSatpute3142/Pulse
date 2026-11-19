import { useEffect, useState } from 'react';
import { sparksApi } from '../../../api/endpoints/extras.js';
import { cx } from '../../../utils/cx.js';

/** Dashed --control card above the composer: mono "SPARK" tag, text, Another (muted) and Use (accent). Never auto-sent. */
export function SparkCard({ onUse, onClose }) {
  const [kind, setKind] = useState('question');
  const [spark, setSpark] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [n, setN] = useState(0);

  useEffect(() => {
    let live = true;
    sparksApi.random(kind).then((s) => { if (live) { setSpark(s); setState('ready'); } }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [kind, n]);
  const again = () => { setState('loading'); setN((x) => x + 1); };

  return (
    <div className="mb-2 rounded-md border border-dashed border-control p-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Spark</span>
        {['question', 'challenge'].map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setState('loading'); setKind(k); }} className={cx('text-xs capitalize', kind === k ? 'text-ink' : 'text-ink-muted')}>{k}</button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto text-xs text-ink-muted">Close</button>
      </div>
      <p className="mt-1.5 min-h-6 text-sm text-ink" aria-live="polite">{state === 'ready' ? spark.text : state === 'error' ? 'Could not load a spark.' : 'Finding one…'}</p>
      <div className="mt-2 flex gap-4 text-sm">
        <button type="button" onClick={again} className="text-ink-muted [@media(hover:hover)]:hover:text-ink">Another</button>
        <button type="button" disabled={state !== 'ready'} onClick={() => { onUse(spark.text); onClose(); }} className="font-medium text-accent-text disabled:opacity-50">Use</button>
      </div>
    </div>
  );
}
