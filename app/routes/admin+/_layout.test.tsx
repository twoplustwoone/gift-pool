/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {},
}));

import AdminLayout from './_layout.tsx';

describe('admin layout', () => {
  it('renders the admin header and all six nav tabs', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminLayout />
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Internal operator surface')).toBeInTheDocument();

    // Back-to-home link
    expect(screen.getByRole('link', { name: /Home/i })).toHaveAttribute(
      'href',
      '/',
    );

    // Six tabs
    for (const label of [
      'Overview',
      'Users',
      'Pools',
      'Ops',
      'Analytics',
      'Cache',
    ]) {
      expect(
        screen.getByRole('link', { name: label }),
      ).toBeInTheDocument();
    }
  });

  it('wires the Overview tab to /admin with end matching', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminLayout />
      </MemoryRouter>,
    );
    const overviewTab = screen.getByRole('link', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('href', '/admin');
  });

  it('wires subsequent tabs to their /admin/* paths', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminLayout />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: 'Pools' })).toHaveAttribute(
      'href',
      '/admin/pools',
    );
    expect(screen.getByRole('link', { name: 'Ops' })).toHaveAttribute(
      'href',
      '/admin/ops',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/admin/analytics',
    );
    expect(screen.getByRole('link', { name: 'Cache' })).toHaveAttribute(
      'href',
      '/admin/cache',
    );
  });
});
