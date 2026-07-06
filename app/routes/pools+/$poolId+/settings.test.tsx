/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  inviteUrl: 'https://giftpool.app/pools/join/invite-1' as string | null,
  // True only for an empty "mistake" pool the organizer may hard-delete;
  // anything with memory shows Cancel instead. See settings loader.
  canHardDelete: true,
  pool: {
    id: 'pool-1',
    title: 'Alex Birthday Pool',
    occasionType: 'BIRTHDAY',
    eventDate: '2026-05-01T00:00:00.000Z' as string | null,
    decisionMode: 'ORGANIZER_PICKS',
    status: 'OPEN',
    recipientName: 'Alex',
    recipientUser: null as { name: string | null; username: string } | null,
  },
};

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: undefined,
      state: 'idle',
      submit: vi.fn(),
    }),
  };
});

import PoolSettings from './settings.tsx';

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/pools/pool-1/settings']}>
      <PoolSettings />
    </MemoryRouter>,
  );
}

describe('app/routes/pools+/$poolId+/settings.tsx', () => {
  beforeEach(() => {
    loaderDataSnapshot.pool.status = 'OPEN';
    loaderDataSnapshot.canHardDelete = true;
    loaderDataSnapshot.inviteUrl = 'https://giftpool.app/pools/join/invite-1';
  });

  it('opens pool details in read mode and surfaces invite + danger zone', () => {
    renderRoute();

    expect(
      screen.getByRole('heading', { name: 'Pool settings' }),
    ).toBeInTheDocument();
    // Read mode: values shown, no title input yet.
    expect(screen.getByText('Alex Birthday Pool')).toBeInTheDocument();
    expect(screen.getByText('Organizer chooses')).toBeInTheDocument();
    expect(
      document.querySelector('input[name="title"]'),
    ).not.toBeInTheDocument();

    expect(screen.getByText('Invite contributors')).toBeInTheDocument();
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete pool' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel pool' }),
    ).toBeInTheDocument();
  });

  it('reveals the details form on Edit, with the method editable while OPEN', () => {
    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));

    const title = document.querySelector(
      'input[name="title"]',
    ) as HTMLInputElement;
    expect(title.value).toBe('Alex Birthday Pool');

    const method = document.querySelector(
      'select[name="decisionMode"]',
    ) as HTMLSelectElement;
    expect(method.disabled).toBe(false);
  });

  it('locks the gift-selection method once the pool is past OPEN', () => {
    loaderDataSnapshot.pool.status = 'VOTING';
    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));

    const method = document.querySelector(
      'select[name="decisionMode"]',
    ) as HTMLSelectElement;
    expect(method.disabled).toBe(true);
  });

  it('hides the delete action when the pool cannot be hard-deleted', () => {
    // canHardDelete is false for non-organizer managers AND for any pool that
    // holds memory (gift ideas / other contributors) — both collapse to Cancel.
    loaderDataSnapshot.canHardDelete = false;
    renderRoute();
    expect(
      screen.queryByRole('button', { name: 'Delete pool' }),
    ).not.toBeInTheDocument();
    // Cancel (a manage-level action) is still available.
    expect(
      screen.getByRole('button', { name: 'Cancel pool' }),
    ).toBeInTheDocument();
  });
});
