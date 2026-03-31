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
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';
import { loader } from './$username.tsx';

const ensureUserRole = () =>
  prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user' },
  });

const buildAuthenticatedRequest = async (userId: string, username: string) => {
  const session = await prisma.session.create({
    select: { id: true },
    data: { userId, expirationDate: getSessionExpirationDate() },
  });

  const cookie = await getSessionCookieHeader(session);

  return new Request(`https://www.giftpool.app/users/${username}`, {
    headers: { cookie },
  });
};

test('non-friends receive minimal profile data from the loader', async () => {
  await ensureUserRole();
  const viewer = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const targetUser = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const request = await buildAuthenticatedRequest(
    viewer.id,
    targetUser.username,
  );
  const context = {
    cspNonce: undefined,
    serverBuild: undefined,
  } as unknown as AppLoadContext;

  const response = await loader(
    toLoaderArgs({
      params: { username: targetUser.username },
      request,
      context,
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  const data = await getRouteResultData<any>(response);

  expect(data.canViewProfile).toBe(false);
  expect(data.user).toEqual({
    id: targetUser.id,
    name: targetUser.name,
    username: targetUser.username,
  });
  expect(data.relationship.state).toBe('NONE');
  expect(data.user).not.toHaveProperty('createdAt');
  expect(data.user).not.toHaveProperty('image');
  expect(data).not.toHaveProperty('userJoinedDisplay');
});

test('friends can view the full profile details', async () => {
  await ensureUserRole();
  const viewer = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const targetUser = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  await prisma.friendship.create({
    data: { userAId: viewer.id, userBId: targetUser.id },
  });

  const request = await buildAuthenticatedRequest(
    viewer.id,
    targetUser.username,
  );
  const context = {
    cspNonce: undefined,
    serverBuild: undefined,
  } as unknown as AppLoadContext;

  const response = await loader(
    toLoaderArgs({
      params: { username: targetUser.username },
      request,
      context,
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  const data = await getRouteResultData<any>(response);

  expect(data.canViewProfile).toBe(true);
  expect(data.user.id).toBe(targetUser.id);
  expect(data.user.username).toBe(targetUser.username);
  expect(data.user).toHaveProperty('createdAt');
  expect(data).toHaveProperty('userJoinedDisplay');
  expect(data.relationship.state).toBe('FRIENDS');
});

test('viewing your own profile redirects to /me', async () => {
  await ensureUserRole();
  const viewer = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const request = await buildAuthenticatedRequest(viewer.id, viewer.username);
  const context = {
    cspNonce: undefined,
    serverBuild: undefined,
  } as unknown as AppLoadContext;

  const response = await loader(
    toLoaderArgs({
      params: { username: viewer.username },
      request,
      context,
    }),
  );

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get('Location')).toBe('/me');
});

test('missing users return a 404 response', async () => {
  await ensureUserRole();
  const viewer = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const request = await buildAuthenticatedRequest(viewer.id, 'missing-user');
  const context = {
    cspNonce: undefined,
    serverBuild: undefined,
  } as unknown as AppLoadContext;

  await expect(
    loader(
      toLoaderArgs({
        params: { username: 'missing-user' },
        request,
        context,
      }),
    ),
  ).rejects.toMatchObject({ status: 404 });
});
