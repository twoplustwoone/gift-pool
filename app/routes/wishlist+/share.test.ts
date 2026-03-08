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
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';
import { loader as publicLoader } from '../w.public.$token.tsx';
import { action as shareAction } from './share.ts';

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

  await prisma.wishlistItem.create({
    data: {
      title: 'Shared item',
      type: 'text',
      ownerId: user.id,
      sortOrder: 0,
    },
  });

  const session = await prisma.session.create({
    select: { id: true },
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
  });

  const cookie = await getSessionCookieHeader(session);

  return { user, cookie };
}

async function generateShareToken(cookie: string) {
  const request = new Request('https://www.giftpool.app/wishlist/share', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ intent: 'generate-public-link' }),
  });

  const response = await shareAction(
    toActionArgs({ request, params: {}, context }),
  );
  const data = await getRouteResultData<any>(response);
  if (!('publicShare' in data) || !data.publicShare) {
    throw new Error('Expected publicShare in response');
  }
  return data.publicShare.token as string;
}

async function revokeShare(cookie: string) {
  const request = new Request('https://www.giftpool.app/wishlist/share', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ intent: 'revoke-public-link' }),
  });

  return shareAction(toActionArgs({ request, params: {}, context }));
}

test('generate public link makes wishlist available without login', async () => {
  const { cookie } = await createOwnerWithSession();

  const token = await generateShareToken(cookie);
  const response = await publicLoader(
    toLoaderArgs({
      params: { token },
      request: new Request(`https://www.giftpool.app/w/public/${token}`),
      context,
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
  const data = await getRouteResultData<any>(response);
  expect(data.user.wishlistItems.length).toBeGreaterThan(0);
  expect(data.user.wishlistItems[0]?.title).toBe('Shared item');
});

test('revoking disables the public link immediately', async () => {
  const { cookie } = await createOwnerWithSession();
  const token = await generateShareToken(cookie);

  await revokeShare(cookie);

  await expect(
    publicLoader({
      ...toLoaderArgs({
        params: { token },
        request: new Request(`https://www.giftpool.app/w/public/${token}`),
        context,
      }),
    }),
  ).rejects.toMatchObject({ status: 404 });
});

test('regenerate after revoke issues a new token', async () => {
  const { cookie } = await createOwnerWithSession();
  const firstToken = await generateShareToken(cookie);

  await revokeShare(cookie);
  const secondToken = await generateShareToken(cookie);

  expect(secondToken).not.toBe(firstToken);

  const response = await publicLoader(
    toLoaderArgs({
      params: { token: secondToken },
      request: new Request(`https://www.giftpool.app/w/public/${secondToken}`),
      context,
    }),
  );

  expect(getRouteResultStatus(response)).toBe(200);
});
