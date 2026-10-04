import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

const VARIANTS = ['neutral', 'accent', 'positive', 'negative'] as const;

describe('Badge', () => {
  it('always renders its label as text, never colour alone', () => {
    render(<Badge>Live</Badge>);

    const badge = screen.getByText('Live');
    expect(badge.textContent).toBe('Live');
  });

  it('gives each variant a distinct class set', () => {
    const seen = new Set<string>();

    for (const variant of VARIANTS) {
      const { unmount } = render(<Badge variant={variant}>Status</Badge>);
      seen.add(screen.getByText('Status').className);
      unmount();
    }

    expect(seen.size).toBe(VARIANTS.length);
  });

  it('marks the optional icon decorative so the label is spoken once', () => {
    const { container } = render(<Badge icon={<svg data-testid="tick" />}>Profitable</Badge>);

    expect(screen.getByText('Profitable')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('conveys a positive result with text as well as colour', () => {
    render(<Badge variant="positive" icon={<span>▲</span>}>In profit</Badge>);

    // The words, not the colour, are what a screen reader announces.
    expect(screen.getByText('In profit')).toBeTruthy();
  });
});