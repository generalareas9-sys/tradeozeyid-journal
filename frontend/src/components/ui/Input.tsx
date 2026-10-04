import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { CONTROL_CLASSES, FieldShell } from './FieldShell';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label, associated with the input via `htmlFor`. */
  label: string;
  /** Help text, linked through `aria-describedby`. */
  hint?: string;
  /** Error text, linked through `aria-describedby` and flagged by `aria-invalid`. */
  error?: string;
}

/** A single-line text field with a real `<label>` and described-by wiring. */
export function Input({ label, hint, error, required, className, ...rest }: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        {...rest}
        id={id}
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