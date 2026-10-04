import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast, ToastProvider, useToast } from './Toast';

describe('Toast', () => {
  it('renders the title and message', () => {
    render(<Toast variant="success" title="Trade saved" message="XAUUSDc long" />);

    expect(screen.getByText('Trade saved')).toBeTruthy();
    expect(screen.getByText('XAUUSDc long')).toBeTruthy();
  });

  it('announces an error assertively and other variants politely', () => {
    const { unmount } = render(<Toast variant="error" title="Save failed" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    unmount();

    render(<Toast variant="success" title="Trade saved" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('carries meaning in a glyph and text, not only colour', () => {
    const { container, unmount } = render(<Toast variant="error" title="Save failed" />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('!');
    unmount();

    const success = render(<Toast variant="success" title="Trade saved" />);
    expect(success.container.querySelector('[aria-hidden="true"]')?.textContent).toBe('✓');
  });

  it('dismisses when the dismiss control is used', () => {
    const onDismiss = vi.fn();
    render(<Toast title="Trade saved" onDismiss={onDismiss} dismissLabel="Dismiss toast" />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss toast' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the dismiss control when there is nothing to dismiss', () => {
    render(<Toast title="Trade saved" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

function Harness() {
  const { toasts, show, dismiss } = useToast();
  const [first] = toasts;

  return (
    <div>
      <button type="button" onClick={() => show({ variant: 'info', title: 'Syncing' })}>
        Show
      </button>
      {first ? (
        <Toast
          variant={first.variant}
          title={first.title}
          message={first.message}
          onDismiss={() => dismiss(first.id)}
        />
      ) : null}
    </div>
  );
}

describe('ToastProvider', () => {
  it('raises and removes a toast through its state interface', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Syncing')).toBeTruthy();

    // Default dismiss label.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Syncing')).toBeNull();
  });

  it('fails loudly when used outside the provider', () => {
    function Orphan() {
      useToast();
      return null;
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});