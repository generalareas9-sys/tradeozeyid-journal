import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { CONTROL_CLASSES, FieldShell } from './FieldShell';

export interface DatePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'placeholder'> {
  label: string;
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min?: string;
  /** Latest selectable date, `YYYY-MM-DD`. */
  max?: string;
  hint?: string;
  error?: string;
}

/**
 * A native `<input type="date">`, chosen over a custom calendar so there is no
 * dependency and the platform picker, keyboard support and locale handling come
 * for free. The value stays a `YYYY-MM-DD` string, matching `api-spec.md` §1
 * ("Dates: `YYYY-MM-DD`").
 */
export function DatePicker({
  label,
  min,
  max,
  hint,
  error,
  required,
  className,
  ...rest
}: DatePickerProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        {...rest}
        type="date"
        id={id}
        min={min}
        max={max}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${CONTROL_CLASSES}${error ? ' border-negative' : ''}${
          className ? ` ${className}` : ''
        }`}
      />
    </FieldShell>
  );
}