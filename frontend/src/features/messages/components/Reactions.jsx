import { cx } from '../../../utils/cx.js';

// Chips: --s2, 1px --border, radius 4, 24px high, mono count. Own reaction: accent-soft + accent border + accent text.
export function Reactions({ reactions, meId, onToggle }) {
  if (!reactions?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reactions.map((r) => {
        const mine = r.userIds.includes(meId);
        return (
          <button
            key={r.emoji} type="button" aria-pressed={mine} onClick={() => onToggle(r.emoji)}
            aria-label={`${r.emoji} ${r.userIds.length} ${r.userIds.length === 1 ? 'reaction' : 'reactions'}${mine ? ', including yours' : ''}`}
            className={cx('hit-coarse inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-sm', mine ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-s2 text-ink')}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span aria-hidden="true" className="font-mono text-xs">{r.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}
