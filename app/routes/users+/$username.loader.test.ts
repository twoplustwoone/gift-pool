/**
 * @vitest-environment node
 */
import { expect, test } from 'vitest';
import { loader } from './$username.tsx';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const ensureUserRole = () =>
  prisma.role.upsert({ where: { name: 'user' }, update: {}, create: { name: 'user' } });

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

  const request = await buildAuthenticatedRequest(viewer.id, targetUser.username);

  const response = await loader({
    params: { username: targetUser.username },
    request,
  });

  expect(response.status).toBe(200);

  const data = await response.json();

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

  const request = await buildAuthenticatedRequest(viewer.id, targetUser.username);

  const response = await loader({
    params: { username: targetUser.username },
    request,
  });

  expect(response.status).toBe(200);

  const data = await response.json();

  expect(data.canViewProfile).toBe(true);
  expect(data.user.id).toBe(targetUser.id);
  expect(data.user.username).toBe(targetUser.username);
  expect(data.user).toHaveProperty('createdAt');
  expect(data).toHaveProperty('userJoinedDisplay');
  expect(data.relationship.state).toBe('FRIENDS');
});
