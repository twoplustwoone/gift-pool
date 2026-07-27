/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userFindFirst = vi.fn();
const wishlistPublicShareFindUnique = vi.fn();
const getRelationshipDetails = vi.fn();
const queueLogEvent = vi.fn();
const cleanupWishlistClaimsForOwner = vi.fn();

vi.mock('./db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => userFindFirst(...args),
    },
    wishlistPublicShare: {
      findUnique: (...args: Array<unknown>) =>
        wishlistPublicShareFindUnique(...args),
    },
  },
}));

const isFriendOfFriend = vi.fn();

vi.mock('./friends.server.ts', () => ({
  getRelationshipDetails: (...args: Array<unknown>) =>
    getRelationshipDetails(...args),
  isFriendOfFriend: (...args: Array<unknown>) => isFriendOfFriend(...args),
}));

vi.mock('./analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('./wishlist.server.ts', () => ({
  cleanupWishlistClaimsForOwner: (...args: Array<unknown>) =>
    cleanupWishlistClaimsForOwner(...args),
}));

import {
  loadFriendWishlistPageData,
  loadOwnWishlistPageData,
} from './wishlist-page.server.ts';

function createOwnerSummary(overrides?: Partial<{
  id: string;
  image: { id: string } | null;
  name: string | null;
  username: string;
  wishlistVisibility: string;
}>) {
  return {
    id: 'owner-1',
    image: { id: 'image-1' },
    name: 'Alex',
    username: 'alex',
    ...overrides,
  };
}

// Creates the subset of the owner summary that the loader echoes back in
// the `user` field (wishlistVisibility is stripped out before returning).
function createExpectedUser(overrides?: Partial<{
  id: string;
  image: { id: string } | null;
  name: string | null;
  username: string;
}>) {
  return {
    id: 'owner-1',
    image: { id: 'image-1' },
    name: 'Alex',
    username: 'alex',
    ...overrides,
  };
}

function createWishlistDetails() {
  return {
    wishlistCategories: [
      { id: 'category-1', name: 'Books', order: 0 },
      { id: 'category-2', name: 'Games', order: 1 },
    ],
    wishlistItems: [
      {
        categoryId: 'category-1',
        hasImage: false,
        id: 'item-1',
        imageSource: null,
        note: 'Hardcover',
        ownerId: 'owner-1',
        claim: { claimedByUserId: 'viewer-1' },
        sortOrder: 0,
        status: 'ACTIVE',
        title: 'Dune',
        type: 'text',
        updatedAt: new Date('2025-01-02T03:04:05.000Z'),
        url: null,
      },
      {
        categoryId: null,
        hasImage: true,
        id: 'item-2',
        imageSource: 'UPLOAD',
        note: null,
        ownerId: 'owner-1',
        claim: null,
        sortOrder: 1,
        status: 'PAUSED',
        title: 'Chess set',
        type: 'link',
        updatedAt: new Date('2025-01-03T03:04:05.000Z'),
        url: 'https://example.com/chess',
      },
    ],
  };
}

beforeEach(() => {
  userFindFirst.mockReset();
  wishlistPublicShareFindUnique.mockReset();
  wishlistPublicShareFindUnique.mockResolvedValue(null);
  getRelationshipDetails.mockReset();
  isFriendOfFriend.mockReset();
  queueLogEvent.mockReset();
  cleanupWishlistClaimsForOwner.mockReset();
});

describe('loadFriendWishlistPageData', () => {
  it('redirects self views before loading relationship or wishlist details', async () => {
    userFindFirst.mockResolvedValueOnce(createOwnerSummary({ id: 'viewer-1' }));

    await expect(
      loadFriendWishlistPageData({
        includeAnalytics: false,
        username: 'alex',
        viewerId: 'viewer-1',
      }),
    ).resolves.toEqual({ redirectTo: '/wishlist' });

    expect(userFindFirst).toHaveBeenCalledTimes(1);
    expect(userFindFirst.mock.calls[0]![0]).toMatchObject({
      select: expect.not.objectContaining({
        wishlistCategories: expect.anything(),
        wishlistItems: expect.anything(),
      }),
      where: { username: 'alex' },
    });
    expect(getRelationshipDetails).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(cleanupWishlistClaimsForOwner).not.toHaveBeenCalled();
  });

  it('returns the access gate without loading wishlist details for non-friends', async () => {
    userFindFirst.mockResolvedValueOnce(createOwnerSummary());
    getRelationshipDetails.mockResolvedValueOnce({ state: 'NONE' });

    await expect(
      loadFriendWishlistPageData({
        includeAnalytics: false,
        username: 'alex',
        viewerId: 'viewer-1',
      }),
    ).resolves.toEqual({
      analytics: {
        requestId: null,
        viewEventId: null,
      },
      canViewWishlist: false,
      relationship: {
        friendshipId: null,
        incomingRequestId: null,
        outgoingRequestId: null,
        state: 'NONE',
      },
      user: createExpectedUser(),
    });

    expect(userFindFirst).toHaveBeenCalledTimes(1);
    expect(getRelationshipDetails).toHaveBeenCalledWith('viewer-1', 'owner-1');
    expect(userFindFirst.mock.calls[0]![0]).toMatchObject({
      select: expect.not.objectContaining({
        wishlistCategories: expect.anything(),
        wishlistItems: expect.anything(),
      }),
    });
    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(cleanupWishlistClaimsForOwner).not.toHaveBeenCalled();
  });

  it('loads wishlist details only after a friend access check and skips analytics when disabled', async () => {
    userFindFirst
      .mockResolvedValueOnce(createOwnerSummary())
      .mockResolvedValueOnce(createWishlistDetails());
    getRelationshipDetails.mockResolvedValueOnce({
      friendship: { id: 'friendship-1' },
      state: 'FRIENDS',
    });

    await expect(
      loadFriendWishlistPageData({
        includeAnalytics: false,
        requestId: 'req-1',
        sessionId: 'session-1',
        username: 'alex',
        viewerId: 'viewer-1',
      }),
    ).resolves.toEqual({
      analytics: {
        requestId: null,
        viewEventId: null,
      },
      canViewWishlist: true,
      relationship: {
        friendshipId: 'friendship-1',
        incomingRequestId: null,
        outgoingRequestId: null,
        state: 'FRIENDS',
      },
      user: {
        ...createExpectedUser(),
        wishlistCategories: [
          { id: 'category-1', name: 'Books', order: 0 },
          { id: 'category-2', name: 'Games', order: 1 },
        ],
        wishlistItems: [
          {
            categoryId: 'category-1',
            hasImage: false,
            id: 'item-1',
            imageSource: null,
            note: 'Hardcover',
            ownerId: 'owner-1',
            claim: { claimedByUserId: 'viewer-1' },
            sortOrder: 0,
            status: 'ACTIVE',
            title: 'Dune',
            type: 'text',
            updatedAt: new Date('2025-01-02T03:04:05.000Z'),
            url: null,
          },
          {
            categoryId: null,
            hasImage: true,
            id: 'item-2',
            imageSource: 'UPLOAD',
            note: null,
            ownerId: 'owner-1',
            claim: null,
            sortOrder: 1,
            status: 'ARCHIVED',
            title: 'Chess set',
            type: 'link',
            updatedAt: new Date('2025-01-03T03:04:05.000Z'),
            url: 'https://example.com/chess',
          },
        ],
      },
    });

    expect(userFindFirst).toHaveBeenCalledTimes(2);
    expect(userFindFirst.mock.calls[0]![0]).toMatchObject({
      select: expect.not.objectContaining({
        wishlistCategories: expect.anything(),
        wishlistItems: expect.anything(),
      }),
      where: { username: 'alex' },
    });
    expect(userFindFirst.mock.calls[1]![0]).toMatchObject({
      select: expect.objectContaining({
        wishlistCategories: expect.anything(),
        wishlistItems: expect.anything(),
      }),
      where: { id: 'owner-1' },
    });
    expect(cleanupWishlistClaimsForOwner).toHaveBeenCalledWith('owner-1');
    expect(queueLogEvent).not.toHaveBeenCalled();
  });

  it('grants access for wishlistVisibility EVERYONE and loads wishlist details', async () => {
    userFindFirst
      .mockResolvedValueOnce(
        createOwnerSummary({ wishlistVisibility: 'EVERYONE' }),
      )
      .mockResolvedValueOnce(createWishlistDetails());
    getRelationshipDetails.mockResolvedValueOnce({ state: 'NONE' });

    const result = await loadFriendWishlistPageData({
      includeAnalytics: false,
      username: 'alex',
      viewerId: 'viewer-1',
    });

    expect(result).toMatchObject({ canViewWishlist: true });
    expect(isFriendOfFriend).not.toHaveBeenCalled();
  });

  it('grants access for wishlistVisibility FRIENDS_OF_FRIENDS when viewer is a direct friend', async () => {
    userFindFirst
      .mockResolvedValueOnce(
        createOwnerSummary({ wishlistVisibility: 'FRIENDS_OF_FRIENDS' }),
      )
      .mockResolvedValueOnce(createWishlistDetails());
    getRelationshipDetails.mockResolvedValueOnce({
      friendship: { id: 'friendship-1' },
      state: 'FRIENDS',
    });

    const result = await loadFriendWishlistPageData({
      includeAnalytics: false,
      username: 'alex',
      viewerId: 'viewer-1',
    });

    expect(result).toMatchObject({ canViewWishlist: true });
    // Direct friend — should short-circuit before calling isFriendOfFriend
    expect(isFriendOfFriend).not.toHaveBeenCalled();
  });

  it('grants access for wishlistVisibility FRIENDS_OF_FRIENDS when viewer shares a mutual friend', async () => {
    userFindFirst
      .mockResolvedValueOnce(
        createOwnerSummary({ wishlistVisibility: 'FRIENDS_OF_FRIENDS' }),
      )
      .mockResolvedValueOnce(createWishlistDetails());
    getRelationshipDetails.mockResolvedValueOnce({ state: 'NONE' });
    isFriendOfFriend.mockResolvedValueOnce(true);

    const result = await loadFriendWishlistPageData({
      includeAnalytics: false,
      username: 'alex',
      viewerId: 'viewer-1',
    });

    expect(result).toMatchObject({ canViewWishlist: true });
    expect(isFriendOfFriend).toHaveBeenCalledWith('viewer-1', 'owner-1');
  });

  it('denies access for wishlistVisibility FRIENDS_OF_FRIENDS when no mutual friend exists', async () => {
    userFindFirst.mockResolvedValueOnce(
      createOwnerSummary({ wishlistVisibility: 'FRIENDS_OF_FRIENDS' }),
    );
    getRelationshipDetails.mockResolvedValueOnce({ state: 'NONE' });
    isFriendOfFriend.mockResolvedValueOnce(false);

    const result = await loadFriendWishlistPageData({
      includeAnalytics: false,
      username: 'alex',
      viewerId: 'viewer-1',
    });

    expect(result).toMatchObject({ canViewWishlist: false });
    expect(isFriendOfFriend).toHaveBeenCalledWith('viewer-1', 'owner-1');
  });

  it('logs a server analytics event for friend views when enabled', async () => {
    userFindFirst
      .mockResolvedValueOnce(createOwnerSummary())
      .mockResolvedValueOnce(createWishlistDetails());
    getRelationshipDetails.mockResolvedValueOnce({
      friendship: { id: 'friendship-1' },
      incoming: null,
      outgoing: null,
      state: 'FRIENDS',
    });
    queueLogEvent.mockReturnValueOnce({ eventId: 'event-1' });

    await expect(
      loadFriendWishlistPageData({
        includeAnalytics: true,
        requestId: 'req-1',
        sessionId: 'session-1',
        username: 'alex',
        viewerId: 'viewer-1',
      }),
    ).resolves.toMatchObject({
      analytics: {
        requestId: 'req-1',
        viewEventId: 'event-1',
      },
      canViewWishlist: true,
    });

    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'wishlist_viewed',
      properties: {
        itemCount: 2,
        viewerId: 'viewer-1',
        wishlistOwnerId: 'owner-1',
      },
      requestId: 'req-1',
      sessionId: 'session-1',
      source: 'server',
      userId: 'viewer-1',
    });
  });
});

describe('loadOwnWishlistPageData', () => {
  function createOwnUserRow() {
    return {
      id: 'owner-1',
      image: { id: 'image-1' },
      name: 'Alex',
      username: 'alex',
      wishlistCategories: [
        { id: 'category-1', name: 'Books', order: 0 },
      ],
      wishlistItems: [
        {
          categoryId: 'category-1',
          hasImage: false,
          id: 'item-1',
          imageSource: null,
          note: null,
          ownerId: 'owner-1',
          sortOrder: 0,
          status: 'ACTIVE',
          title: 'Nintendo Switch',
          type: 'text',
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
          url: null,
        },
      ],
    };
  }

  it('schedules a wishlist_viewed event and returns its eventId for own views', async () => {
    userFindFirst.mockResolvedValueOnce(createOwnUserRow());
    queueLogEvent.mockReturnValueOnce({ eventId: 'queued-own-1' });

    const result = await loadOwnWishlistPageData({
      includeAnalytics: true,
      origin: 'https://giftpool.app',
      requestId: 'req-own',
      sessionId: 'session-own',
      userId: 'owner-1',
    });

    expect(result.analytics).toEqual({
      requestId: 'req-own',
      viewEventId: 'queued-own-1',
    });
    expect(result.publicShare).toBeNull();
    expect(result.origin).toBe('https://giftpool.app');
    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'wishlist_viewed',
      userId: 'owner-1',
      source: 'server',
      requestId: 'req-own',
      sessionId: 'session-own',
      properties: {
        wishlistOwnerId: 'owner-1',
        itemCount: 1,
      },
    });
    expect(cleanupWishlistClaimsForOwner).toHaveBeenCalledWith('owner-1');
  });

  it('skips the analytics event when includeAnalytics is false', async () => {
    userFindFirst.mockResolvedValueOnce(createOwnUserRow());

    const result = await loadOwnWishlistPageData({
      includeAnalytics: false,
      origin: 'https://giftpool.app',
      userId: 'owner-1',
    });

    expect(queueLogEvent).not.toHaveBeenCalled();
    expect(result.analytics.viewEventId).toBeNull();
    expect(result.analytics.requestId).toBeNull();
  });
});
