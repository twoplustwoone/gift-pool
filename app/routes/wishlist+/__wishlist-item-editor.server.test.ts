/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts';
import { REQUEST_ID_HEADER } from '#app/utils/request-context.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const queueLogEvent = vi.fn();
const processImageFromFile = vi.fn();
const processImageFromUrl = vi.fn();

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/wishlist-images.server.ts', () => ({
  processImageFromFile: (...args: Array<unknown>) => processImageFromFile(...args),
  processImageFromUrl: (...args: Array<unknown>) => processImageFromUrl(...args),
}));

import { action } from './__wishlist-item-editor.server.tsx';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

const ensureUserRole = () =>
  prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user' },
  });

async function createOwnerWithSession() {
  await ensureUserRole();

  const user = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const session = await prisma.session.create({
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });

  const cookie = await getSessionCookieHeader(session);
  return { cookie, session, user };
}

function createEditorRequest({
  cookie,
  formData,
  requestId = 'request-1',
}: {
  cookie: string;
  formData: FormData;
  requestId?: string;
}) {
  return new Request('https://www.giftpool.app/wishlist', {
    body: formData,
    headers: {
      cookie,
      [REQUEST_ID_HEADER]: requestId,
    },
    method: 'POST',
  });
}

beforeEach(() => {
  queueLogEvent.mockReset();
  processImageFromFile.mockReset();
  processImageFromUrl.mockReset();
});

describe('app/routes/wishlist+/__wishlist-item-editor.server.tsx', () => {
  it('creates a wishlist item, appends it in the category, and logs analytics for save-add-another', async () => {
    const { cookie, session, user } = await createOwnerWithSession();
    const category = await prisma.wishlistCategory.create({
      data: {
        name: 'Books',
        order: 0,
        ownerId: user.id,
      },
    });
    await prisma.wishlistItem.create({
      data: {
        categoryId: category.id,
        ownerId: user.id,
        sortOrder: 0,
        title: 'Existing item',
        type: 'text',
      },
    });
    queueLogEvent.mockReturnValue({ eventId: 'analytics-1' });

    const formData = new FormData();
    formData.set('intent', 'save-add-another');
    formData.set('title', 'New camera');
    formData.set('type', 'text');
    formData.set('categoryId', category.id);
    formData.set('clientMutationId', 'client-1');
    formData.set('analyticsEventId', 'client-analytics-1');
    formData.set('imageAction', 'none');

    const response = await action(
      toActionArgs({
        context,
        params: {},
        request: createEditorRequest({
          cookie,
          formData,
          requestId: 'request-1',
        }),
      }),
    );

    expect(getRouteResultStatus(response)).toBe(200);
    await expect(getRouteResultData(response)).resolves.toMatchObject({
      analyticsEventId: 'analytics-1',
      clientMutationId: 'client-1',
      imageAction: 'none',
      imageError: null,
      intent: 'save-add-another',
      item: {
        categoryId: category.id,
        hasImage: false,
        imageSource: null,
        note: null,
        ownerId: user.id,
        sortOrder: 1,
        title: 'New camera',
        type: 'text',
        url: null,
      },
      requestId: 'request-1',
      toast: {
        description: 'Wishlist item added.',
        title: 'Item added',
        type: 'success',
      },
    });

    expect(
      new Headers((response as { init?: ResponseInit }).init?.headers).get(
        REQUEST_ID_HEADER,
      ),
    ).toBe('request-1');
    expect(queueLogEvent).toHaveBeenCalledWith({
      eventId: 'client-analytics-1',
      name: 'wishlist_item_added',
      properties: {
        categoryId: category.id,
        type: 'text',
        wishlistItemId: expect.any(String),
      },
      requestId: 'request-1',
      sessionId: session.id,
      source: 'server',
      userId: user.id,
    });
  });

  it('moves an existing item to a new category and redensifies the old category ordering', async () => {
    const { cookie, user } = await createOwnerWithSession();
    const [sourceCategory, targetCategory] = await Promise.all([
      prisma.wishlistCategory.create({
        data: {
          name: 'Source',
          order: 0,
          ownerId: user.id,
        },
      }),
      prisma.wishlistCategory.create({
        data: {
          name: 'Target',
          order: 1,
          ownerId: user.id,
        },
      }),
    ]);
    const [movingItem, remainingItem, targetItem] = await Promise.all([
      prisma.wishlistItem.create({
        data: {
          categoryId: sourceCategory.id,
          ownerId: user.id,
          sortOrder: 0,
          title: 'Move me',
          type: 'text',
        },
      }),
      prisma.wishlistItem.create({
        data: {
          categoryId: sourceCategory.id,
          ownerId: user.id,
          sortOrder: 1,
          title: 'Stay here',
          type: 'text',
        },
      }),
      prisma.wishlistItem.create({
        data: {
          categoryId: targetCategory.id,
          ownerId: user.id,
          sortOrder: 0,
          title: 'Already there',
          type: 'text',
        },
      }),
    ]);

    const formData = new FormData();
    formData.set('intent', 'save');
    formData.set('id', movingItem.id);
    formData.set('title', 'Move me later');
    formData.set('type', 'text');
    formData.set('categoryId', targetCategory.id);
    formData.set('imageAction', 'none');

    const response = await action(
      toActionArgs({
        context,
        params: {},
        request: createEditorRequest({
          cookie,
          formData,
          requestId: 'request-2',
        }),
      }),
    );

    expect(getRouteResultStatus(response)).toBe(200);
    await expect(getRouteResultData(response)).resolves.toMatchObject({
      intent: 'save',
      item: {
        categoryId: targetCategory.id,
        id: movingItem.id,
        sortOrder: 1,
        title: 'Move me later',
      },
      toast: null,
    });
    expect(queueLogEvent).not.toHaveBeenCalled();

    await expect(
      prisma.wishlistItem.findUnique({
        select: { categoryId: true, sortOrder: true },
        where: { id: remainingItem.id },
      }),
    ).resolves.toEqual({
      categoryId: sourceCategory.id,
      sortOrder: 0,
    });
    await expect(
      prisma.wishlistItem.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, sortOrder: true },
        where: { categoryId: targetCategory.id, ownerId: user.id },
      }),
    ).resolves.toEqual([
      { id: targetItem.id, sortOrder: 0 },
      { id: movingItem.id, sortOrder: 1 },
    ]);
  });

  it('saves the item but returns a 400 when image processing fails', async () => {
    const { cookie, user } = await createOwnerWithSession();
    processImageFromUrl.mockRejectedValue(new Error('Image processing failed'));

    const formData = new FormData();
    formData.set('intent', 'save');
    formData.set('title', 'Poster');
    formData.set('type', 'text');
    formData.set('imageAction', 'url');
    formData.set('imageUrl', 'https://example.com/poster.png');

    const response = await action(
      toActionArgs({
        context,
        params: {},
        request: createEditorRequest({
          cookie,
          formData,
          requestId: 'request-3',
        }),
      }),
    );

    expect(getRouteResultStatus(response)).toBe(400);
    await expect(getRouteResultData(response)).resolves.toMatchObject({
      analyticsEventId: null,
      imageAction: 'url',
      imageError: 'Image processing failed',
      intent: 'save',
      item: {
        hasImage: false,
        imageSource: null,
        ownerId: user.id,
        title: 'Poster',
      },
      requestId: 'request-3',
    });
    expect(queueLogEvent).not.toHaveBeenCalled();
  });
});
