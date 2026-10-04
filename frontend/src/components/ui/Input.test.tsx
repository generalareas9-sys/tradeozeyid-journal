import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('associates the label with the control', () => {
    render(<Input label="Entry price" />);

    const input = screen.getByLabelText('Entry price');
    expect(input.tagName).toBe('INPUT');
  });

  it('links hint text through aria-describedby', () => {
    render(<Input label="Quantity" hint="In lots" />);

    const input = screen.getByLabelText('Quantity');
    const describedBy = input.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('In lots');
  });

  it('marks the field invalid and links the error to the control', () => {
    render(<Input label="Quantity" error="Quantity must be greater than zero" />);

    const input = screen.getByLabelText('Quantity');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Quantity must be greater than zero',
    );
  });

  it('describes the field with both hint and error when both are present', () => {
    render(<Input label="Risk" hint="Percent of balance" error="Above the maximum" />);

    const input = screen.getByLabelText('Risk');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');

    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(document.getElementById(id)).toBeTruthy();
    }
  });

  it('is not invalid when no error is supplied', () => {
    render(<Input label="Symbol" />);
    expect(screen.getByLabelText('Symbol').getAttribute('aria-invalid')).toBeNull();
  });

  it('passes native attributes through, including required and disabled', () => {
    render(<Input label="Symbol" required disabled value="XAUUSDc" onChange={() => {}} />);

    const input = screen.getByLabelText('Symbol') as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('XAUUSDc');
  });
});