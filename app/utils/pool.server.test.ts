/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';

const nanoid = vi.fn(() => 'invite-123');

const captureMessage = vi.fn();
const captureException = vi.fn();
const queueNotification = vi.fn();
const wishlistClaimFindUnique = vi.fn();

const giftIdeaCreate = vi.fn();
const giftIdeaDelete = vi.fn();
const giftIdeaFindFirst = vi.fn();
const ideaVoteUpsert = vi.fn();
const ideaVoteCount = vi.fn();
const logPoolActivity = vi.fn();
const poolContributorCreate = vi.fn();
const poolContributorDelete = vi.fn();
const poolContributorFindUnique = vi.fn();
const poolContributorUpdate = vi.fn();
const poolCreate = vi.fn();
const poolDelete = vi.fn();
const poolFindUnique = vi.fn();
const poolUpdate = vi.fn();
const poolUpdateMany = vi.fn();
const queueLogEvent = vi.fn();
const queuePoolActivityNotifications = vi.fn();
const syncPoolClaimInTx = vi.fn();

vi.mock('nanoid', () => ({
  nanoid: () => nanoid(),
}));

vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
  captureMessage: (...args: Array<unknown>) => captureMessage(...args),
}));

vi.mock('#app/utils/db.server.ts', () => {
  // `$transaction` runs the callback against this same mocked client, so a
  // transaction body's `tx.pool.updateMany(...)` etc. hit the very mocks
  // (`poolUpdateMany` and friends) that non-transactional callers already
  // exercise — no separate tx-mock surface to keep in sync.
  const prismaMock: any = {
    giftIdea: {
      create: (...args: Array<unknown>) => giftIdeaCreate(...args),
      delete: (...args: Array<unknown>) => giftIdeaDelete(...args),
      findFirst: (...args: Array<unknown>) => giftIdeaFindFirst(...args),
    },
    ideaVote: {
      upsert: (...args: Array<unknown>) => ideaVoteUpsert(...args),
      count: (...args: Array<unknown>) => ideaVoteCount(...args),
    },
    pool: {
      create: (...args: Array<unknown>) => poolCreate(...args),
      delete: (...args: Array<unknown>) => poolDelete(...args),
      findUnique: (...args: Array<unknown>) => poolFindUnique(...args),
      update: (...args: Array<unknown>) => poolUpdate(...args),
      updateMany: (...args: Array<unknown>) => poolUpdateMany(...args),
    },
    poolContributor: {
      create: (...args: Array<unknown>) => poolContributorCreate(...args),
      delete: (...args: Array<unknown>) => poolContributorDelete(...args),
      findUnique: (...args: Array<unknown>) =>
        poolContributorFindUnique(...args),
      update: (...args: Array<unknown>) => poolContributorUpdate(...args),
    },
    // Read-only in this module: `chooseIdea` looks up the current claim
    // holder (post-transaction) to compose the conflict notification. Only
    // wishlist-claims.server.ts is permitted to write WishlistClaim — see
    // wishlist-claim-write-guard.test.ts.
    wishlistClaim: {
      findUnique: (...args: Array<unknown>) =>
        wishlistClaimFindUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock),
  };
  return { prisma: prismaMock };
});

vi.mock('#app/utils/pool-activity.server.ts', () => ({
  logPoolActivity: (...args: Array<unknown>) => logPoolActivity(...args),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/pool-notifications.server.ts', () => ({
  queuePoolActivityNotifications: (...args: Array<unknown>) =>
    queuePoolActivityNotifications(...args),
}));

vi.mock('#app/utils/wishlist-claims.server.ts', () => ({
  syncPoolClaimInTx: (...args: Array<unknown>) => syncPoolClaimInTx(...args),
}));

vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));

import {
  addContributor,
  assignDeliverer,
  assignPurchaser,
  callVote,
  cancelPool,
  castVote,
  chooseIdea,
  closeVote,
  createPool,
  deleteIdea,
  deletePool,
  generatePoolInviteCode,
  getContributionBreakdown,
  isUserInPool,
  joinPoolViaInvite,
  markContributorPaid,
  markDelivered,
  markPurchased,
  proposeIdea,
  removeContributor,
  requireUserInPool,
  updateContribution,
  updateFinalPrice,
  updatePool,
} from './pool.server.ts';

beforeEach(() => {
  nanoid.mockReset().mockReturnValue('invite-123');
  captureMessage.mockReset();
  captureException.mockReset();
  queueNotification.mockReset();
  wishlistClaimFindUnique.mockReset().mockResolvedValue(null);
  giftIdeaCreate
    .mockReset()
    .mockResolvedValue({ id: 'idea-1', name: 'Speaker' });
  giftIdeaDelete.mockReset().mockResolvedValue(undefined);
  giftIdeaFindFirst.mockReset();
  ideaVoteUpsert.mockReset().mockResolvedValue(undefined);
  ideaVoteCount.mockReset().mockResolvedValue(0);
  logPoolActivity.mockReset().mockResolvedValue(undefined);
  poolContributorCreate.mockReset().mockResolvedValue({ id: 'contrib-1' });
  poolContributorDelete.mockReset().mockResolvedValue(undefined);
  poolContributorFindUnique.mockReset();
  poolContributorUpdate.mockReset().mockResolvedValue({ id: 'contrib-1' });
  poolCreate.mockReset().mockResolvedValue({
    id: 'pool-1',
    organizerId: 'organizer-1',
    title: 'Birthday Pool',
  });
  poolDelete.mockReset().mockResolvedValue(undefined);
  poolFindUnique.mockReset();
  poolUpdate.mockReset().mockResolvedValue(undefined);
  poolUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  queueLogEvent.mockReset().mockReturnValue({ eventId: 'event-123' });
  queuePoolActivityNotifications.mockReset();
  syncPoolClaimInTx
    .mockReset()
    .mockResolvedValue({ claimedItemId: null, conflictedItemId: null, released: [] });
});

describe('pool server utilities', () => {
  it('returns membership booleans from isUserInPool', async () => {
    poolContributorFindUnique.mockResolvedValueOnce({ id: 'contrib-1' });
    await expect(isUserInPool('user-1', 'pool-1')).resolves.toBe(true);

    poolContributorFindUnique.mockResolvedValueOnce(null);
    await expect(isUserInPool('user-1', 'pool-1')).resolves.toBe(false);
  });

  it('requireUserInPool throws when the user is not a contributor', async () => {
    poolContributorFindUnique.mockResolvedValue(null);

    await expect(requireUserInPool('user-1', 'pool-1')).rejects.toMatchObject({
      init: { status: 404 },
    });
  });

  it('createPool creates organizer and group contributors and logs creation', async () => {
    await createPool({
      decisionMode: 'ORGANIZER_PICKS',
      groupMemberDefaults: [
        { contributionCents: 3500, userId: 'organizer-1' },
        { contributionCents: 2500, userId: 'friend-1' },
        { contributionCents: 0, userId: 'friend-2' },
      ],
      organizerId: 'organizer-1',
      recipientName: 'Taylor',
      title: 'Birthday Pool',
    });

    expect(poolCreate).toHaveBeenCalledWith({
      data: {
        contributors: {
          create: [
            { contributionCents: 3500, userId: 'organizer-1' },
            { contributionCents: 2500, userId: 'friend-1' },
            { contributionCents: null, userId: 'friend-2' },
          ],
        },
        decisionMode: 'ORGANIZER_PICKS',
        eventDate: null,
        giftGroupId: null,
        occasionType: 'BIRTHDAY',
        organizerId: 'organizer-1',
        recipientName: 'Taylor',
        recipientUserId: null,
        title: 'Birthday Pool',
      },
      select: { id: true, organizerId: true, title: true },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'pool.created', {
      actorId: 'organizer-1',
      payload: { title: 'Birthday Pool' },
    });
  });

  it('createPool leaves the organizer contribution unset when the group default is zero', async () => {
    await createPool({
      groupMemberDefaults: [{ contributionCents: 0, userId: 'organizer-1' }],
      organizerId: 'organizer-1',
      title: 'Birthday Pool',
    });

    expect(poolCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contributors: {
            create: [{ contributionCents: null, userId: 'organizer-1' }],
          },
        }),
      }),
    );
  });

  it('createPool rejects a pool whose recipient is the organizer', async () => {
    await expect(
      createPool({
        organizerId: 'organizer-1',
        recipientUserId: 'organizer-1',
        title: 'Self Pool',
      }),
    ).rejects.toMatchObject({ init: { status: 400 } });

    expect(poolCreate).not.toHaveBeenCalled();
  });

  it('createPool filters the recipient out of groupMemberDefaults and reports it', async () => {
    await createPool({
      groupMemberDefaults: [
        { contributionCents: 2000, userId: 'recipient-1' },
        { contributionCents: 1000, userId: 'member-2' },
      ],
      organizerId: 'organizer-1',
      recipientUserId: 'recipient-1',
      title: 'Birthday Pool',
    });

    expect(poolCreate).toHaveBeenCalledWith({
      data: {
        contributors: {
          create: [
            { contributionCents: null, userId: 'organizer-1' },
            { contributionCents: 1000, userId: 'member-2' },
          ],
        },
        decisionMode: 'ORGANIZER_PICKS',
        eventDate: null,
        giftGroupId: null,
        occasionType: 'BIRTHDAY',
        organizerId: 'organizer-1',
        recipientName: null,
        recipientUserId: 'recipient-1',
        title: 'Birthday Pool',
      },
      select: { id: true, organizerId: true, title: true },
    });
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('updatePool updates the pool and logs changed fields', async () => {
    await updatePool('pool-1', 'user-1', { title: 'New Name' });

    expect(poolUpdate).toHaveBeenCalledWith({
      data: { title: 'New Name' },
      select: { id: true },
      where: { id: 'pool-1' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'pool.updated', {
      actorId: 'user-1',
      payload: { title: 'New Name' },
    });
  });

  it('adds contributors and logs contributor joins', async () => {
    await addContributor('pool-1', 'user-2', 3000);

    expect(poolContributorCreate).toHaveBeenCalledWith({
      data: { contributionCents: 3000, poolId: 'pool-1', userId: 'user-2' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith(
      'pool-1',
      'contributor.joined',
      {
        actorId: 'user-2',
        payload: { userId: 'user-2' },
      },
    );
  });

  it('removes contributors and logs the removal actor', async () => {
    await removeContributor('pool-1', 'user-2', 'manager-1');

    expect(poolContributorDelete).toHaveBeenCalledWith({
      where: { poolId_userId: { poolId: 'pool-1', userId: 'user-2' } },
    });
    expect(logPoolActivity).toHaveBeenCalledWith(
      'pool-1',
      'contributor.removed',
      {
        actorId: 'manager-1',
        payload: { userId: 'user-2' },
      },
    );
  });

  it('updates contributions and logs the contributor amount', async () => {
    poolFindUnique.mockResolvedValueOnce({ status: 'OPEN' });
    await updateContribution('pool-1', 'user-2', 4500);

    expect(poolContributorUpdate).toHaveBeenCalledWith({
      data: { contributionCents: 4500 },
      where: { poolId_userId: { poolId: 'pool-1', userId: 'user-2' } },
    });
    expect(logPoolActivity).toHaveBeenCalledWith(
      'pool-1',
      'contributor.updated',
      {
        actorId: 'user-2',
        payload: { contributionCents: 4500 },
      },
    );
  });

  it('marks contributor payment state', async () => {
    await markContributorPaid('pool-1', 'user-2', true);

    expect(poolContributorUpdate).toHaveBeenCalledWith({
      data: { hasPaid: true },
      where: { poolId_userId: { poolId: 'pool-1', userId: 'user-2' } },
    });
  });

  it('generates invite codes and persists them on the pool', async () => {
    await expect(generatePoolInviteCode('pool-1')).resolves.toBe('invite-123');

    expect(poolUpdate).toHaveBeenCalledWith({
      data: { inviteCode: 'invite-123' },
      where: { id: 'pool-1' },
    });
  });

  it('joinPoolViaInvite rejects missing invites', async () => {
    poolFindUnique.mockResolvedValue(null);

    await expect(
      joinPoolViaInvite('missing-code', 'user-1'),
    ).rejects.toMatchObject({
      init: { status: 404 },
    });
  });

  it('joinPoolViaInvite rejects inactive or recipient-owned pools', async () => {
    poolFindUnique.mockResolvedValueOnce({
      id: 'pool-1',
      recipientUserId: null,
      status: 'CANCELLED',
    });

    await expect(
      joinPoolViaInvite('invite-123', 'user-1'),
    ).rejects.toMatchObject({
      init: { status: 410 },
    });

    poolFindUnique.mockResolvedValueOnce({
      id: 'pool-1',
      recipientUserId: 'user-1',
      status: 'OPEN',
    });

    await expect(
      joinPoolViaInvite('invite-123', 'user-1'),
    ).rejects.toMatchObject({
      init: { status: 403 },
    });
  });

  it('joinPoolViaInvite returns early when the user already belongs to the pool', async () => {
    poolFindUnique.mockResolvedValue({
      id: 'pool-1',
      recipientUserId: null,
      status: 'OPEN',
    });
    poolContributorFindUnique.mockResolvedValue({ id: 'contrib-1' });

    await expect(joinPoolViaInvite('invite-123', 'user-1')).resolves.toEqual({
      poolId: 'pool-1',
    });

    expect(poolContributorCreate).not.toHaveBeenCalled();
  });

  it('joinPoolViaInvite adds the contributor when the invite is valid', async () => {
    poolFindUnique.mockResolvedValue({
      id: 'pool-1',
      recipientUserId: null,
      status: 'OPEN',
    });
    poolContributorFindUnique.mockResolvedValue(null);

    await expect(joinPoolViaInvite('invite-123', 'user-1')).resolves.toEqual({
      poolId: 'pool-1',
    });

    expect(poolContributorCreate).toHaveBeenCalledWith({
      data: { contributionCents: null, poolId: 'pool-1', userId: 'user-1' },
    });
  });

  it('proposes ideas and logs the new idea metadata', async () => {
    await proposeIdea({
      estimatedPriceCents: 1599,
      name: 'Speaker',
      poolId: 'pool-1',
      proposedById: 'user-1',
      url: 'https://example.com',
    });

    expect(giftIdeaCreate).toHaveBeenCalledWith({
      data: {
        description: null,
        estimatedPriceCents: 1599,
        name: 'Speaker',
        poolId: 'pool-1',
        proposedById: 'user-1',
        url: 'https://example.com',
        wishlistItemId: null,
        giftListItemId: null,
      },
      select: { id: true, name: true },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'idea.proposed', {
      actorId: 'user-1',
      payload: { ideaId: 'idea-1', name: 'Speaker' },
    });
  });

  it('deleteIdea rejects idea ids that do not belong to the pool', async () => {
    giftIdeaFindFirst.mockResolvedValue(null);

    await expect(
      deleteIdea('pool-1', 'idea-1', 'user-1'),
    ).rejects.toMatchObject({
      init: { status: 404 },
    });

    expect(giftIdeaFindFirst).toHaveBeenCalledWith({
      select: { name: true, poolId: true },
      where: { id: 'idea-1', poolId: 'pool-1' },
    });
    expect(giftIdeaDelete).not.toHaveBeenCalled();
    expect(logPoolActivity).not.toHaveBeenCalled();
  });

  it('deleteIdea deletes and logs same-pool ideas', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      name: 'Speaker',
      poolId: 'pool-1',
    });
    poolFindUnique.mockResolvedValueOnce({
      status: 'OPEN',
      chosenIdeaId: null,
    });

    await deleteIdea('pool-1', 'idea-1', 'user-1');

    expect(giftIdeaDelete).toHaveBeenCalledWith({
      where: { id: 'idea-1' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'idea.deleted', {
      actorId: 'user-1',
      payload: { ideaId: 'idea-1', name: 'Speaker' },
    });
  });

  it('callVote rejects pools that are not open', async () => {
    poolUpdateMany.mockResolvedValue({ count: 0 });

    await expect(callVote('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 400 },
    });
    expect(logPoolActivity).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(queuePoolActivityNotifications).not.toHaveBeenCalled();
  });

  it('callVote transitions open pools to voting', async () => {
    await callVote('pool-1', 'user-1');

    expect(poolUpdateMany).toHaveBeenCalledWith({
      data: { status: 'VOTING' },
      where: { id: 'pool-1', status: 'OPEN' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'vote.called', {
      actorId: 'user-1',
    });
    expect(queuePoolActivityNotifications).toHaveBeenCalledWith({
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      poolId: 'pool-1',
      actorUserId: 'user-1',
      occurrenceId: 'event-123',
    });
  });

  it('castVote rejects ideas from another pool before writing', async () => {
    giftIdeaFindFirst.mockResolvedValue(null);

    await expect(castVote('pool-1', 'idea-2', 'user-1')).rejects.toMatchObject({
      init: { status: 404 },
    });

    expect(ideaVoteUpsert).not.toHaveBeenCalled();
    expect(logPoolActivity).not.toHaveBeenCalled();
  });

  it('castVote upserts votes for same-pool ideas', async () => {
    giftIdeaFindFirst.mockResolvedValue({ id: 'idea-1' });

    await castVote('pool-1', 'idea-1', 'user-1');

    expect(ideaVoteUpsert).toHaveBeenCalledWith({
      create: { ideaId: 'idea-1', poolId: 'pool-1', voterId: 'user-1' },
      update: { ideaId: 'idea-1' },
      where: { poolId_voterId: { poolId: 'pool-1', voterId: 'user-1' } },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'vote.cast', {
      actorId: 'user-1',
      payload: { ideaId: 'idea-1' },
    });
  });

  it('closeVote rejects pools that are not currently voting', async () => {
    poolFindUnique.mockResolvedValue({ status: 'OPEN' });

    await expect(closeVote('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 400 },
    });

    expect(poolUpdate).not.toHaveBeenCalled();
    expect(logPoolActivity).not.toHaveBeenCalled();
  });

  it('closeVote reopens pools that are currently voting', async () => {
    poolFindUnique.mockResolvedValue({ status: 'VOTING' });

    await closeVote('pool-1', 'user-1');

    expect(poolUpdate).toHaveBeenCalledWith({
      data: { status: 'OPEN' },
      where: { id: 'pool-1' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'vote.closed', {
      actorId: 'user-1',
    });
  });

  it('chooseIdea rejects ideas from another pool', async () => {
    giftIdeaFindFirst.mockResolvedValue(null);

    await expect(
      chooseIdea('pool-1', 'idea-2', 'user-1'),
    ).rejects.toMatchObject({
      init: { status: 404 },
    });

    expect(poolUpdateMany).not.toHaveBeenCalled();
  });

  it('chooseIdea falls back to the estimated idea price when none is provided', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
    });

    await chooseIdea('pool-1', 'idea-1', 'user-1');

    expect(poolUpdateMany).toHaveBeenCalledWith({
      data: {
        chosenIdeaId: 'idea-1',
        finalPriceCents: 8000,
        status: 'DECIDED',
        decidedAt: expect.any(Date),
      },
      where: {
        id: 'pool-1',
        status: { in: ['OPEN', 'VOTING', 'DECIDED'] },
        OR: [
          { status: { not: 'DECIDED' } },
          { chosenIdeaId: null },
          { chosenIdeaId: { not: 'idea-1' } },
        ],
      },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'idea.chosen', {
      actorId: 'user-1',
      payload: { finalPriceCents: 8000, ideaId: 'idea-1', name: 'Speaker' },
    });
    expect(syncPoolClaimInTx).toHaveBeenCalledWith(expect.anything(), 'pool-1');
    expect(queuePoolActivityNotifications).toHaveBeenCalledWith({
      type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
      poolId: 'pool-1',
      actorUserId: 'user-1',
      occurrenceId: 'event-123',
    });
  });

  it('threads conflictedItemId back so a decision-time conflict is not silent', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
      pool: { title: 'Taylor birthday' },
    });
    syncPoolClaimInTx.mockResolvedValueOnce({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
      released: [],
    });

    await expect(chooseIdea('pool-1', 'idea-1', 'user-1')).resolves.toEqual({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
    });
  });

  it('asks the claim holder to keep or release when the holder is a person', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
      pool: { title: 'Taylor birthday' },
    });
    syncPoolClaimInTx.mockResolvedValueOnce({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
      released: [],
    });
    wishlistClaimFindUnique.mockResolvedValueOnce({
      claimedByUserId: 'holder-1',
      wishlistItem: {
        title: 'Noise-cancelling headphones',
        owner: { name: 'Taylor', username: 'taylor' },
      },
    });

    await chooseIdea('pool-1', 'idea-1', 'user-1');

    expect(wishlistClaimFindUnique).toHaveBeenCalledWith({
      where: { wishlistItemId: 'wish-9' },
      select: expect.anything(),
    });
    await vi.waitFor(() => {
      expect(queueNotification).toHaveBeenCalledWith({
        userId: 'holder-1',
        type: NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT,
        payload: {
          wishlistItemId: 'wish-9',
          itemTitle: 'Noise-cancelling headphones',
          recipientName: 'Taylor',
          recipientUsername: 'taylor',
          poolId: 'pool-1',
          poolTitle: 'Taylor birthday',
        },
        sourceIdentifier: 'claim-conflict:pool-1:wish-9',
      });
    });
  });

  it('falls back to the username when the wishlist owner has no display name', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
      pool: { title: 'Taylor birthday' },
    });
    syncPoolClaimInTx.mockResolvedValueOnce({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
      released: [],
    });
    wishlistClaimFindUnique.mockResolvedValueOnce({
      claimedByUserId: 'holder-1',
      wishlistItem: {
        title: 'Noise-cancelling headphones',
        owner: { name: null, username: 'taylor' },
      },
    });

    await chooseIdea('pool-1', 'idea-1', 'user-1');

    await vi.waitFor(() => {
      expect(queueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ recipientName: 'taylor' }),
        }),
      );
    });
  });

  it('does not queue a notification when the conflicting claim is held by another pool', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
      pool: { title: 'Taylor birthday' },
    });
    syncPoolClaimInTx.mockResolvedValueOnce({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
      released: [],
    });
    // A pool-held claim: `claimedByUserId` is null, `poolId` is set — nobody
    // to ask.
    wishlistClaimFindUnique.mockResolvedValueOnce({
      claimedByUserId: null,
      wishlistItem: {
        title: 'Noise-cancelling headphones',
        owner: { name: 'Taylor', username: 'taylor' },
      },
    });

    await chooseIdea('pool-1', 'idea-1', 'user-1');
    // Flush the fire-and-forget notification microtask before asserting a
    // negative, or this passes trivially before the read even resolves.
    await vi.waitFor(() => {
      expect(wishlistClaimFindUnique).toHaveBeenCalled();
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(queueNotification).not.toHaveBeenCalled();
  });

  it('sends a conflict-notification failure to Sentry without throwing', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
      pool: { title: 'Taylor birthday' },
    });
    syncPoolClaimInTx.mockResolvedValueOnce({
      claimedItemId: null,
      conflictedItemId: 'wish-9',
      released: [],
    });
    const boom = new Error('read failed');
    wishlistClaimFindUnique.mockRejectedValueOnce(boom);

    await expect(
      chooseIdea('pool-1', 'idea-1', 'user-1'),
    ).resolves.toMatchObject({ conflictedItemId: 'wish-9' });

    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(boom);
    });
    expect(queueNotification).not.toHaveBeenCalled();
  });

  it('propagates a claim-sync failure and skips every post-decision side effect', async () => {
    // The decision (`updateMany`) and the claim sync now commit in the same
    // `$transaction` — a rejection from the sync must abort the whole thing,
    // so nothing downstream of the transaction (activity log, analytics,
    // notification fanout) ever fires for a decision that didn't land. The
    // real-DB rollback of the pool row itself is covered in
    // wishlist-claims.server.test.ts, which exercises the actual Prisma
    // transaction rather than this mocked client.
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
    });
    syncPoolClaimInTx.mockRejectedValueOnce(new Error('claim sync boom'));

    await expect(chooseIdea('pool-1', 'idea-1', 'user-1')).rejects.toThrow(
      'claim sync boom',
    );

    expect(logPoolActivity).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(queuePoolActivityNotifications).not.toHaveBeenCalled();
  });

  it('does not repeat decision side effects when the gift is already chosen', async () => {
    giftIdeaFindFirst.mockResolvedValue({
      estimatedPriceCents: 8000,
      name: 'Speaker',
    });
    poolUpdateMany.mockResolvedValue({ count: 0 });

    await chooseIdea('pool-1', 'idea-1', 'user-1');

    expect(logPoolActivity).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(queuePoolActivityNotifications).not.toHaveBeenCalled();
  });

  it('updates final price and logs the new amount', async () => {
    await updateFinalPrice('pool-1', 2500, 'user-1');

    expect(poolUpdate).toHaveBeenCalledWith({
      data: { finalPriceCents: 2500 },
      where: { id: 'pool-1' },
    });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'pool.updated', {
      actorId: 'user-1',
      payload: { finalPriceCents: 2500 },
    });
  });

  it('assigns purchaser and deliverer roles with activity logs', async () => {
    queueLogEvent
      .mockReturnValueOnce({ eventId: 'purchaser-event' })
      .mockReturnValueOnce({ eventId: 'deliverer-event' });
    await assignPurchaser('pool-1', 'user-2', 'manager-1');
    await assignDeliverer('pool-1', 'user-3', 'manager-1');

    expect(poolUpdateMany).toHaveBeenNthCalledWith(1, {
      data: { purchaserId: 'user-2' },
      where: {
        id: 'pool-1',
        OR: [{ purchaserId: null }, { purchaserId: { not: 'user-2' } }],
      },
    });
    expect(poolUpdateMany).toHaveBeenNthCalledWith(2, {
      data: { delivererId: 'user-3' },
      where: {
        id: 'pool-1',
        OR: [{ delivererId: null }, { delivererId: { not: 'user-3' } }],
      },
    });
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      1,
      'pool-1',
      'purchaser.assigned',
      {
        actorId: 'manager-1',
        payload: { userId: 'user-2' },
      },
    );
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      2,
      'pool-1',
      'deliverer.assigned',
      {
        actorId: 'manager-1',
        payload: { userId: 'user-3' },
      },
    );
    expect(queuePoolActivityNotifications).toHaveBeenNthCalledWith(1, {
      type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
      poolId: 'pool-1',
      actorUserId: 'manager-1',
      assigneeUserId: 'user-2',
      occurrenceId: 'purchaser-event',
    });
    expect(queuePoolActivityNotifications).toHaveBeenNthCalledWith(2, {
      type: NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
      poolId: 'pool-1',
      actorUserId: 'manager-1',
      assigneeUserId: 'user-3',
      occurrenceId: 'deliverer-event',
    });
  });

  it('does not repeat assignment or cancellation side effects for unchanged state', async () => {
    poolUpdateMany.mockResolvedValue({ count: 0 });

    await assignPurchaser('pool-1', 'user-2', 'manager-1');
    await assignDeliverer('pool-1', 'user-3', 'manager-1');
    await cancelPool('pool-1', 'manager-1');

    expect(poolUpdateMany).toHaveBeenCalledTimes(3);
    expect(logPoolActivity).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(queuePoolActivityNotifications).not.toHaveBeenCalled();
  });

  it('marks purchased, delivered, cancelled, and deleted pools', async () => {
    // deletePool now guards on an empty "mistake" pool — seed the empty state so
    // the guard passes and the hard delete proceeds.
    poolFindUnique.mockResolvedValue({
      organizerId: 'user-1',
      _count: { ideas: 0 },
      contributors: [{ userId: 'user-1' }],
    });

    await markPurchased('pool-1', 'user-1');
    await markDelivered('pool-1', 'user-1');
    await cancelPool('pool-1', 'user-1');
    await deletePool('pool-1', 'user-1');

    // markPurchased/markDelivered are now forward-only conditional updateMany.
    expect(poolUpdateMany).toHaveBeenNthCalledWith(1, {
      data: { status: 'PURCHASED' },
      where: { id: 'pool-1', status: { in: ['DECIDED', 'PURCHASED'] } },
    });
    expect(poolUpdateMany).toHaveBeenNthCalledWith(2, {
      data: { status: 'DELIVERED' },
      where: { id: 'pool-1', status: { in: ['PURCHASED', 'DELIVERED'] } },
    });
    expect(poolUpdateMany).toHaveBeenCalledWith({
      data: { status: 'CANCELLED' },
      where: { id: 'pool-1', status: { not: 'CANCELLED' } },
    });
    expect(poolDelete).toHaveBeenCalledWith({ where: { id: 'pool-1' } });
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      1,
      'pool-1',
      'pool.purchased',
      {
        actorId: 'user-1',
      },
    );
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      2,
      'pool-1',
      'pool.delivered',
      {
        actorId: 'user-1',
      },
    );
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      3,
      'pool-1',
      'pool.cancelled',
      {
        actorId: 'user-1',
      },
    );
    expect(logPoolActivity).toHaveBeenNthCalledWith(
      4,
      'pool-1',
      'pool.deleted',
      {
        actorId: 'user-1',
      },
    );
    expect(queuePoolActivityNotifications).toHaveBeenCalledWith({
      type: NOTIFICATION_TYPES.POOL_CANCELLED,
      poolId: 'pool-1',
      actorUserId: 'user-1',
      occurrenceId: 'event-123',
    });
  });

  it('deletePool rejects a pool that has gift ideas', async () => {
    poolFindUnique.mockResolvedValue({
      organizerId: 'user-1',
      _count: { ideas: 1 },
      contributors: [{ userId: 'user-1' }],
    });

    await expect(deletePool('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 409 },
    });
    expect(poolDelete).not.toHaveBeenCalled();
    expect(logPoolActivity).not.toHaveBeenCalled();
  });

  it('deletePool rejects a pool with contributors beyond the organizer', async () => {
    poolFindUnique.mockResolvedValue({
      organizerId: 'user-1',
      _count: { ideas: 0 },
      contributors: [{ userId: 'user-1' }, { userId: 'user-2' }],
    });

    await expect(deletePool('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 409 },
    });
    expect(poolDelete).not.toHaveBeenCalled();
    expect(logPoolActivity).not.toHaveBeenCalled();
  });

  it('deletePool hard-deletes an empty "mistake" pool', async () => {
    poolFindUnique.mockResolvedValue({
      organizerId: 'user-1',
      _count: { ideas: 0 },
      contributors: [{ userId: 'user-1' }],
    });

    await deletePool('pool-1', 'user-1');

    expect(poolDelete).toHaveBeenCalledWith({ where: { id: 'pool-1' } });
    expect(logPoolActivity).toHaveBeenCalledWith('pool-1', 'pool.deleted', {
      actorId: 'user-1',
    });
  });

  it('deletePool rejects when the pool no longer exists', async () => {
    poolFindUnique.mockResolvedValue(null);

    await expect(deletePool('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 409 },
    });
    expect(poolDelete).not.toHaveBeenCalled();
  });

  it('cancelPool preserves gift ideas (no destructive delete)', async () => {
    // Cancellation only flips status — GiftIdea rows are preserved for future
    // queries (distinct from display: the person surface reads only completed
    // pools, so a cancelled pool's ideas are preserved, not shown).
    await cancelPool('pool-1', 'user-1');

    expect(poolUpdateMany).toHaveBeenCalledWith({
      data: { status: 'CANCELLED' },
      where: { id: 'pool-1', status: { not: 'CANCELLED' } },
    });
    expect(poolDelete).not.toHaveBeenCalled();
    expect(giftIdeaDelete).not.toHaveBeenCalled();
    expect(syncPoolClaimInTx).toHaveBeenCalledWith(expect.anything(), 'pool-1');
  });

  it('rolls back the CANCELLED transition when the claim sync fails mid-transaction', async () => {
    // Regression for the P1 finding: cancelPool used to call syncPoolClaim
    // (opening its own separate transaction) *after* the status update had
    // already committed, and swallowed sync failures to Sentry — so a failed
    // sync left a cancelled pool still holding its claim, permanently (the
    // early return above makes a retry a no-op once status already reads
    // CANCELLED). Status update and claim sync now commit in the same
    // `$transaction`, so a rejection from the sync must abort the whole
    // thing — nothing downstream (activity log, analytics, notification
    // fanout) fires for a cancellation that didn't land. The real-DB
    // rollback of the pool row itself is covered in
    // wishlist-claims.server.test.ts, which exercises the actual Prisma
    // transaction rather than this mocked client.
    syncPoolClaimInTx.mockRejectedValueOnce(new Error('claim sync boom'));

    await expect(cancelPool('pool-1', 'user-1')).rejects.toThrow('claim sync boom');

    expect(logPoolActivity).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(queuePoolActivityNotifications).not.toHaveBeenCalled();
  });

  it('getContributionBreakdown returns null without a confirmed final price', async () => {
    poolFindUnique.mockResolvedValue({
      contributors: [],
      finalPriceCents: null,
      purchaserId: null,
    });

    await expect(getContributionBreakdown('pool-1')).resolves.toBeNull();
  });

  it('getContributionBreakdown excludes the purchaser and annotates results', async () => {
    poolFindUnique.mockResolvedValue({
      contributors: [
        {
          contributionCents: 2000,
          hasPaid: true,
          user: {
            id: 'user-1',
            image: { id: 'image-1', altText: 'Alex profile photo' },
            name: 'Alex',
            username: 'alex',
          },
          userId: 'user-1',
        },
        {
          contributionCents: 2000,
          hasPaid: false,
          user: {
            id: 'user-2',
            image: { id: 'image-2', altText: null },
            name: 'Blake',
            username: 'blake',
          },
          userId: 'user-2',
        },
        {
          contributionCents: 2000,
          hasPaid: false,
          user: {
            id: 'user-3',
            image: null,
            name: 'Casey',
            username: 'casey',
          },
          userId: 'user-3',
        },
      ],
      finalPriceCents: 3000,
      purchaserId: 'user-3',
    });

    await expect(getContributionBreakdown('pool-1')).resolves.toEqual({
      breakdown: [
        {
          hasPaid: true,
          owedCents: 1500,
          user: {
            id: 'user-1',
            image: { id: 'image-1', altText: 'Alex profile photo' },
            name: 'Alex',
            username: 'alex',
          },
          userId: 'user-1',
        },
        {
          hasPaid: false,
          owedCents: 1500,
          user: {
            id: 'user-2',
            image: { id: 'image-2', altText: null },
            name: 'Blake',
            username: 'blake',
          },
          userId: 'user-2',
        },
      ],
      finalPriceCents: 3000,
      purchaserId: 'user-3',
      shortfallCents: 0,
      surplusCents: 1000,
      totalAvailableCents: 4000,
    });
    expect(poolFindUnique).toHaveBeenCalledWith({
      where: { id: 'pool-1' },
      select: {
        finalPriceCents: true,
        purchaserId: true,
        contributors: {
          select: {
            userId: true,
            contributionCents: true,
            hasPaid: true,
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                image: { select: { id: true, altText: true } },
              },
            },
          },
        },
      },
    });
  });

  it('addContributor refuses to add the pool recipient (finding #6)', async () => {
    poolFindUnique.mockResolvedValueOnce({ recipientUserId: 'recipient-1' });

    await expect(addContributor('pool-1', 'recipient-1')).rejects.toMatchObject(
      { init: { status: 400 } },
    );
    expect(poolContributorCreate).not.toHaveBeenCalled();
  });

  it('updateContribution is locked once the pool is DECIDED (finding #12)', async () => {
    poolFindUnique.mockResolvedValueOnce({ status: 'DECIDED' });

    await expect(
      updateContribution('pool-1', 'user-2', 0),
    ).rejects.toMatchObject({ init: { status: 409 } });
    expect(poolContributorUpdate).not.toHaveBeenCalled();
  });

  it('markPurchased refuses to run from a non-DECIDED status (finding #9)', async () => {
    poolUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(markPurchased('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 409 },
    });
  });

  it('deleteIdea refuses to delete the chosen idea (finding #14)', async () => {
    giftIdeaFindFirst.mockResolvedValue({ name: 'Speaker', poolId: 'pool-1' });
    poolFindUnique.mockResolvedValueOnce({
      status: 'DECIDED',
      chosenIdeaId: 'idea-1',
    });

    await expect(
      deleteIdea('pool-1', 'idea-1', 'user-1'),
    ).rejects.toMatchObject({ init: { status: 409 } });
    expect(giftIdeaDelete).not.toHaveBeenCalled();
  });

  it('deleteIdea refuses to delete an idea with votes during VOTING (finding #14)', async () => {
    giftIdeaFindFirst.mockResolvedValue({ name: 'Speaker', poolId: 'pool-1' });
    poolFindUnique.mockResolvedValueOnce({
      status: 'VOTING',
      chosenIdeaId: null,
    });
    ideaVoteCount.mockResolvedValueOnce(3);

    await expect(
      deleteIdea('pool-1', 'idea-1', 'user-1'),
    ).rejects.toMatchObject({ init: { status: 409 } });
    expect(giftIdeaDelete).not.toHaveBeenCalled();
  });

  it('markDelivered refuses to run from a non-PURCHASED status (finding #9)', async () => {
    poolUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(markDelivered('pool-1', 'user-1')).rejects.toMatchObject({
      init: { status: 409 },
    });
  });
});
