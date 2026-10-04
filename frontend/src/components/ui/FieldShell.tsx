import type { ReactNode } from 'react';

export interface FieldShellProps {
  /** Id of the control this field wraps; the `<label>` points at it. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** The control itself, rendered between the label and the messages. */
  children: ReactNode;
}

/**
 * Shared label / hint / error scaffolding for the form primitives.
 *
 * Each control owns its own generated ids and passes them to this shell, so
 * `aria-describedby` and `aria-invalid` are wired by the control that owns the
 * element. Internal to `components/ui`: not exported from the barrel.
 */
export function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* The required marker is a sibling of the label, not inside it: that
          keeps the label's text exactly equal to the field name, so both the
          accessible name and `getByLabelText` matching stay predictable. */}
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {required ? (
          <span aria-hidden="true" className="text-xs text-negative">
            *
          </span>
        ) : null}
      </div>

      {children}

      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared control styling for the form primitives.
 *
 * `border-strong` rather than `border`: the edge of an input is what identifies
 * it as an interactive control, so it must clear WCAG 1.4.11 at 3:1. Disabled
 * controls are exempt from the contrast requirement, so dimming is safe here.
 */
export const CONTROL_CLASSES =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none ' +
  'focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60';