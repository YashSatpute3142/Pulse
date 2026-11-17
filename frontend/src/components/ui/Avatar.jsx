import { cx } from '../../utils/cx.js';
import { avatarTone, initials } from '../../utils/initials.js';
import { PresenceDot } from './PresenceDot.jsx';

const sizes = { 24: 'size-6 text-[10px]', 28: 'size-7 text-[11px]', 36: 'size-9 text-[13px]', 42: 'size-[42px] text-sm', 48: 'size-12 text-base', 96: 'size-24 text-2xl' };
const tones = ['', 'bg-av-1', 'bg-av-2', 'bg-av-3', 'bg-av-4', 'bg-av-5', 'bg-av-6'];

// Image, else initials on a flat --av-n tint. `decorative` when the name is printed next to it.
export function Avatar({ name, src, size = 36, presence, decorative = true, ringClass, className }) {
  const label = presence ? `${name}, ${presence}` : name;
  return (
    <span
      className={cx('relative inline-flex shrink-0', className)}
      {...(decorative ? {} : { role: 'img', 'aria-label': label })}
    >
      <span className={cx('inline-grid place-items-center overflow-hidden rounded-full font-medium text-ink', sizes[size], !src && tones[avatarTone(name || '')])}>
        {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <span aria-hidden="true">{initials(name)}</span>}
      </span>
      {presence && <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot status={presence} ringClass={ringClass} /></span>}
    </span>
  );
}
