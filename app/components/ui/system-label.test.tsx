/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SystemLabel } from './system-label.tsx';

describe('SystemLabel', () => {
  it('renders its children', () => {
    render(<SystemLabel>you</SystemLabel>);
    expect(screen.getByText('you')).toBeInTheDocument();
  });

  it('applies a muted, system-toned treatment distinct from user data', () => {
    render(<SystemLabel>owner</SystemLabel>);
    const label = screen.getByText('owner');
    expect(label.className).toContain('bg-muted');
    expect(label.className).toContain('text-muted-foreground');
  });

  it('merges a custom className', () => {
    render(<SystemLabel className="ml-2">member</SystemLabel>);
    expect(screen.getByText('member').className).toContain('ml-2');
  });
});
