import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and handles clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save trade</Button>);

    const button = screen.getByRole('button', { name: 'Save trade' });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save trade
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save trade' });
    expect(button).toHaveProperty('disabled', true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its accessible name and announces busy while loading', () => {
    render(<Button loading>Saving…</Button>);

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button).toHaveProperty('disabled', true);
  });

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('type', 'button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Confirm</Button>);
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveProperty('type', 'submit');
  });

  it('exposes every variant and gives each a distinct class set', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
    const seen = new Set<string>();

    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>Label</Button>);
      const button = screen.getByRole('button', { name: 'Label' });
      seen.add(button.className);
      unmount();
    }

    expect(seen.size).toBe(variants.length);
  });
});