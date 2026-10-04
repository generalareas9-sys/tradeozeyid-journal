import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children inside a section', () => {
    const { container } = render(<Card>Trade body</Card>);

    // A <section> is only a `region` landmark once it has an accessible name,
    // which a generic card deliberately does not impose, so the element is
    // asserted directly.
    expect(container.querySelector('section')).toBeTruthy();
    expect(screen.getByText('Trade body')).toBeTruthy();
  });

  it('renders a title as a heading when given', () => {
    render(<Card title="Trading accounts">Body</Card>);

    expect(screen.getByRole('heading', { name: 'Trading accounts' })).toBeTruthy();
  });

  it('renders subtitle, actions and footer when given', () => {
    render(
      <Card
        title="Accounts"
        subtitle="Three live"
        actions={<button type="button">Add</button>}
        footer="Updated just now"
      >
        Body
      </Card>,
    );

    expect(screen.getByText('Three live')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(screen.getByText('Updated just now')).toBeTruthy();
  });

  it('omits the header and footer when they are not supplied', () => {
    const { container } = render(<Card>Body only</Card>);

    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });
});