import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/cx.js';
import { Field, fieldBase } from './Field.jsx';
import { useFieldIds } from './useFieldIds.js';

export const Select = forwardRef(function Select({ label, helper, error, id, className, children, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Field label={label} htmlFor={ids.id} helper={helper} helperId={ids.helpId} error={error} errorId={ids.errId}>
      <div className="relative">
        <select
          ref={ref} id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.errId : helper ? ids.helpId : undefined}
          className={cx(fieldBase, 'h-10 appearance-none pr-9', error ? 'border-danger' : 'border-control', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      </div>
    </Field>
  );
});
