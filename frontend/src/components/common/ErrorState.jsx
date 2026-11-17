import { TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { cx } from '../../utils/cx.js';

/** What failed + Retry. No stack traces. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, className }) {
  return (
    <div role="alert" className={cx('flex flex-col items-start gap-3 p-6', className)}>
      <div className="grid size-10 place-items-center rounded-md bg-s3 text-danger"><TriangleAlert size={20} strokeWidth={1.5} aria-hidden="true" /></div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {message && <p className="max-w-[44ch] text-sm text-ink-muted">{message}</p>}
      </div>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
