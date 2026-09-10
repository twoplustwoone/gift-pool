/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { Gift } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { TopNavItem } from './topNavItem.tsx';

const renderAt = (pathname: string, alsoMatches?: string[]) =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <TopNavItem
        to="/pools"
        icon={Gift}
        label="Gifting"
        alsoMatches={alsoMatches}
      />
    </MemoryRouter>,
  );

const link = () => screen.getByRole('link', { name: 'Gifting' });

describe('TopNavItem', () => {
  it('is active on its own route', () => {
    renderAt('/pools');
    expect(link().className).toContain('text-foreground');
  });

  it('is inactive elsewhere', () => {
    renderAt('/friends');
    expect(link().className).toContain('text-muted-foreground');
  });

  it('stays active on a path it also owns, including nested ones', () => {
    renderAt('/exchanges', ['/exchanges']);
    expect(link().className).toContain('text-foreground');

    renderAt('/exchanges/abc123', ['/exchanges']);
    expect(
      screen.getAllByRole('link', { name: 'Gifting' })[1]!.className,
    ).toContain('text-foreground');
  });

  it('does not treat a lookalike prefix as its own route', () => {
    renderAt('/exchanges-archive', ['/exchanges']);
    expect(link().className).toContain('text-muted-foreground');
  });
});
