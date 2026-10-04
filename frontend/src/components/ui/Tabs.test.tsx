import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'risks', label: 'Risks', disabled: true },
];

describe('Tabs', () => {
  it('marks only the active tab as selected', () => {
    render(
      <Tabs tabs={TABS} activeId="summary" onChange={() => {}}>
        Summary panel
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Breakdown' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('reports selection through onChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <Tabs tabs={TABS} activeId="summary" onChange={onChange}>
        Summary panel
      </Tabs>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Breakdown' }));
    expect(onChange).toHaveBeenCalledWith('breakdown');
  });

  it('keeps a single tab stop, as the ARIA pattern requires', () => {
    render(
      <Tabs tabs={TABS} activeId="summary" onChange={() => {}}>
        Panel
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Breakdown' }).getAttribute('tabindex')).toBe('-1');
  });

  it('does not respond to a disabled tab', () => {
    const onChange = vi.fn();
    render(
      <Tabs tabs={TABS} activeId="summary" onChange={onChange}>
        Panel
      </Tabs>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Risks' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('links the active panel back to its tab', () => {
    render(
      <Tabs tabs={TABS} activeId="breakdown" onChange={() => {}}>
        Breakdown panel
      </Tabs>,
    );

    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Breakdown' }).id,
    );
    expect(panel.textContent).toBe('Breakdown panel');
  });
});

/** Stateful harness: arrow keys must actually move the active tab. */
function ControlledTabs({ onChange = () => {} }: { onChange?: (id: string) => void }) {
  const [active, setActive] = useState('summary');

  return (
    <Tabs
      tabs={TABS}
      activeId={active}
      onChange={(id) => {
        setActive(id);
        onChange(id);
      }}
    >
      <p>{`${active} panel`}</p>
    </Tabs>
  );
}

describe('Tabs keyboard navigation', () => {
  function activeLabel() {
    return screen.getByRole('tab', { selected: true }).textContent;
  }

  it('moves forward and backward, wrapping around', () => {
    render(<ControlledTabs />);
    const list = screen.getByRole('tablist');

    expect(activeLabel()).toBe('Summary');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(activeLabel()).toBe('Breakdown');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(activeLabel()).toBe('Summary');

    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(activeLabel()).toBe('Breakdown');
  });

  it('jumps to the first and last enabled tabs', () => {
    render(<ControlledTabs />);
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'End' });
    expect(activeLabel()).toBe('Breakdown');

    fireEvent.keyDown(list, { key: 'Home' });
    expect(activeLabel()).toBe('Summary');
  });

  it('skips the disabled tab entirely', () => {
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'ArrowRight' });

    expect(onChange).not.toHaveBeenCalledWith('risks');
    expect(activeLabel()).toBe('Summary');
  });

  it('moves focus to the newly selected tab', () => {
    render(<ControlledTabs />);
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'ArrowRight' });

    expect(document.activeElement?.textContent).toBe('Breakdown');
  });

  it('ignores keys it does not handle', () => {
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });
});