import { cx } from '../../utils/cx.js';

/** 40px --s3 tile (radius 8) + 20px icon, heading 15/600, one muted sentence, one action. */
export function EmptyState({ icon: Icon, title, description, action, className, headingLevel: H = 'h2' }) {
  return (
    <div className={cx('flex flex-col items-start gap-3 p-6', className)}>
      {Icon && <div className="grid size-10 place-items-center rounded-md bg-s3 text-ink-muted"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></div>}
      <div className="flex flex-col gap-1">
        <H className="text-[15px] font-semibold text-ink">{title}</H>
        {description && <p className="max-w-[44ch] text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
