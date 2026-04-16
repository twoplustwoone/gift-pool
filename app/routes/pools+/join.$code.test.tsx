/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const findUnique = vi.fn();
const createContributor = vi.fn();
const isUserInPool = vi.fn();
const redirectWithToast = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );

  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
  };
});

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
    poolContributor: {
      create: (...args: Array<unknown>) => createContributor(...args),
    },
  },
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  isUserInPool: (...args: Array<unknown>) => isUserInPool(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

import JoinPoolPage, { action, loader } from './join.$code.tsx';

function createInvitePool(overrides: Record<string, unknown> = {}) {
  return {
    _count: { contributors: 2 },
    id: 'pool-1',
    occasionType: 'BIRTHDAY',
    recipientName: null,
    recipientUser: { name: 'Alex', username: 'alex' },
    recipientUserId: null,
    status: 'OPEN',
    title: 'Alex Birthday Pool',
    ...overrides,
  };
}

describe('app/routes/pools+/join.$code.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('viewer-1');
    findUnique.mockReset().mockResolvedValue(createInvitePool());
    createContributor.mockReset().mockResolvedValue(undefined);
    isUserInPool.mockReset().mockResolvedValue(false);
    redirectWithToast.mockReset().mockReturnValue(
      new Response(null, {
        headers: { Location: '/pools/pool-1' },
        status: 302,
      }),
    );
  });

  it('redirects to /pools when the URL is missing a code param', async () => {
    const missingCode = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/pools/join'),
      }),
    );
    expect(missingCode).toBeInstanceOf(Response);
    expect((missingCode as Response).status).toBe(302);
  });

  it('throws 404 when the recipient loads their own pool invite (privacy — indistinguishable from invalid code)', async () => {
    findUnique.mockResolvedValueOnce(
      createInvitePool({ recipientUserId: 'viewer-1' }),
    );

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { code: 'invite-1' },
          request: new Request('https://giftpool.app/pools/join/invite-1'),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 for an invalid invite code', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { code: 'bogus' },
          request: new Request('https://giftpool.app/pools/join/bogus'),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('redirects existing contributors straight to the pool', async () => {
    isUserInPool.mockResolvedValueOnce(true);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/pools/join/invite-1'),
      }),
    );

    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/pools/pool-1');
  });

  it('does NOT create a contributor row when the recipient submits their own invite (privacy)', async () => {
    findUnique.mockResolvedValueOnce(
      createInvitePool({ recipientUserId: 'viewer-1' }),
    );

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { code: 'invite-1' },
          request: new Request('https://giftpool.app/pools/join/invite-1', {
            method: 'POST',
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(createContributor).not.toHaveBeenCalled();
  });

  it('returns invite details for valid links', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/pools/join/invite-1'),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toEqual({
      contributorCount: 2,
      occasionType: 'BIRTHDAY',
      poolId: 'pool-1',
      poolTitle: 'Alex Birthday Pool',
      recipientLabel: 'Alex',
    });
  });

  it('joins the pool when the viewer is not already a contributor', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/pools/join/invite-1', {
          method: 'POST',
        }),
      }),
    );

    expect(createContributor).toHaveBeenCalledWith({
      data: { poolId: 'pool-1', userId: 'viewer-1' },
    });
    expect(redirectWithToast).toHaveBeenCalledWith('/pools/pool-1', {
      description: "You've joined the pool — welcome!",
      type: 'success',
    });
    expect(result).toBeInstanceOf(Response);
  });

  it('does not create a duplicate contributor record', async () => {
    isUserInPool.mockResolvedValueOnce(true);

    await action(
      toActionArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/pools/join/invite-1', {
          method: 'POST',
        }),
      }),
    );

    expect(createContributor).not.toHaveBeenCalled();
  });

  it('renders the invite dialog', async () => {
    const App = createRoutesStub([
      {
        path: '/pools/join/:code',
        HydrateFallback: () => null,
        loader: async () => ({
          contributorCount: 2,
          occasionType: 'BIRTHDAY',
          poolId: 'pool-1',
          poolTitle: 'Alex Birthday Pool',
          recipientLabel: 'Alex',
        }),
        Component: JoinPoolPage,
      },
    ]);

    render(<App initialEntries={['/pools/join/invite-1']} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("You're invited to a pool 🎁")).toBeInTheDocument();
    expect(screen.getByText('Alex Birthday Pool')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === 'Birthday for Alex'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeInTheDocument();
  });
});
