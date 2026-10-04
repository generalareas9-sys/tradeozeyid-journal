import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabDefinition {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabDefinition[];
  /** Controlled active tab id. */
  activeId: string;
  onChange: (id: string) => void;
  /** Panel content for the active tab. */
  children: ReactNode;
  /** Accessible name for the tab list. */
  label?: string;
}

const KEY_TO_INDEX: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/**
 * Controlled tabs following the WAI-ARIA tabs pattern: one tab stop for the
 * whole list, arrow keys to move between tabs, and `aria-controls` tying each
 * tab to its panel.
 */
export function Tabs({ tabs, activeId, onChange, children, label = 'Sections' }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = KEY_TO_INDEX[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;

    const enabled = tabs.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;

    let nextIndex: number;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabled.length - 1;
    } else {
      const current = enabled.findIndex((tab) => tab.id === activeId);
      const from = current === -1 ? 0 : current;
      nextIndex = (from + step + enabled.length) % enabled.length;
    }

    const next = enabled[nextIndex];
    if (!next) return;

    event.preventDefault();
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-accent text-accent-strong'
                  : 'border-transparent text-text-muted hover:border-border hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${activeId}`} aria-labelledby={`tab-${activeId}`}>
        {children}
      </div>
    </div>
  );
}