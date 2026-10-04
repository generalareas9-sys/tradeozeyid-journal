import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

function renderShell() {
  return render(
    <AppShell pageTitle="Dashboard" pathname="/">
      <p>Page content</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('renders the sidebar, the top bar and a main content region', () => {
    renderShell();

    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'System' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByText('Page content')).toBeTruthy();
  });

  it('shows the brand and a skip link', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'TradeOzeyid' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
  });

  it('marks the active navigation item for screen readers', () => {
    render(
      <AppShell pageTitle="Trades" pathname="/trades">
        <p>Trades content</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Trades' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps the navigation toggle collapsed and the drawer closed by default', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: 'Navigation menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('app-navigation');
    expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull();
  });

  it('opens and closes the mobile drawer with the toggle', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Navigation menu' }));

    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeTruthy();
    expect(document.getElementById('app-navigation')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(screen.getByRole('button', { name: 'Navigation menu' })).toBeTruthy();
    expect(document.getElementById('app-navigation')).toBeNull();
  });

  it('closes the drawer on Escape and restores focus to the toggle', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: 'Navigation menu' });
    fireEvent.click(toggle);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(document.getElementById('app-navigation')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Navigation menu' }));
  });

  it('closes the drawer when the backdrop is used', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Navigation menu' }));
    const backdrop = document.querySelector('[data-testid="navigation-backdrop"]');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);
    expect(document.getElementById('app-navigation')).toBeNull();
  });

  it('closes the drawer after a navigation link inside it is chosen', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Navigation menu' }));
    const drawer = document.getElementById('app-navigation') as HTMLElement;
    expect(drawer).toBeTruthy();

    // The desktop sidebar renders its own copy of every link, so scope to the drawer.
    fireEvent.click(within(drawer).getByRole('link', { name: 'Trades' }));
    expect(document.getElementById('app-navigation')).toBeNull();
  });

  it('offers an account selector placeholder that cannot be used', () => {
    renderShell();

    const selector = screen.getByLabelText('Trading account') as HTMLSelectElement;
    expect(selector.tagName).toBe('SELECT');
    expect(selector.disabled).toBe(true);

    const hintId = selector.getAttribute('aria-describedby');
    expect(document.getElementById(hintId!)?.textContent).toBe('Arrives in Phase 4');
    expect(screen.getByRole('option', { name: 'None selected' })).toBeTruthy();
  });

  it('makes no request for the account selector', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderShell();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});