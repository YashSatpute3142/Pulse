import { forwardRef } from 'react';
import { cx } from '../../utils/cx.js';
import { Field, fieldBase } from './Field.jsx';
import { useFieldIds } from './useFieldIds.js';

export const Textarea = forwardRef(function Textarea({ label, helper, error, id, className, rows = 3, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Field label={label} htmlFor={ids.id} helper={helper} helperId={ids.helpId} error={error} errorId={ids.errId}>
      <textarea
        ref={ref} id={ids.id} rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ids.errId : helper ? ids.helpId : undefined}
        className={cx(fieldBase, 'py-2 resize-none', error ? 'border-danger' : 'border-control', className)}
        {...rest}
      />
    </Field>
  );
});
