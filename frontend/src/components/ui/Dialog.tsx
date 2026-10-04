import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  /** Required: the dialog has no accessible name without it. */
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions rendered in the footer, e.g. a cancel/confirm pair. */
  footer?: ReactNode;
  /** Accessible name of the close control. */
  closeLabel?: string;
}

/**
 * A modal built on the native `<dialog>` element, so the focus trap, inertness
 * of the page behind it and Escape handling come from the platform.
 *
 * Interaction rules, all deliberate:
 *  - Escape closes (native behaviour, reported through `onClose`).
 *  - A click that lands on the dialog element itself — the backdrop area — also
 *    closes it, while clicks inside the panel do not. That is the conventional
 *    target-vs-currentTarget distinction.
 *  - `showModal` moves focus into the dialog; `close` returns focus to whatever
 *    had it, which the platform handles.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel = 'Close',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;

    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-text shadow-card"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-text">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-text-muted">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-accent-soft hover:text-accent-strong focus:outline-none focus-visible:ring-2"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div>{children}</div>

        {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}