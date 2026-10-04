import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
  { value: 'prop', label: 'Prop firm', disabled: true },
];

describe('Select', () => {
  it('uses a native select with an associated label', () => {
    render(<Select label="Account type" options={OPTIONS} />);

    const select = screen.getByLabelText('Account type');
    expect(select.tagName).toBe('SELECT');
  });

  it('renders every option with its value', () => {
    render(<Select label="Account type" options={OPTIONS} />);

    const select = screen.getByLabelText('Account type');
    const values = Array.from(select.querySelectorAll('option')).map((option) => option.value);

    expect(values).toEqual(['live', 'demo', 'prop']);
  });

  it('renders the placeholder as a non-selectable first option', () => {
    render(<Select label="Account type" options={OPTIONS} placeholder="Choose a type" />);

    const select = screen.getByLabelText('Account type');
    const first = select.querySelector('option');

    expect(first).not.toBeNull();
    expect(first?.value).toBe('');
    expect(first?.disabled).toBe(true);
    expect(first?.textContent).toBe('Choose a type');
  });

  it('disables an individual option when asked', () => {
    render(<Select label="Account type" options={OPTIONS} />);

    const options = screen.getByLabelText('Account type').querySelectorAll('option');
    expect(options[2].disabled).toBe(true);
  });

  it('links hint and error to the control', () => {
    render(<Select label="Account type" options={OPTIONS} hint="Prop is coming soon" error="Required" />);

    const select = screen.getByLabelText('Account type');
    expect(select.getAttribute('aria-invalid')).toBe('true');

    const ids = (select.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
  });

  it('supports disabled and required', () => {
    render(<Select label="Account type" options={OPTIONS} disabled required />);

    const select = screen.getByLabelText('Account type') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.required).toBe(true);
  });
});