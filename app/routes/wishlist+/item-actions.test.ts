/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const queueLogEvent = vi.fn();
const requireUserWithPermission = vi.fn();
const getRequestContext = vi.fn();
const createToastHeaders = vi.fn();
const redirectWithToast = vi.fn();

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithPermission: (...args: Array<unknown>) =>
    requireUserWithPermission(...args),
}));

vi.mock('#app/utils/request-context.server.ts', () => ({
  REQUEST_ID_HEADER: 'X-Request-ID',
  applyRequestIdHeader: (
    headers: ResponseInit['headers'] | null | undefined,
    requestId: string,
  ) => {
    const next = new Headers(headers ?? undefined);
    next.set('X-Request-ID', requestId);
    return next;
  },
  getRequestContext: (...args: Array<unknown>) => getRequestContext(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  createToastHeaders: (...args: Array<unknown>) => createToastHeaders(...args),
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

import { action as deleteItemAction } from './$wishlistItemId.tsx';
import { action as deleteItemRedirectAction } from './__wishlist-item.server.tsx';

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
    select: { id: true },
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
  });

  const cookie = await getSessionCookieHeader(session);
  return { user, cookie };
}

function createDeleteRequest({
  cookie,
  form,
  url,
}: {
  cookie: string;
  form: Record<string, string>;
  url: string;
}) {
  return new Request(url, {
    body: new URLSearchParams(form),
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

beforeEach(() => {
  queueLogEvent.mockReset();
  requireUserWithPermission.mockReset();
  getRequestContext.mockReset();
  createToastHeaders.mockReset();
  redirectWithToast.mockReset();

  queueLogEvent.mockReturnValue({ eventId: 'event-1' });
  getRequestContext.mockResolvedValue({
    requestId: 'request-1',
    sessionId: 'session-1',
  });
  createToastHeaders.mockResolvedValue(new Headers({ 'x-toast': 'ok' }));
  redirectWithToast.mockImplementation(
    async (to: string) =>
      new Response(null, {
        headers: {
          Location: to,
        },
        status: 302,
      }),
  );
});

test('deletes an owned wishlist item and returns request, toast, and analytics data', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: user.id,
      sortOrder: 0,
      title: 'Camera',
      type: 'text',
    },
  });

  const response = await deleteItemAction(
    toActionArgs({
      context,
      params: { wishlistItemId: item.id },
      request: createDeleteRequest({
        cookie,
        form: {
          clientMutationId: 'delete-1',
          intent: 'delete-wishlist-item',
          wishlistItemId: item.id,
        },
        url: `https://www.giftpool.app/wishlist/${item.id}`,
      }),
    }),
  );

  expect(requireUserWithPermission).toHaveBeenCalledWith(
    expect.any(Request),
    'delete:wishlistItem:own',
  );
  expect(queueLogEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'wishlist_item_archived',
      properties: expect.objectContaining({
        ownerId: user.id,
        wishlistItemId: item.id,
      }),
      requestId: 'request-1',
      sessionId: 'session-1',
      userId: user.id,
    }),
  );
  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    analyticsEventId: 'event-1',
    clientMutationId: 'delete-1',
    requestId: 'request-1',
    success: true,
    wishlistItemId: item.id,
  });
  await expect(
    prisma.wishlistItem.findUnique({ where: { id: item.id } }),
  ).resolves.toBeNull();
});

test('uses the any-item permission branch for non-owned wishlist items', async () => {
  const [{ user: actor, cookie }, { user: owner }] = await Promise.all([
    createOwnerWithSession(),
    createOwnerWithSession(),
  ]);

  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: owner.id,
      sortOrder: 0,
      title: 'Laptop',
      type: 'text',
    },
  });

  await deleteItemAction(
    toActionArgs({
      context,
      params: { wishlistItemId: item.id },
      request: createDeleteRequest({
        cookie,
        form: {
          intent: 'delete-wishlist-item',
          wishlistItemId: item.id,
        },
        url: `https://www.giftpool.app/wishlist/${item.id}`,
      }),
    }),
  );

  expect(actor.id).not.toBe(owner.id);
  expect(requireUserWithPermission).toHaveBeenCalledWith(
    expect.any(Request),
    'delete:wishlistItem:any',
  );
});

test('returns validation data for invalid wishlist item delete payloads', async () => {
  const { cookie } = await createOwnerWithSession();

  const response = await deleteItemAction(
    toActionArgs({
      context,
      params: {},
      request: createDeleteRequest({
        cookie,
        form: {
          clientMutationId: 'missing-item-id',
          intent: 'delete-wishlist-item',
        },
        url: 'https://www.giftpool.app/wishlist/missing',
      }),
    }),
  );

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    clientMutationId: 'missing-item-id',
  });
});

test('throws 404 when deleting a wishlist item that does not exist', async () => {
  const { cookie } = await createOwnerWithSession();

  await expect(
    deleteItemAction(
      toActionArgs({
        context,
        params: {},
        request: createDeleteRequest({
          cookie,
          form: {
            intent: 'delete-wishlist-item',
            wishlistItemId: 'missing-item',
          },
          url: 'https://www.giftpool.app/wishlist/missing-item',
        }),
      }),
    ),
  ).rejects.toMatchObject({
    status: 404,
  });
});

test('deletes an item through the redirecting wishlist item action', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: user.id,
      sortOrder: 0,
      title: 'Tripod',
      type: 'text',
    },
  });

  const response = await deleteItemRedirectAction(
    toActionArgs({
      context,
      params: { wishlistItemId: item.id },
      request: createDeleteRequest({
        cookie,
        form: {
          intent: 'delete-wishlist-item',
          wishlistItemId: item.id,
        },
        url: `https://www.giftpool.app/wishlist/${item.id}`,
      }),
    }),
  );

  expect(requireUserWithPermission).toHaveBeenCalledWith(
    expect.any(Request),
    'delete:wishlistItem:own',
  );
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).headers.get('Location')).toBe(
    `/users/${user.username}/wishlist`,
  );
  await expect(
    prisma.wishlistItem.findUnique({ where: { id: item.id } }),
  ).resolves.toBeNull();
});

test('returns validation data or 404 from the redirecting wishlist item action', async () => {
  const { cookie } = await createOwnerWithSession();

  const invalidResponse = await deleteItemRedirectAction(
    toActionArgs({
      context,
      params: {},
      request: createDeleteRequest({
        cookie,
        form: {
          intent: 'delete-wishlist-item',
        },
        url: 'https://www.giftpool.app/wishlist/missing',
      }),
    }),
  );

  expect(getRouteResultStatus(invalidResponse)).toBe(400);

  await expect(
    deleteItemRedirectAction(
      toActionArgs({
        context,
        params: {},
        request: createDeleteRequest({
          cookie,
          form: {
            intent: 'delete-wishlist-item',
            wishlistItemId: 'missing-item',
          },
          url: 'https://www.giftpool.app/wishlist/missing-item',
        }),
      }),
    ),
  ).rejects.toMatchObject({
    status: 404,
  });
});
