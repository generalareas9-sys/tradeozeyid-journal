import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney, formatPercent } from '../../lib/format';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders a label and a value', () => {
    render(<StatTile label="Net P&L" value={formatMoney('245.2', 'USD', { locale: 'en-US' })} />);

    expect(screen.getByText('Net P&L')).toBeTruthy();
    expect(screen.getByText('$245.20')).toBeTruthy();
  });

  it('applies the numeric font utility to the value', () => {
    const { container } = render(<StatTile label="Net P&L" value="$245.20" />);

    const value = container.querySelector('.font-numeric');
    expect(value).toBeTruthy();
    expect(value?.textContent).toBe('$245.20');
  });

  it('accepts a formatted percentage without reformatting it', () => {
    render(<StatTile label="Win rate" value={formatPercent('62.5', { locale: 'en-US' })} />);

    expect(screen.getByText('62.500%')).toBeTruthy();
  });

  it('renders secondary text when given', () => {
    render(<StatTile label="Net P&L" value="$245.20" secondary="12 closed trades" />);

    expect(screen.getByText('12 closed trades')).toBeTruthy();
  });

  it('shows a trend with a glyph, not colour alone', () => {
    const { container } = render(
      <StatTile label="Net P&L" value="$245.20" trend="up" trendLabel="up this week" />,
    );

    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe('▲');
    expect(screen.getByText('up this week')).toBeTruthy();
  });

  it('uses distinct glyphs for each direction', () => {
    const glyphs = (['up', 'down', 'flat'] as const).map((trend) => {
      const { container, unmount } = render(<StatTile label="x" value="0" trend={trend} />);
      const text = container.querySelector('[aria-hidden="true"]')?.textContent;
      unmount();
      return text;
    });

    expect(glyphs).toEqual(['▲', '▼', '–']);
  });

  it('omits the trend row when no trend is given', () => {
    const { container } = render(<StatTile label="Net P&L" value="$245.20" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});