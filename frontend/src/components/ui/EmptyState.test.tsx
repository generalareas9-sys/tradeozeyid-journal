import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No trades yet" />);
    expect(screen.getByText('No trades yet')).toBeTruthy();
  });

  it('renders the description when given', () => {
    render(<EmptyState title="No trades yet" description="Record your first trade to see it here." />);

    expect(screen.getByText('Record your first trade to see it here.')).toBeTruthy();
  });

  it('omits the description when it is not supplied', () => {
    const { container } = render(<EmptyState title="No trades yet" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders a working action when given', () => {
    render(<EmptyState title="No trades yet" action={<Button>Add trade</Button>} />);

    const action = screen.getByRole('button', { name: 'Add trade' });
    expect(action).toBeTruthy();
    expect(action).toHaveProperty('disabled', false);
  });

  it('hides a decorative icon from assistive technology', () => {
    const { container } = render(<EmptyState title="No trades yet" icon={<span data-testid="glyph" />} />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByTestId('glyph')).toBeTruthy();
  });
});