/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type InvitationPerson = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string; altText: string | null } | null;
};

type InvitationCandidate = InvitationPerson & {
  contributionCents: number | null;
};

type PendingInvitation = {
  id: string;
  createdAt: Date;
  invitee: InvitationPerson;
};

const fetchMock = vi.fn<typeof fetch>();

const loaderDataSnapshot = {
  inviteUrl: 'https://giftpool.app/pools/join/invite-1' as string | null,
  // True only for an empty "mistake" pool the organizer may hard-delete;
  // anything with memory shows Cancel instead. See settings loader.
  canHardDelete: true,
  invitationState: {
    poolId: 'pool-1',
    poolTitle: 'Alex Birthday Pool',
    recipientLabel: 'Alex',
    isActive: true,
    candidates: [] as InvitationCandidate[],
    pendingInvitations: [] as PendingInvitation[],
  },
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
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    loaderDataSnapshot.pool.status = 'OPEN';
    loaderDataSnapshot.canHardDelete = true;
    loaderDataSnapshot.inviteUrl = 'https://giftpool.app/pools/join/invite-1';
    loaderDataSnapshot.invitationState.candidates = [];
    loaderDataSnapshot.invitationState.pendingInvitations = [];
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

  it('selects and sends eligible people from the responsive picker', async () => {
    const candidate = invitationPerson('naomi', 'Naomi');
    loaderDataSnapshot.invitationState.candidates = [
      { ...candidate, contributionCents: null },
    ];
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        invitations: [{ id: 'invitation-1', inviteeId: candidate.id }],
      }),
    );

    renderRoute();
    await userEvent.click(screen.getByRole('button', { name: 'Invite people' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Invite Naomi' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Send 1 invitation' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pools/pool-1/invitations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ inviteeIds: ['naomi'] }),
      }),
    );
    expect(await screen.findByText('Awaiting response')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Everyone eligible is already a contributor or has been invited.',
      ),
    ).toBeInTheDocument();
  });

  it('returns a cancelled invitation to the eligible picker', async () => {
    const invitee = invitationPerson('marco', 'Marco');
    loaderDataSnapshot.invitationState.pendingInvitations = [
      { id: 'invitation-1', createdAt: new Date(), invitee },
    ];
    fetchMock.mockResolvedValue(
      Response.json({ success: true, poolId: 'pool-1' }),
    );

    renderRoute();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel invitation' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pool-invitations/invitation-1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.queryByText('Awaiting response')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invite people' }));
    expect(
      screen.getByRole('checkbox', { name: 'Invite Marco' }),
    ).toBeInTheDocument();
  });
});

function invitationPerson(id: string, name: string): InvitationPerson {
  return { id, username: id, name, image: null };
}
