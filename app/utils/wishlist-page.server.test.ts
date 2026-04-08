/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userFindFirst = vi.fn();
const getRelationshipDetails = vi.fn();
const logEvent = vi.fn();
const cleanupWishlistPurchasesForOwner = vi.fn();

vi.mock('./db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => userFindFirst(...args),
    },
  },
}));

vi.mock('./friends.server.ts', () => ({
  getRelationshipDetails: (...args: Array<unknown>) =>
    getRelationshipDetails(...args),
}));

vi.mock('./analytics.server.ts', () => ({
  logEvent: (...args: Array<unknown>) => logEvent(...args),
}));

vi.mock('./wishlist.server.ts', () => ({
  cleanupWishlistPurchasesForOwner: (...args: Array<unknown>) =>
    cleanupWishlistPurchasesForOwner(...args),
}));

import { loadFriendWishlistPageData } from './wishlist-page.server.ts';

function createOwnerSummary(overrides?: Partial<{
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
        purchase: { purchasedById: 'viewer-1' },
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
        purchase: null,
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
  getRelationshipDetails.mockReset();
  logEvent.mockReset();
  cleanupWishlistPurchasesForOwner.mockReset();
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
    expect(logEvent).not.toHaveBeenCalled();
    expect(cleanupWishlistPurchasesForOwner).not.toHaveBeenCalled();
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
      user: createOwnerSummary(),
    });

    expect(userFindFirst).toHaveBeenCalledTimes(1);
    expect(getRelationshipDetails).toHaveBeenCalledWith('viewer-1', 'owner-1');
    expect(userFindFirst.mock.calls[0]![0]).toMatchObject({
      select: expect.not.objectContaining({
        wishlistCategories: expect.anything(),
        wishlistItems: expect.anything(),
      }),
    });
    expect(logEvent).not.toHaveBeenCalled();
    expect(cleanupWishlistPurchasesForOwner).not.toHaveBeenCalled();
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
        ...createOwnerSummary(),
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
            purchase: { purchasedById: 'viewer-1' },
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
            purchase: null,
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
    expect(cleanupWishlistPurchasesForOwner).toHaveBeenCalledWith('owner-1');
    expect(logEvent).not.toHaveBeenCalled();
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
    logEvent.mockResolvedValueOnce({ eventId: 'event-1' });

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

    expect(logEvent).toHaveBeenCalledWith({
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
