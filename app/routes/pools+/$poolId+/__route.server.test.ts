/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizerNudgeError as MockOrganizerNudgeError } from '#app/utils/organizer-nudges.server.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const requirePoolContributor = vi.fn();
const canManagePool = vi.fn();
const isPoolOrganizer = vi.fn();
const addContributor = vi.fn();
const assignDeliverer = vi.fn();
const assignPurchaser = vi.fn();
const callVote = vi.fn();
const cancelPool = vi.fn();
const castVote = vi.fn();
const chooseIdea = vi.fn();
const closeVote = vi.fn();
const deleteIdea = vi.fn();
const deletePool = vi.fn();
const generatePoolInviteCode = vi.fn();
const getContributionBreakdown = vi.fn();
const markContributorPaid = vi.fn();
const markDelivered = vi.fn();
const markPurchased = vi.fn();
const proposeIdea = vi.fn();
const removeContributor = vi.fn();
const updateContribution = vi.fn();
const updateFinalPrice = vi.fn();
const updatePool = vi.fn();
const poolFindUnique = vi.fn();
const giftIdeaFindFirst = vi.fn();
const ideaVoteFindUnique = vi.fn();
const wishlistItemFindMany = vi.fn();
const wishlistItemFindFirst = vi.fn();
const canViewWishlistOf = vi.fn();
const queueLogEvent = vi.fn();
const redirectWithToast = vi.fn();
const getContextNotificationAwareness = vi.fn();
const getOrganizerNudgeAvailability = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/friends.server.ts', () => ({
  canViewWishlistOf: (...args: Array<unknown>) => canViewWishlistOf(...args),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/request-context.server.ts', () => ({
  getRequestContext: async () => ({ requestId: 'request-1', sessionId: null }),
}));

vi.mock('#app/utils/pool-permissions.server.ts', () => ({
  canManagePool: (...args: Array<unknown>) => canManagePool(...args),
  isPoolOrganizer: (...args: Array<unknown>) => isPoolOrganizer(...args),
  requirePoolContributor: (...args: Array<unknown>) =>
    requirePoolContributor(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    giftIdea: {
      findFirst: (...args: Array<unknown>) => giftIdeaFindFirst(...args),
    },
    ideaVote: {
      findUnique: (...args: Array<unknown>) => ideaVoteFindUnique(...args),
    },
    pool: {
      findUnique: (...args: Array<unknown>) => poolFindUnique(...args),
    },
    wishlistItem: {
      findMany: (...args: Array<unknown>) => wishlistItemFindMany(...args),
      findFirst: (...args: Array<unknown>) => wishlistItemFindFirst(...args),
    },
  },
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  addContributor: (...args: Array<unknown>) => addContributor(...args),
  assignDeliverer: (...args: Array<unknown>) => assignDeliverer(...args),
  assignPurchaser: (...args: Array<unknown>) => assignPurchaser(...args),
  callVote: (...args: Array<unknown>) => callVote(...args),
  cancelPool: (...args: Array<unknown>) => cancelPool(...args),
  castVote: (...args: Array<unknown>) => castVote(...args),
  chooseIdea: (...args: Array<unknown>) => chooseIdea(...args),
  closeVote: (...args: Array<unknown>) => closeVote(...args),
  deleteIdea: (...args: Array<unknown>) => deleteIdea(...args),
  deletePool: (...args: Array<unknown>) => deletePool(...args),
  generatePoolInviteCode: (...args: Array<unknown>) =>
    generatePoolInviteCode(...args),
  getContributionBreakdown: (...args: Array<unknown>) =>
    getContributionBreakdown(...args),
  markContributorPaid: (...args: Array<unknown>) =>
    markContributorPaid(...args),
  markDelivered: (...args: Array<unknown>) => markDelivered(...args),
  markPurchased: (...args: Array<unknown>) => markPurchased(...args),
  poolSelect: {},
  proposeIdea: (...args: Array<unknown>) => proposeIdea(...args),
  removeContributor: (...args: Array<unknown>) => removeContributor(...args),
  updateContribution: (...args: Array<unknown>) => updateContribution(...args),
  updateFinalPrice: (...args: Array<unknown>) => updateFinalPrice(...args),
  updatePool: (...args: Array<unknown>) => updatePool(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  getContextNotificationAwareness: (...args: Array<unknown>) =>
    getContextNotificationAwareness(...args),
}));

vi.mock('#app/utils/organizer-nudges.server.ts', () => ({
  ORGANIZER_NUDGE_KINDS: {
    CONTRIBUTION: 'CONTRIBUTION',
    DELIVERY: 'DELIVERY',
    PURCHASE: 'PURCHASE',
    VOTE: 'VOTE',
  },
  OrganizerNudgeError: class OrganizerNudgeError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'OrganizerNudgeError';
    }
  },
  getOrganizerNudgeAvailability: (...args: Array<unknown>) =>
    getOrganizerNudgeAvailability(...args),
}));

import { action, loader } from './__route.server.ts';

function createFormRequest(form: Record<string, string>) {
  return new Request('https://giftpool.app/pools/pool-1', {
    body: new URLSearchParams(form),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

function createPool(overrides: Record<string, unknown> = {}) {
  return {
    chosenIdeaId: null,
    contributors: [
      {
        contributionCents: 3000,
        hasPaid: false,
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: {
          id: 'viewer-1',
          image: null,
          name: 'Viewer',
          username: 'viewer',
        },
        userId: 'viewer-1',
      },
    ],
    deliverer: null,
    delivererId: 'viewer-1',
    eventDate: null,
    finalPriceCents: null,
    giftGroupId: null,
    id: 'pool-1',
    ideas: [],
    inviteCode: 'invite-123',
    occasionType: 'BIRTHDAY',
    organizer: {
      id: 'viewer-1',
      image: null,
      name: 'Viewer',
      username: 'viewer',
    },
    organizerId: 'viewer-1',
    purchaser: null,
    purchaserId: 'viewer-1',
    recipientName: null,
    recipientUser: null,
    recipientUserId: null,
    status: 'VOTING',
    title: 'Birthday Pool',
    ...overrides,
  };
}

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('viewer-1');
  requirePoolContributor.mockReset().mockResolvedValue(undefined);
  canManagePool.mockReset().mockResolvedValue(true);
  isPoolOrganizer.mockReset().mockReturnValue(true);
  addContributor.mockReset().mockResolvedValue(undefined);
  assignDeliverer.mockReset().mockResolvedValue(undefined);
  assignPurchaser.mockReset().mockResolvedValue(undefined);
  callVote.mockReset().mockResolvedValue(undefined);
  cancelPool.mockReset().mockResolvedValue(undefined);
  castVote.mockReset().mockResolvedValue(undefined);
  chooseIdea.mockReset().mockResolvedValue(undefined);
  closeVote.mockReset().mockResolvedValue(undefined);
  deleteIdea.mockReset().mockResolvedValue(undefined);
  deletePool.mockReset().mockResolvedValue(undefined);
  generatePoolInviteCode.mockReset().mockResolvedValue('invite-123');
  getContributionBreakdown.mockReset().mockResolvedValue(null);
  markContributorPaid.mockReset().mockResolvedValue(undefined);
  markDelivered.mockReset().mockResolvedValue(undefined);
  markPurchased.mockReset().mockResolvedValue(undefined);
  proposeIdea.mockReset().mockResolvedValue(undefined);
  removeContributor.mockReset().mockResolvedValue(undefined);
  updateContribution.mockReset().mockResolvedValue(undefined);
  updateFinalPrice.mockReset().mockResolvedValue(undefined);
  updatePool.mockReset().mockResolvedValue({ id: 'pool-1' });
  giftIdeaFindFirst.mockReset();
  ideaVoteFindUnique.mockReset().mockResolvedValue(null);
  wishlistItemFindMany.mockReset().mockResolvedValue([]);
  wishlistItemFindFirst.mockReset().mockResolvedValue(null);
  canViewWishlistOf.mockReset().mockResolvedValue(true);
  queueLogEvent.mockReset().mockReturnValue({ eventId: 'event-1' });
  poolFindUnique.mockReset().mockResolvedValue(createPool());
  redirectWithToast.mockReset().mockResolvedValue(
    new Response(null, {
      headers: { Location: '/pools' },
      status: 302,
    }),
  );
  getContextNotificationAwareness.mockReset().mockResolvedValue({
    notificationOff: false,
    noticeVisible: false,
    reason: null,
    preference: { activityLevel: 'IMPORTANT_ONLY' },
  });
  getOrganizerNudgeAvailability.mockImplementation(
    async ({ kind }: { kind: string }) => ({
      kind,
      latestNudge: null,
      status: 'AVAILABLE',
    }),
  );
});

describe('pool detail route loader', () => {
  it('hides recipient wishlist items from viewers the visibility rules exclude', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ recipientUserId: 'recipient-1', status: 'OPEN' }),
    );
    canViewWishlistOf.mockResolvedValue(false);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    );

    expect(canViewWishlistOf).toHaveBeenCalledWith('viewer-1', 'recipient-1');
    expect(
      (result as { recipientWishlistItems: unknown[] }).recipientWishlistItems,
    ).toEqual([]);
    expect(wishlistItemFindMany).not.toHaveBeenCalled();
  });

  it('never ships peer contribution amounts or paid status (ADR 0001)', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({
        contributors: [
          {
            contributionCents: 3000,
            hasPaid: false,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            user: {
              id: 'viewer-1',
              image: null,
              name: 'Viewer',
              username: 'viewer',
            },
            userId: 'viewer-1',
          },
          {
            contributionCents: 2000,
            hasPaid: true,
            joinedAt: new Date('2026-01-02T00:00:00.000Z'),
            user: { id: 'peer-1', image: null, name: 'Peer', username: 'peer' },
            userId: 'peer-1',
          },
          {
            contributionCents: null,
            hasPaid: false,
            joinedAt: new Date('2026-01-03T00:00:00.000Z'),
            user: {
              id: 'peer-2',
              image: null,
              name: 'NoLimit',
              username: 'nolimit',
            },
            userId: 'peer-2',
          },
        ],
      }),
    );

    const result = (await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    )) as any;

    for (const c of result.pool.contributors) {
      expect(c).not.toHaveProperty('contributionCents');
      expect(c).not.toHaveProperty('hasPaid');
    }
    // Manager (canManagePool → true in setup) sees limit-missing flags only.
    expect(
      Object.fromEntries(
        result.pool.contributors.map((c: any) => [c.userId, c.hasSetLimit]),
      ),
    ).toEqual({ 'viewer-1': true, 'peer-1': true, 'peer-2': false });
    // Aggregate Available Budget is shared; the viewer's own record is intact.
    expect(result.availableBudgetCents).toBe(5000);
    expect(result.limitsSetCount).toBe(2);
    expect(result.viewer.contributionCents).toBe(3000);
  });

  it('hides limit-missing flags from non-managing contributors', async () => {
    canManagePool.mockResolvedValue(false);
    isPoolOrganizer.mockReturnValue(false);
    poolFindUnique.mockResolvedValue(
      createPool({
        organizerId: 'peer-1',
        purchaserId: null,
        delivererId: null,
        contributors: [
          {
            contributionCents: 3000,
            hasPaid: false,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            user: {
              id: 'viewer-1',
              image: null,
              name: 'Viewer',
              username: 'viewer',
            },
            userId: 'viewer-1',
          },
          {
            contributionCents: null,
            hasPaid: false,
            joinedAt: new Date('2026-01-02T00:00:00.000Z'),
            user: { id: 'peer-1', image: null, name: 'Peer', username: 'peer' },
            userId: 'peer-1',
          },
        ],
      }),
    );

    const result = (await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    )) as any;

    expect(result.pool.contributors.map((c: any) => c.hasSetLimit)).toEqual([
      null,
      null,
    ]);
  });

  it('projects the breakdown to own-share-only for non-purchasers', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ status: 'DECIDED', purchaserId: 'peer-1' }),
    );
    getContributionBreakdown.mockResolvedValue({
      breakdown: [
        {
          userId: 'viewer-1',
          owedCents: 1200,
          hasPaid: false,
          user: {
            id: 'viewer-1',
            image: null,
            name: 'Viewer',
            username: 'viewer',
          },
        },
        {
          userId: 'peer-2',
          owedCents: 800,
          hasPaid: true,
          user: { id: 'peer-2', image: null, name: 'Other', username: 'other' },
        },
      ],
      shortfallCents: 100,
    });

    const result = (await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    )) as any;

    expect(result.contributionBreakdown).toEqual({
      kind: 'contributor',
      viewerShare: { owedCents: 1200, hasPaid: false },
      shortfallCents: 100,
      allReceived: false,
    });
  });

  it('gives the purchaser the full breakdown with Received statuses', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ status: 'DECIDED', purchaserId: 'viewer-1' }),
    );
    getContributionBreakdown.mockResolvedValue({
      breakdown: [
        {
          userId: 'peer-1',
          owedCents: 800,
          hasPaid: true,
          user: { id: 'peer-1', image: null, name: 'Peer', username: 'peer' },
        },
      ],
      shortfallCents: 0,
    });

    const result = (await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    )) as any;

    expect(result.contributionBreakdown.kind).toBe('purchaser');
    expect(result.contributionBreakdown.breakdown).toHaveLength(1);
    expect(result.contributionBreakdown.breakdown[0]).toMatchObject({
      userId: 'peer-1',
      owedCents: 800,
      hasPaid: true,
    });
  });

  it('throws 404 when the pool cannot be loaded', async () => {
    poolFindUnique.mockResolvedValue(null);

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: new Request('https://giftpool.app/pools/pool-1'),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when the viewer is the recipient (privacy — must not confirm pool exists)', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ recipientUserId: 'viewer-1' }),
    );

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: new Request('https://giftpool.app/pools/pool-1'),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when the viewer is not a contributor (privacy — no 403 leak)', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({
        contributors: [
          {
            contributionCents: null,
            hasPaid: false,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            user: {
              id: 'other-1',
              image: null,
              name: 'Other',
              username: 'other',
            },
            userId: 'other-1',
          },
        ],
      }),
    );

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: new Request('https://giftpool.app/pools/pool-1'),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns viewer state, vote, breakdown, and invite URL for decided pools', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({
        contributors: [
          {
            contributionCents: 3000,
            hasPaid: true,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            user: {
              id: 'viewer-1',
              image: null,
              name: 'Viewer',
              username: 'viewer',
            },
            userId: 'viewer-1',
          },
        ],
        status: 'DECIDED',
      }),
    );
    isPoolOrganizer.mockReturnValue(false);
    canManagePool.mockResolvedValue(true);
    ideaVoteFindUnique.mockResolvedValue({ ideaId: 'idea-1' });
    getContributionBreakdown.mockResolvedValue({
      breakdown: [{ actualCents: 3000 }],
    });

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    );

    await expect(getRouteResultData(result)).resolves.toMatchObject({
      canManage: true,
      contributionBreakdown: { breakdown: [{ actualCents: 3000 }] },
      inviteUrl: 'https://giftpool.app/pools/join/invite-123',
      isOrganizer: false,
      myVoteIdeaId: 'idea-1',
      organizerReminderStates: {},
      viewer: { userId: 'viewer-1' },
    });
    expect(getContributionBreakdown).toHaveBeenCalledWith('pool-1');
  });

  it('returns null breakdowns for non-decided pools', async () => {
    poolFindUnique.mockResolvedValue(createPool({ status: 'OPEN' }));

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    );

    await expect(getRouteResultData(result)).resolves.toMatchObject({
      contributionBreakdown: null,
      myVoteIdeaId: null,
      organizerReminderStates: {
        CONTRIBUTION: { status: 'AVAILABLE' },
      },
    });
    expect(getOrganizerNudgeAvailability).toHaveBeenCalledTimes(1);
    expect(getOrganizerNudgeAvailability).toHaveBeenCalledWith({
      kind: 'CONTRIBUTION',
      poolId: 'pool-1',
      senderId: 'viewer-1',
    });
    expect(getContributionBreakdown).not.toHaveBeenCalled();
  });

  it('loads voting reminder availability without resolving recipient counts', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: new Request('https://giftpool.app/pools/pool-1'),
      }),
    );

    await expect(getRouteResultData(result)).resolves.toMatchObject({
      organizerReminderStates: {
        CONTRIBUTION: { status: 'AVAILABLE' },
        VOTE: { status: 'AVAILABLE' },
      },
    });
    expect(getOrganizerNudgeAvailability).toHaveBeenCalledTimes(2);
  });

  it.each(['POOL_NOT_FOUND', 'FORBIDDEN', 'TASK_UNAVAILABLE'] as const)(
    'omits stale reminder availability after a %s race',
    async (code) => {
      getOrganizerNudgeAvailability.mockImplementation(
        async ({ kind }: { kind: string }) => {
          if (kind === 'VOTE') throw new MockOrganizerNudgeError(code, code);
          return { kind, latestNudge: null, status: 'AVAILABLE' };
        },
      );

      const result = await loader(
        toLoaderArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: new Request('https://giftpool.app/pools/pool-1'),
        }),
      );
      const resultData = await getRouteResultData(result);

      expect(
        (resultData as { organizerReminderStates: unknown })
          .organizerReminderStates,
      ).toEqual({
        CONTRIBUTION: {
          kind: 'CONTRIBUTION',
          latestNudge: null,
          status: 'AVAILABLE',
        },
      });
    },
  );

  it('keeps unexpected reminder availability failures visible', async () => {
    getOrganizerNudgeAvailability.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: new Request('https://giftpool.app/pools/pool-1'),
        }),
      ),
    ).rejects.toThrow('database unavailable');
  });
});

describe('pool detail route action', () => {
  it('returns a 400 submission response for invalid forms', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'cast-vote',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    expect(castVote).not.toHaveBeenCalled();
  });

  it('proposes ideas with parsed optional price fields', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          estimatedPriceCents: '15.99',
          intent: 'propose-idea',
          name: 'Speaker',
          poolId: 'pool-1',
          url: '',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(proposeIdea).toHaveBeenCalledWith({
      description: null,
      estimatedPriceCents: 1599,
      name: 'Speaker',
      poolId: 'pool-1',
      proposedById: 'viewer-1',
      url: null,
      wishlistItemId: null,
    });
  });

  it('logs a pool_idea_proposed event with smart-link adoption properties', async () => {
    await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          estimatedPriceCents: '15.99',
          intent: 'propose-idea',
          name: 'Speaker',
          poolId: 'pool-1',
          url: '',
        }),
      }),
    );

    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'pool_idea_proposed',
      userId: 'viewer-1',
      source: 'server',
      requestId: 'request-1',
      properties: {
        poolId: 'pool-1',
        fromWishlist: false,
        hasPrice: true,
      },
    });
  });

  it('accepts a wishlistItemId owned by the pool recipient', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ recipientUserId: 'recipient-1' }),
    );
    wishlistItemFindFirst.mockResolvedValue({ id: 'item-1' });

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'propose-idea',
          name: 'From the wishlist',
          poolId: 'pool-1',
          wishlistItemId: 'item-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(wishlistItemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1', ownerId: 'recipient-1' },
      }),
    );
    expect(proposeIdea).toHaveBeenCalledWith(
      expect.objectContaining({ wishlistItemId: 'item-1' }),
    );
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ fromWishlist: true }),
      }),
    );
  });

  it('rejects a wishlistItemId when the proposer may not view the recipient wishlist', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ recipientUserId: 'recipient-1' }),
    );
    canViewWishlistOf.mockResolvedValue(false);
    wishlistItemFindFirst.mockResolvedValue({ id: 'item-1' });

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'propose-idea',
            name: 'Hidden wishlist item',
            poolId: 'pool-1',
            wishlistItemId: 'item-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });
    expect(wishlistItemFindFirst).not.toHaveBeenCalled();
    expect(proposeIdea).not.toHaveBeenCalled();
  });

  it('rejects a wishlistItemId the recipient does not own', async () => {
    poolFindUnique.mockResolvedValue(
      createPool({ recipientUserId: 'recipient-1' }),
    );
    wishlistItemFindFirst.mockResolvedValue(null);

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'propose-idea',
            name: 'Sneaky link',
            poolId: 'pool-1',
            wishlistItemId: 'someone-elses-item',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });
    expect(proposeIdea).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
  });

  it('rejects deleting ideas that are not in the route pool', async () => {
    giftIdeaFindFirst.mockResolvedValue(null);

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            ideaId: 'idea-2',
            intent: 'delete-idea',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 404 } });

    expect(canManagePool).not.toHaveBeenCalled();
    expect(deleteIdea).not.toHaveBeenCalled();
  });

  it('allows same-pool idea deletion for the proposer', async () => {
    giftIdeaFindFirst.mockResolvedValue({ proposedById: 'viewer-1' });

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          ideaId: 'idea-1',
          intent: 'delete-idea',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(deleteIdea).toHaveBeenCalledWith('pool-1', 'idea-1', 'viewer-1');
  });

  it('allows managers to delete ideas proposed by someone else', async () => {
    giftIdeaFindFirst.mockResolvedValue({ proposedById: 'friend-1' });

    await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          ideaId: 'idea-1',
          intent: 'delete-idea',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(canManagePool).toHaveBeenCalledWith('viewer-1', {
      giftGroupId: null,
      id: 'pool-1',
      organizerId: 'viewer-1',
      status: 'VOTING',
    });
    expect(deleteIdea).toHaveBeenCalledWith('pool-1', 'idea-1', 'viewer-1');
  });

  it('rejects vote submissions when the route pool is not voting', async () => {
    poolFindUnique.mockResolvedValue(createPool({ status: 'OPEN' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            ideaId: 'idea-1',
            intent: 'cast-vote',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });

    expect(castVote).not.toHaveBeenCalled();
  });

  it('passes same-pool votes through to castVote', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          ideaId: 'idea-1',
          intent: 'cast-vote',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(castVote).toHaveBeenCalledWith('pool-1', 'idea-1', 'viewer-1');
  });

  it('requires managers to call a vote', async () => {
    canManagePool.mockResolvedValue(false);

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'call-vote',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });

    expect(callVote).not.toHaveBeenCalled();
  });

  it('lets managers call a vote', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'call-vote',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(callVote).toHaveBeenCalledWith('pool-1', 'viewer-1');
  });

  it('rejects close-vote when the route pool is not voting', async () => {
    poolFindUnique.mockResolvedValue(createPool({ status: 'DECIDED' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'close-vote',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });

    expect(closeVote).not.toHaveBeenCalled();
  });

  it('allows managers to close an active vote', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'close-vote',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(closeVote).toHaveBeenCalledWith('pool-1', 'viewer-1');
  });

  it('lets managers choose an idea', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          finalPriceCents: '2500',
          ideaId: 'idea-1',
          intent: 'choose-idea',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(chooseIdea).toHaveBeenCalledWith(
      'pool-1',
      'idea-1',
      'viewer-1',
      2500,
    );
  });

  it('updates the current user contribution in cents', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          contributionCents: '45.00',
          intent: 'update-contribution',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(updateContribution).toHaveBeenCalledWith('pool-1', 'viewer-1', 4500);
  });

  it('assigns purchasers after ensuring they are contributors', async () => {
    addContributor.mockRejectedValue(new Error('already a contributor'));

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'assign-purchaser',
          poolId: 'pool-1',
          userId: 'friend-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(addContributor).toHaveBeenCalledWith('pool-1', 'friend-1');
    expect(assignPurchaser).toHaveBeenCalledWith(
      'pool-1',
      'friend-1',
      'viewer-1',
    );
  });

  it('assigns deliverers after ensuring they are contributors', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'assign-deliverer',
          poolId: 'pool-1',
          userId: 'friend-2',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(addContributor).toHaveBeenCalledWith('pool-1', 'friend-2');
    expect(assignDeliverer).toHaveBeenCalledWith(
      'pool-1',
      'friend-2',
      'viewer-1',
    );
  });

  it('restricts purchased and delivered markers to their assigned users', async () => {
    poolFindUnique.mockResolvedValue(createPool({ purchaserId: 'friend-1' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'mark-purchased',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });

    poolFindUnique.mockResolvedValue(createPool({ delivererId: 'friend-2' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'mark-delivered',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('marks purchased and delivered when the assigned user submits', async () => {
    let result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'mark-purchased',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(markPurchased).toHaveBeenCalledWith('pool-1', 'viewer-1');

    result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'mark-delivered',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(markDelivered).toHaveBeenCalledWith('pool-1', 'viewer-1');
  });

  it('restricts payment markers to the purchaser and forwards valid updates', async () => {
    poolFindUnique.mockResolvedValue(createPool({ purchaserId: 'friend-1' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            hasPaid: 'true',
            intent: 'mark-paid',
            poolId: 'pool-1',
            targetUserId: 'friend-2',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });

    poolFindUnique.mockResolvedValue(createPool({ purchaserId: 'viewer-1' }));

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          hasPaid: 'false',
          intent: 'mark-paid',
          poolId: 'pool-1',
          targetUserId: 'friend-2',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(markContributorPaid).toHaveBeenCalledWith(
      'pool-1',
      'friend-2',
      false,
    );
  });

  it('updates final price using dollar input', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          finalPriceCents: '25.00',
          intent: 'update-final-price',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(updateFinalPrice).toHaveBeenCalledWith('pool-1', 2500, 'viewer-1');
  });

  it('returns generated invite URLs to managers', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'generate-invite',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toEqual({
      inviteUrl: 'https://giftpool.app/pools/join/invite-123',
    });
  });

  it('removes contributors when a manager requests it', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'remove-contributor',
          poolId: 'pool-1',
          userId: 'friend-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(removeContributor).toHaveBeenCalledWith(
      'pool-1',
      'friend-1',
      'viewer-1',
    );
  });

  it('prevents organizers from leaving and redirects other contributors', async () => {
    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'leave-pool',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });

    poolFindUnique.mockResolvedValue(createPool({ organizerId: 'friend-1' }));

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'leave-pool',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect(removeContributor).toHaveBeenCalledWith(
      'pool-1',
      'viewer-1',
      'viewer-1',
    );
    expect(redirectWithToast).toHaveBeenCalledWith('/pools', {
      description: 'You have left the pool.',
      title: 'Left pool',
      type: 'success',
    });
  });

  it('cancels pools for managers', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'cancel-pool',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(cancelPool).toHaveBeenCalledWith('pool-1', 'viewer-1');
  });

  it('requires organizers to delete the pool', async () => {
    isPoolOrganizer.mockReturnValue(false);

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'delete-pool',
            poolId: 'pool-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });

    expect(deletePool).not.toHaveBeenCalled();
  });

  it('redirects to /pools after deleting a standalone pool as organizer', async () => {
    // poolFindUnique returns a pool with giftGroupId: null by default
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'delete-pool',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect(deletePool).toHaveBeenCalledWith('pool-1', 'viewer-1');
    expect(redirectWithToast).toHaveBeenCalledWith('/pools', {
      description: 'The pool has been deleted.',
      title: 'Pool deleted',
      type: 'success',
    });
  });

  it('redirects to the parent group after deleting a group-backed pool', async () => {
    poolFindUnique.mockResolvedValue(createPool({ giftGroupId: 'group-42' }));

    await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'delete-pool',
          poolId: 'pool-1',
        }),
      }),
    );

    expect(deletePool).toHaveBeenCalledWith('pool-1', 'viewer-1');
    expect(redirectWithToast).toHaveBeenCalledWith('/groups/group-42', {
      description: 'The pool has been deleted.',
      title: 'Pool deleted',
      type: 'success',
    });
  });
});

describe('pool detail route action — update-pool-details', () => {
  it('updates details and the gift-selection method while the pool is OPEN', async () => {
    poolFindUnique.mockResolvedValue(createPool({ status: 'OPEN' }));

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'update-pool-details',
          poolId: 'pool-1',
          title: 'Updated title',
          occasionType: 'WEDDING',
          eventDate: '2026-05-01',
          decisionMode: 'VOTE',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(updatePool).toHaveBeenCalledWith(
      'pool-1',
      'viewer-1',
      expect.objectContaining({
        title: 'Updated title',
        occasionType: 'WEDDING',
        decisionMode: 'VOTE',
      }),
    );
  });

  it('saves details for a past-OPEN pool even when decisionMode is omitted', async () => {
    // createPool defaults to VOTING. The editor disables the method select past
    // OPEN, so the browser omits decisionMode entirely — this must still save.
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { poolId: 'pool-1' },
        request: createFormRequest({
          intent: 'update-pool-details',
          poolId: 'pool-1',
          title: 'Updated title',
          occasionType: 'BIRTHDAY',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(updatePool).toHaveBeenCalledWith(
      'pool-1',
      'viewer-1',
      expect.not.objectContaining({ decisionMode: expect.anything() }),
    );
  });

  it('rejects detail edits from non-managers', async () => {
    canManagePool.mockResolvedValue(false);

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'update-pool-details',
            poolId: 'pool-1',
            title: 'Updated title',
            occasionType: 'BIRTHDAY',
            decisionMode: 'VOTE',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });
    expect(updatePool).not.toHaveBeenCalled();
  });

  it('rejects detail edits once the pool is closed', async () => {
    poolFindUnique.mockResolvedValue(createPool({ status: 'CANCELLED' }));

    await expect(
      action(
        toActionArgs({
          context: {} as never,
          params: { poolId: 'pool-1' },
          request: createFormRequest({
            intent: 'update-pool-details',
            poolId: 'pool-1',
            title: 'Updated title',
            occasionType: 'BIRTHDAY',
            decisionMode: 'VOTE',
          }),
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 400 } });
    expect(updatePool).not.toHaveBeenCalled();
  });
});
