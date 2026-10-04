import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('stays closed and hides its content when open is false', () => {
    render(
      <Dialog open={false} title="Close trade" onClose={() => {}}>
        Body text
      </Dialog>,
    );

    const dialog = document.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(false);
  });

  it('opens as a modal with its title wired up when open is true', () => {
    render(
      <Dialog open title="Close trade" description="Confirm the exit price" onClose={() => {}}>
        Body text
      </Dialog>,
    );

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(true);

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Close trade');

    const describedBy = dialog.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe('Confirm the exit price');
  });

  it('reports Escape through onClose, via the native close event', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Close trade" onClose={onClose}>
        Body text
      </Dialog>,
    );

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    // jsdom does not implement the modal dialog default action for Escape, so
    // this exercises the path the platform would trigger: cancel, then close.
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.close();

    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the close control is used', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Close trade" onClose={onClose} closeLabel="Close dialog">
        Body text
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes only when the click lands on the backdrop, not the panel', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open title="Close trade" onClose={onClose}>
        <p>Body text</p>
      </Dialog>,
    );

    const dialog = container.querySelector('dialog') as HTMLDialogElement;

    fireEvent.click(screen.getByText('Body text'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer actions when given', () => {
    render(
      <Dialog open title="Close trade" onClose={() => {}} footer={<button type="button">Confirm</button>}>
        Body text
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
  });
});