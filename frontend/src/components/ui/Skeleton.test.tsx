import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonGroup, SkeletonLines } from './Skeleton';

describe('Skeleton', () => {
  it('renders a placeholder hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);

    const shape = container.querySelector('span');
    expect(shape).not.toBeNull();
    expect(shape?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives each variant a distinct shape', () => {
    const text = render(<Skeleton variant="text" />).container.firstElementChild as HTMLElement;
    const rect = render(<Skeleton variant="rect" />).container.firstElementChild as HTMLElement;
    const circle = render(<Skeleton variant="circle" />).container.firstElementChild as HTMLElement;

    expect(text.className).toContain('h-4');
    expect(rect.className).toContain('h-24');
    expect(circle.className).toContain('rounded-full');
  });

  it('honours explicit dimensions', () => {
    const { container } = render(<Skeleton variant="text" width="w-1/3" height="h-6" />);
    const shape = container.firstElementChild as HTMLElement;

    expect(shape.className).toContain('w-1/3');
    expect(shape.className).toContain('h-6');
  });

  it('repeats the requested number of lines', () => {
    const { container } = render(<SkeletonLines count={4} />);
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(4);
  });

  it('announces the loading state through the group, not the shapes', () => {
    render(
      <SkeletonGroup label="Loading trades">
        <Skeleton variant="rect" />
        <SkeletonLines count={2} />
      </SkeletonGroup>,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Loading trades');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBe(3);
  });
});