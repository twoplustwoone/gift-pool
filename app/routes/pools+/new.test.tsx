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
const createPool = vi.fn();
const usersInGiftGroupsFindUnique = vi.fn();
const usersInGiftGroupsFindMany = vi.fn();
const giftGroupFindUnique = vi.fn();
const friendshipFindMany = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
    giftGroup: {
      findUnique: (...args: Array<unknown>) => giftGroupFindUnique(...args),
    },
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) =>
        usersInGiftGroupsFindUnique(...args),
      findMany: (...args: Array<unknown>) => usersInGiftGroupsFindMany(...args),
    },
    friendship: {
      findMany: (...args: Array<unknown>) => friendshipFindMany(...args),
    },
  },
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  createPool: (...args: Array<unknown>) => createPool(...args),
}));

import NewPoolPage, { action, loader } from './new.tsx';

function createFormRequest(form: Record<string, string>) {
  return new Request('https://giftpool.app/pools/new', {
    body: new URLSearchParams(form).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

describe('app/routes/pools+/new.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('viewer-1');
    findUnique.mockReset();
    createPool.mockReset().mockResolvedValue({ id: 'pool-1' });
    usersInGiftGroupsFindUnique.mockReset();
    usersInGiftGroupsFindMany.mockReset().mockResolvedValue([]);
    giftGroupFindUnique.mockReset();
    friendshipFindMany.mockReset().mockResolvedValue([]);
  });

  it('requires an authenticated user in the loader and returns a candidates list', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/pools/new'),
      }),
    );

    expect(result).toEqual({
      groupContext: null,
      candidates: [],
      preselectedRecipient: null,
      titlePrefill: '',
    });
    expect(requireUserId).toHaveBeenCalledWith(expect.any(Request));
  });

  it('returns deduped candidates (friends ∪ group members) sorted by name', async () => {
    friendshipFindMany.mockResolvedValue([
      {
        userA: {
          id: 'viewer-1',
          name: 'Viewer',
          username: 'viewer',
          image: null,
        },
        userB: {
          id: 'marco',
          name: 'Marco',
          username: 'marco',
          image: { id: 'img-marco' },
        },
      },
    ]);
    usersInGiftGroupsFindMany.mockResolvedValue([
      {
        user: {
          id: 'marco', // duplicate — friend AND group member
          name: 'Marco',
          username: 'marco',
          image: { id: 'img-marco' },
        },
      },
      {
        user: {
          id: 'alex',
          name: 'Alex',
          username: 'alex',
          image: null,
        },
      },
    ]);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/pools/new'),
      }),
    );

    expect(result.candidates.map((c: any) => c.id)).toEqual(['alex', 'marco']);
  });

  it('returns a validation payload for invalid form data', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'ORGANIZER_PICKS',
          occasionType: 'BIRTHDAY',
          title: '',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      status: 'error',
    });
  });

  it('rejects a standalone pool when recipientUserId is not in the viewer candidate pool', async () => {
    // Candidate pool is empty (no friends, no groups)
    friendshipFindMany.mockResolvedValue([]);
    usersInGiftGroupsFindMany.mockResolvedValue([]);

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'VOTE',
          occasionType: 'BIRTHDAY',
          recipientUserId: 'random-stranger-id',
          title: 'Tampered Pool',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      error: {
        '': ['That person is not in your friends or group members.'],
      },
    });
    expect(createPool).not.toHaveBeenCalled();
  });

  it('creates a pool from a selected candidate and redirects to the new pool page', async () => {
    // Candidate pool includes recipient-1
    friendshipFindMany.mockResolvedValue([
      {
        userA: { id: 'viewer-1', name: 'V', username: 'viewer', image: null },
        userB: {
          id: 'recipient-1',
          name: 'Alex',
          username: 'alex',
          image: null,
        },
      },
    ]);
    usersInGiftGroupsFindMany.mockResolvedValue([]);

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'VOTE',
          eventDate: '2026-06-14',
          occasionType: 'BIRTHDAY',
          recipientName: '',
          recipientUserId: 'recipient-1',
          title: 'Alex Birthday Pool',
        }),
      }),
    );

    expect(createPool).toHaveBeenCalledWith({
      decisionMode: 'VOTE',
      eventDate: new Date('2026-06-14'),
      giftGroupId: null,
      groupMemberDefaults: [],
      occasionType: 'BIRTHDAY',
      organizerId: 'viewer-1',
      recipientName: null,
      recipientUserId: 'recipient-1',
      title: 'Alex Birthday Pool',
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/pools/pool-1');
  });

  it('creates a pool with a free-text recipientName when no GiftPool user is selected', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'ORGANIZER_PICKS',
          occasionType: 'BIRTHDAY',
          recipientName: 'Offline Friend',
          title: 'Offline Pool',
        }),
      }),
    );

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: null,
        recipientName: 'Offline Friend',
      }),
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('renders the pool creation form with the recipient search picker', async () => {
    const App = createRoutesStub([
      {
        path: '/pools/new',
        loader: async () => ({ groupContext: null, candidates: [] }),
        HydrateFallback: () => null,
        Component: NewPoolPage,
      },
    ]);

    render(<App initialEntries={['/pools/new']} />);

    expect(await screen.findByLabelText('Pool title')).toBeInTheDocument();
    expect(screen.getByLabelText('Occasion')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Find a friend or group member/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Or just their name/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start Pool' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Organizer chooses/i }),
    ).toBeChecked();
  });

  it('filters candidates as the user types and selects one to fill the hidden field', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const App = createRoutesStub([
      {
        path: '/pools/new',
        loader: async () => ({
          groupContext: null,
          candidates: [
            { id: 'marco', name: 'Marco', username: 'marco', imageId: null },
            { id: 'alex', name: 'Alex', username: 'alex', imageId: null },
            {
              id: 'leo',
              name: 'Leonardo Bianchi',
              username: 'leo',
              imageId: null,
            },
          ],
        }),
        HydrateFallback: () => null,
        Component: NewPoolPage,
      },
    ]);

    const { container } = render(<App initialEntries={['/pools/new']} />);

    const search = await screen.findByLabelText(
      /Find a friend or group member/i,
    );
    await userEvent.type(search, 'leo');

    // Dropdown shows Leonardo
    const leoButton = await screen.findByRole('button', {
      name: /Leonardo Bianchi/i,
    });
    expect(leoButton).toBeInTheDocument();

    // Select
    await userEvent.click(leoButton);

    // After selection: chip shows the name; hidden input is set
    expect(screen.getByText('Leonardo Bianchi')).toBeInTheDocument();
    const hidden = container.querySelector(
      'input[name="recipientUserId"]',
    ) as HTMLInputElement | null;
    expect(hidden?.value).toBe('leo');

    // Clear and verify the search input returns
    await userEvent.click(
      screen.getByRole('button', { name: /clear selection/i }),
    );
    expect(
      screen.getByLabelText(/Find a friend or group member/i),
    ).toBeInTheDocument();
  });

  it('shows a helper hint when no candidates are available', async () => {
    const App = createRoutesStub([
      {
        path: '/pools/new',
        loader: async () => ({ groupContext: null, candidates: [] }),
        HydrateFallback: () => null,
        Component: NewPoolPage,
      },
    ]);

    render(<App initialEntries={['/pools/new']} />);

    expect(
      await screen.findByText(
        /Once you add friends or join groups, they'll show up here/i,
      ),
    ).toBeInTheDocument();
  });

  it('creates a group-backed pool with re-derived member defaults, including the organizer', async () => {
    // Organizer is a member of the group
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ userId: 'viewer-1' })
      // Recipient is a member of the group
      .mockResolvedValueOnce({ userId: 'recipient-1' });
    // Authoritative contribution defaults from DB
    usersInGiftGroupsFindMany.mockResolvedValue([
      { userId: 'viewer-1', contributionCents: 3000 },
      { userId: 'member-2', contributionCents: 2000 },
    ]);

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          contributorIds: 'member-2',
          decisionMode: 'VOTE',
          eventDate: '2026-06-14',
          giftGroupId: 'group-1',
          occasionType: 'BIRTHDAY',
          recipientUserId: 'recipient-1',
          title: 'Recipient Birthday Pool',
        }),
      }),
    );

    expect(createPool).toHaveBeenCalledWith({
      decisionMode: 'VOTE',
      eventDate: new Date('2026-06-14'),
      giftGroupId: 'group-1',
      groupMemberDefaults: [
        { userId: 'viewer-1', contributionCents: 3000 },
        { userId: 'member-2', contributionCents: 2000 },
      ],
      occasionType: 'BIRTHDAY',
      organizerId: 'viewer-1',
      recipientName: null,
      recipientUserId: 'recipient-1',
      title: 'Recipient Birthday Pool',
    });
    expect(usersInGiftGroupsFindMany).toHaveBeenCalledWith({
      where: {
        giftGroupId: 'group-1',
        userId: { in: ['member-2', 'viewer-1'] },
        removedAt: null,
      },
      select: { userId: true, contributionCents: true },
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('rejects a group-backed submission when organizer is not in the group', async () => {
    usersInGiftGroupsFindUnique.mockResolvedValueOnce(null);

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          contributorIds: 'viewer-1',
          decisionMode: 'VOTE',
          giftGroupId: 'group-1',
          occasionType: 'BIRTHDAY',
          recipientUserId: 'recipient-1',
          title: 'Bad Pool',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(403);
    expect(createPool).not.toHaveBeenCalled();
  });

  it('rejects a group-backed submission with no selected contributors', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ userId: 'viewer-1' })
      .mockResolvedValueOnce({ userId: 'recipient-1' });

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          contributorIds: '',
          decisionMode: 'VOTE',
          giftGroupId: 'group-1',
          occasionType: 'BIRTHDAY',
          recipientUserId: 'recipient-1',
          title: 'Empty Contributors',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    expect(createPool).not.toHaveBeenCalled();
  });

  it('filters the recipient out of contributors even if passed in the form', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ userId: 'viewer-1' })
      .mockResolvedValueOnce({ userId: 'recipient-1' });
    usersInGiftGroupsFindMany.mockResolvedValue([
      { userId: 'viewer-1', contributionCents: 3000 },
      { userId: 'recipient-1', contributionCents: 2000 },
      { userId: 'member-2', contributionCents: 1000 },
    ]);

    await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          contributorIds: 'viewer-1,recipient-1,member-2',
          decisionMode: 'VOTE',
          giftGroupId: 'group-1',
          occasionType: 'BIRTHDAY',
          recipientUserId: 'recipient-1',
          title: 'Privacy-safe Pool',
        }),
      }),
    );

    const call = createPool.mock.calls[0]?.[0];
    const contributorIds = call.groupMemberDefaults.map(
      (m: { userId: string }) => m.userId,
    );
    expect(contributorIds).not.toContain('recipient-1');
    expect(contributorIds).toEqual(['viewer-1', 'member-2']);
  });
});
