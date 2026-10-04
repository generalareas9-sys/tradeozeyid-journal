import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { CONTROL_CLASSES, FieldShell } from './FieldShell';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectOption[];
  /** Shown as the first, non-selectable option. */
  placeholder?: string;
  hint?: string;
  error?: string;
}

/**
 * A native `<select>`. Native is deliberate: it brings the platform picker,
 * correct keyboard behaviour and screen-reader support with no extra code.
 */
export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  required,
  className,
  ...rest
}: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        {...rest}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${CONTROL_CLASSES}${error ? ' border-negative' : ''}${
          className ? ` ${className}` : ''
        }`}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}

        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}