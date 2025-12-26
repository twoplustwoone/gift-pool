/**
 * @vitest-environment node
 */
import { type AppLoadContext } from '@remix-run/node';
import { expect, test } from 'vitest';
import { action as shareAction } from './share.ts';
import { loader as publicLoader } from '../w.public.$token.tsx';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

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

  const response = await shareAction({ request, params: {}, context });
  const data = await response.json();
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

  return shareAction({ request, params: {}, context });
}

test('generate public link makes wishlist available without login', async () => {
  const { cookie } = await createOwnerWithSession();

  const token = await generateShareToken(cookie);
  const response = await publicLoader({
    params: { token },
    request: new Request(`https://www.giftpool.app/w/public/${token}`),
    context,
  });

  expect(response.status).toBe(200);

  const data = await response.json();
  expect(data.user.wishlistItems[0].title).toBe('Shared item');
});

test('revoking disables the public link immediately', async () => {
  const { cookie } = await createOwnerWithSession();
  const token = await generateShareToken(cookie);

  await revokeShare(cookie);

  await expect(
    publicLoader({
      params: { token },
      request: new Request(`https://www.giftpool.app/w/public/${token}`),
      context,
    }),
  ).rejects.toMatchObject({ status: 404 });
});

test('regenerate after revoke issues a new token', async () => {
  const { cookie } = await createOwnerWithSession();
  const firstToken = await generateShareToken(cookie);

  await revokeShare(cookie);
  const secondToken = await generateShareToken(cookie);

  expect(secondToken).not.toBe(firstToken);

  const response = await publicLoader({
    params: { token: secondToken },
    request: new Request(`https://www.giftpool.app/w/public/${secondToken}`),
    context,
  });

  expect(response.status).toBe(200);
});
