import { forwardRef } from 'react';
import { cx } from '../../utils/cx.js';
import { Field, fieldBase } from './Field.jsx';
import { useFieldIds } from './useFieldIds.js';

export const Input = forwardRef(function Input(
  { label, helper, error, id, className, fieldClassName, endAdornment, height = 'h-10', ...rest }, ref,
) {
  const ids = useFieldIds(id);
  const describedBy = error ? ids.errId : helper ? ids.helpId : undefined;
  return (
    <Field label={label} htmlFor={ids.id} helper={helper} helperId={ids.helpId} error={error} errorId={ids.errId} className={fieldClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(fieldBase, height, error ? 'border-danger' : 'border-control', endAdornment && 'pr-11', className)}
          {...rest}
        />
        {endAdornment && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{endAdornment}</div>}
      </div>
    </Field>
  );
});
