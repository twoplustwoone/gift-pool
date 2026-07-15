/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  redirect,
  RouterProvider,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolInvitationError } from '#app/utils/pool-invitations.server.ts';
import {
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getPoolInvitationForInvitee = vi.fn();
const acceptPoolInvitation = vi.fn();
const declinePoolInvitation = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/pool-invitations.server.ts', () => ({
  PoolInvitationError: class PoolInvitationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
      this.name = 'PoolInvitationError';
    }
  },
  getPoolInvitationForInvitee: (...args: Array<unknown>) =>
    getPoolInvitationForInvitee(...args),
  acceptPoolInvitation: (...args: Array<unknown>) =>
    acceptPoolInvitation(...args),
  declinePoolInvitation: (...args: Array<unknown>) =>
    declinePoolInvitation(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (to: string) => redirect(to),
}));

import PoolInvitationReviewPage, {
  action,
  loader,
} from './pools_.invitations.$invitationId.tsx';

const invitation = {
  id: 'invitation-1',
  status: 'PENDING',
  poolId: 'pool-1',
  poolTitle: 'Birthday surprise',
  poolStatus: 'OPEN',
  recipientLabel: 'Alex',
  contributorCount: 2,
  isActive: true,
  inviter: {
    id: 'manager-1',
    username: 'wade',
    name: 'Wade',
    image: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue('invitee-1');
  getPoolInvitationForInvitee.mockResolvedValue(invitation);
  acceptPoolInvitation.mockResolvedValue({ poolId: 'pool-1' });
  declinePoolInvitation.mockResolvedValue({ poolId: 'pool-1' });
});

describe('pool invitation review route', () => {
  it('loads only the invitation owned by the signed-in user', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {},
        params: { invitationId: 'invitation-1' },
        request: new Request(
          'https://giftpool.app/pools/invitations/invitation-1',
        ),
      }),
    );

    expect(result).toEqual({ invitation });
    expect(getPoolInvitationForInvitee).toHaveBeenCalledWith(
      'invitation-1',
      'invitee-1',
    );
  });

  it('turns an ownership failure into a generic 404', async () => {
    getPoolInvitationForInvitee.mockRejectedValue(
      new PoolInvitationError('INVITATION_NOT_FOUND', 'Private detail.', 404),
    );

    await expect(
      loader(
        toLoaderArgs({
          context: {},
          params: { invitationId: 'invitation-1' },
          request: new Request(
            'https://giftpool.app/pools/invitations/invitation-1',
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('renders only aggregate pre-acceptance pool context', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/pools/invitations/:invitationId',
          element: <PoolInvitationReviewPage />,
          loader: () => ({ invitation }),
        },
      ],
      { initialEntries: ['/pools/invitations/invitation-1'] },
    );

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', {
        name: 'You’re invited to contribute',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gift pool for Alex')).toBeInTheDocument();
    expect(screen.getByText(/2 people have joined so far/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Accept and join' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('accepts and declines through the invitation module', async () => {
    const accepted = await action(
      invitationActionArgs(new URLSearchParams({ intent: 'accept' })),
    );
    expect(getRouteResultStatus(accepted)).toBe(302);
    expect(acceptPoolInvitation).toHaveBeenCalledWith(
      'invitation-1',
      'invitee-1',
    );

    const declined = await action(
      invitationActionArgs(new URLSearchParams({ intent: 'decline' })),
    );
    expect(getRouteResultStatus(declined)).toBe(302);
    expect(declinePoolInvitation).toHaveBeenCalledWith(
      'invitation-1',
      'invitee-1',
    );
  });
});

function invitationActionArgs(body: URLSearchParams) {
  return toActionArgs({
    context: {},
    params: { invitationId: 'invitation-1' },
    request: new Request(
      'https://giftpool.app/pools/invitations/invitation-1',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    ),
  });
}
