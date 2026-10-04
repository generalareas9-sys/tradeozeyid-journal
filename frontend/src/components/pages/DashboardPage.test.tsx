import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from './DashboardPage';

const DESCRIPTION =
  'Overview of the account: equity curve, drawdown, calendar heatmap and recent trades.';

function renderDashboard() {
  return render(<DashboardPage phase={8} description={DESCRIPTION} />);
}

describe('DashboardPage', () => {
  it('lays out every region the Phase 8 dashboard will fill', () => {
    renderDashboard();

    // Each region named here is a Phase 8 deliverable in docs/phase-plan.md:
    // metrics, equity curve, drawdown, calendar, recent trades, by session.
    for (const heading of [
      'Key metrics',
      'Equity curve',
      'Drawdown',
      'Recent trades',
      'Calendar heatmap',
      'By session',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
  });

  it('shows the route description and the phase that delivers it', () => {
    renderDashboard();

    expect(screen.getByText(/Overview of the account/)).toBeTruthy();
    expect(screen.getByText('Dashboard arrives in Phase 8')).toBeTruthy();
  });

  it('renders no fabricated figure anywhere', () => {
    const { container } = renderDashboard();

    // The only digits permitted on this screen are the phase numbers it names.
    // This is the regression guard for the "no fabricated figures" rule in
    // docs/phase-plan.md Phase 2: a sample balance or return would read as
    // real trading data.
    const text = (container.textContent ?? '').replace(/Phase \d+/g, '');

    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/[$€£₺]/);
  });

  it('announces every empty metric slot as text rather than by colour', () => {
    renderDashboard();

    // The decorative em dash is aria-hidden; this is the state a screen reader
    // actually receives for each of the four slots.
    expect(screen.getAllByText('No data yet')).toHaveLength(4);
  });

  it('offers no action that would fabricate or fetch data', () => {
    renderDashboard();

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('gives every empty region a stated reason', () => {
    renderDashboard();

    for (const title of [
      'No equity curve yet',
      'No drawdown data yet',
      'No trades recorded',
      'No calendar yet',
      'No session breakdown yet',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });
});