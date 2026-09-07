/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { GiftingSegments } from './gifting-segments.tsx';

describe('GiftingSegments', () => {
  it('renders both segments as links and marks the active one as current', () => {
    render(
      <MemoryRouter initialEntries={['/exchanges']}>
        <GiftingSegments active="exchanges" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Gifting' });
    const pools = screen.getByRole('link', { name: 'Pools' });
    const exchanges = screen.getByRole('link', { name: 'Exchanges' });
    expect(nav).toContainElement(pools);
    expect(pools).toHaveAttribute('href', '/pools');
    expect(exchanges).toHaveAttribute('href', '/exchanges');
    expect(exchanges).toHaveAttribute('aria-current', 'page');
    expect(pools).not.toHaveAttribute('aria-current');
  });
});
