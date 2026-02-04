/**
 * @vitest-environment node
 */
import { type AppLoadContext } from '@remix-run/node';
import { expect, test } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';
import { action } from './reorder.ts';

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

function createReorderRequest({
  cookie,
  form,
}: {
  cookie: string;
  form: Record<string, string>;
}) {
  return new Request('https://www.giftpool.app/wishlist/reorder', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
  });
}

test('reorders categories for the owner', async () => {
  const { user, cookie } = await createOwnerWithSession();

  const [catA, catB] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { ownerId: user.id, name: 'Books', order: 0 },
    }),
    prisma.wishlistCategory.create({
      data: { ownerId: user.id, name: 'Games', order: 1 },
    }),
  ]);

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-categories',
        orderedCategoryIds: JSON.stringify([catB.id, catA.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(200);

  const ordered = await prisma.wishlistCategory.findMany({
    where: { ownerId: user.id },
    select: { id: true, order: true },
    orderBy: { order: 'asc' },
  });

  expect(ordered.map((category) => category.id)).toEqual([catB.id, catA.id]);
  expect(ordered.map((category) => category.order)).toEqual([0, 1]);
});

test('rejects category reorder payloads that include unknown ids', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const category = await prisma.wishlistCategory.create({
    data: { ownerId: user.id, name: 'Books', order: 0 },
  });

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-categories',
        orderedCategoryIds: JSON.stringify(['default', category.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test('reorders items in the same category', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const category = await prisma.wishlistCategory.create({
    data: { ownerId: user.id, name: 'Books', order: 0 },
  });

  const [itemA, itemB] = await Promise.all([
    prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        categoryId: category.id,
        title: 'Item A',
        type: 'text',
        sortOrder: 0,
      },
    }),
    prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        categoryId: category.id,
        title: 'Item B',
        type: 'text',
        sortOrder: 1,
      },
    }),
  ]);

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-items',
        sourceCategoryId: category.id,
        targetCategoryId: category.id,
        sourceOrderedItemIds: JSON.stringify([itemB.id, itemA.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(200);

  const reordered = await prisma.wishlistItem.findMany({
    where: { ownerId: user.id, categoryId: category.id },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });

  expect(reordered.map((item) => item.id)).toEqual([itemB.id, itemA.id]);
});

test('moves an item to another category and appends at drop target', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const [sourceCategory, targetCategory] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { ownerId: user.id, name: 'Source', order: 0 },
    }),
    prisma.wishlistCategory.create({
      data: { ownerId: user.id, name: 'Target', order: 1 },
    }),
  ]);

  const [sourceA, sourceB, targetA] = await Promise.all([
    prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        categoryId: sourceCategory.id,
        title: 'Source A',
        type: 'text',
        sortOrder: 0,
      },
    }),
    prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        categoryId: sourceCategory.id,
        title: 'Source B',
        type: 'text',
        sortOrder: 1,
      },
    }),
    prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        categoryId: targetCategory.id,
        title: 'Target A',
        type: 'text',
        sortOrder: 0,
      },
    }),
  ]);

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-items',
        sourceCategoryId: sourceCategory.id,
        targetCategoryId: targetCategory.id,
        sourceOrderedItemIds: JSON.stringify([sourceB.id]),
        targetOrderedItemIds: JSON.stringify([targetA.id, sourceA.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(200);

  const sourceItems = await prisma.wishlistItem.findMany({
    where: { ownerId: user.id, categoryId: sourceCategory.id },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });
  const targetItems = await prisma.wishlistItem.findMany({
    where: { ownerId: user.id, categoryId: targetCategory.id },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });

  expect(sourceItems).toEqual([{ id: sourceB.id, sortOrder: 0 }]);
  expect(targetItems).toEqual([
    { id: targetA.id, sortOrder: 0 },
    { id: sourceA.id, sortOrder: 1 },
  ]);
});

test('rejects item reorder payloads containing items not owned by requester', async () => {
  const [{ user: owner, cookie }, { user: otherUser }] = await Promise.all([
    createOwnerWithSession(),
    createOwnerWithSession(),
  ]);

  const [ownerItem, otherItem] = await Promise.all([
    prisma.wishlistItem.create({
      data: {
        ownerId: owner.id,
        title: 'Owner Item',
        type: 'text',
        sortOrder: 0,
      },
    }),
    prisma.wishlistItem.create({
      data: {
        ownerId: otherUser.id,
        title: 'Other Item',
        type: 'text',
        sortOrder: 0,
      },
    }),
  ]);

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-items',
        sourceCategoryId: '',
        targetCategoryId: '',
        sourceOrderedItemIds: JSON.stringify([ownerItem.id, otherItem.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test('rejects cross-category reorder into a category not owned by requester', async () => {
  const [{ user: owner, cookie }, { user: otherUser }] = await Promise.all([
    createOwnerWithSession(),
    createOwnerWithSession(),
  ]);

  const [sourceCategory, otherUsersCategory] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { ownerId: owner.id, name: 'Source', order: 0 },
    }),
    prisma.wishlistCategory.create({
      data: { ownerId: otherUser.id, name: 'Other User Category', order: 0 },
    }),
  ]);

  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: owner.id,
      categoryId: sourceCategory.id,
      title: 'Owner Item',
      type: 'text',
      sortOrder: 0,
    },
  });

  const response = await action({
    request: createReorderRequest({
      cookie,
      form: {
        intent: 'reorder-items',
        sourceCategoryId: sourceCategory.id,
        targetCategoryId: otherUsersCategory.id,
        sourceOrderedItemIds: JSON.stringify([]),
        targetOrderedItemIds: JSON.stringify([item.id]),
      },
    }),
    params: {},
    context,
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ ok: false });

  const unchangedItem = await prisma.wishlistItem.findUnique({
    where: { id: item.id },
    select: { categoryId: true },
  });
  expect(unchangedItem?.categoryId).toBe(sourceCategory.id);
});
