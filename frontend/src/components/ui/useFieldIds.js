import { useId } from 'react';

// Shared label + helper/error wiring (aria-describedby) for Input/Textarea/Select.
export function useFieldIds(id) {
  const auto = useId();
  const base = id || auto;
  return { id: base, helpId: `${base}-help`, errId: `${base}-err` };
}
