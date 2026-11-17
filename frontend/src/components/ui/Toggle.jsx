import { cx } from '../../utils/cx.js';

// 40x24 switch, thumb 18 (DESIGN_SYSTEM 9). Track --control off, --accent on.
export function Toggle({ checked, onChange, label, disabled, id }) {
  return (
    <button
      id={id} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[180ms] disabled:opacity-50 disabled:pointer-events-none hit-coarse',
        checked ? 'bg-accent' : 'bg-control',
      )}
    >
      <span aria-hidden="true" className={cx('absolute top-[3px] size-[18px] rounded-full bg-canvas transition-[left] duration-[180ms]', checked ? 'left-[19px]' : 'left-[3px]')} />
    </button>
  );
}
