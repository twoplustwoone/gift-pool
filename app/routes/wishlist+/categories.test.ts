/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { expect, test } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';
import { action } from './categories.tsx';

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

function createCategoriesRequest({
  cookie,
  form,
}: {
  cookie: string;
  form: Record<string, string>;
}) {
  return new Request('https://www.giftpool.app/wishlist/categories', {
    body: new URLSearchParams(form),
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

test('creates a wishlist category and appends it after existing categories', async () => {
  const { user, cookie } = await createOwnerWithSession();
  await prisma.wishlistCategory.create({
    data: { name: 'Books', order: 0, ownerId: user.id },
  });

  const response = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          clientMutationId: 'client-1',
          intent: 'create',
          name: 'Games',
        },
      }),
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    category: {
      name: 'Games',
      order: 1,
    },
    clientMutationId: 'client-1',
    intent: 'create',
    ok: true,
    toast: {
      title: 'Category added',
      type: 'success',
    },
  });
});

test('renames a category for the current owner', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const category = await prisma.wishlistCategory.create({
    data: { name: 'Books', order: 0, ownerId: user.id },
  });

  const response = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          id: category.id,
          intent: 'rename',
          name: 'Comics',
        },
      }),
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    category: {
      id: category.id,
      name: 'Comics',
      order: 0,
    },
    intent: 'rename',
    ok: true,
  });
});

test('deletes an existing category and reports the deleted payload', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const category = await prisma.wishlistCategory.create({
    data: { name: 'Books', order: 0, ownerId: user.id },
  });

  const response = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          clientMutationId: 'delete-1',
          id: category.id,
          intent: 'delete',
        },
      }),
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    category: null,
    clientMutationId: 'delete-1',
    deletedCategory: {
      id: category.id,
      name: 'Books',
    },
    deletedCategoryId: category.id,
    intent: 'delete',
    ok: true,
  });
  await expect(
    prisma.wishlistCategory.findUnique({ where: { id: category.id } }),
  ).resolves.toBeNull();
});

test('moves a category up and swaps the persisted ordering', async () => {
  const { user, cookie } = await createOwnerWithSession();
  const [books, games] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { name: 'Books', order: 0, ownerId: user.id },
    }),
    prisma.wishlistCategory.create({
      data: { name: 'Games', order: 1, ownerId: user.id },
    }),
  ]);

  const response = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          direction: 'up',
          id: games.id,
          intent: 'move',
        },
      }),
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    category: {
      id: games.id,
      name: 'Games',
      order: 0,
    },
    intent: 'move',
    ok: true,
  });

  const ordered = await prisma.wishlistCategory.findMany({
    orderBy: { order: 'asc' },
    select: { id: true, order: true },
    where: { ownerId: user.id },
  });
  expect(ordered).toEqual([
    { id: games.id, order: 0 },
    { id: books.id, order: 1 },
  ]);
});

test('returns invalid mutation results for incomplete or unknown category actions', async () => {
  const { cookie } = await createOwnerWithSession();

  const createResponse = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          clientMutationId: 'missing-name',
          intent: 'create',
        },
      }),
    }),
  );
  const deleteResponse = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          clientMutationId: 'missing-id',
          intent: 'delete',
        },
      }),
    }),
  );
  const parseFailureResponse = await action(
    toActionArgs({
      context,
      params: {},
      request: createCategoriesRequest({
        cookie,
        form: {
          intent: 'move',
          direction: 'sideways',
        },
      }),
    }),
  );

  await expect(getRouteResultData(createResponse)).resolves.toEqual({
    clientMutationId: 'missing-name',
    ok: false,
  });
  await expect(getRouteResultData(deleteResponse)).resolves.toEqual({
    clientMutationId: 'missing-id',
    ok: false,
  });
  expect(getRouteResultStatus(parseFailureResponse)).toBe(400);
});
