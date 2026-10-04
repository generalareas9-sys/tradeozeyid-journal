import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('renders a native date input with an associated label', () => {
    render(<DatePicker label="Entry date" />);

    const input = screen.getByLabelText('Entry date');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveProperty('type', 'date');
  });

  it('passes min and max through as YYYY-MM-DD bounds', () => {
    render(<DatePicker label="Entry date" min="2026-01-01" max="2026-12-31" />);

    const input = screen.getByLabelText('Entry date') as HTMLInputElement;
    expect(input.min).toBe('2026-01-01');
    expect(input.max).toBe('2026-12-31');
  });

  it('holds the value as a plain date string', () => {
    render(<DatePicker label="Entry date" defaultValue="2026-09-30" />);

    expect((screen.getByLabelText('Entry date') as HTMLInputElement).value).toBe('2026-09-30');
  });

  it('marks the field invalid and links the error', () => {
    render(<DatePicker label="Entry date" error="Entry date is required" />);

    const input = screen.getByLabelText('Entry date');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe('Entry date is required');
  });

  it('links hint text through aria-describedby', () => {
    render(<DatePicker label="Entry date" hint="In UTC" />);

    const input = screen.getByLabelText('Entry date');
    const describedBy = input.getAttribute('aria-describedby');

    expect(document.getElementById(describedBy!)?.textContent).toBe('In UTC');
  });

  it('supports disabled and required', () => {
    render(<DatePicker label="Entry date" disabled required />);

    const input = screen.getByLabelText('Entry date') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.required).toBe(true);
  });
});