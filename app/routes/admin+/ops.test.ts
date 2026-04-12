import { describe, expect, it } from 'vitest';
import { action, loader } from '#app/routes/admin+/ops.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

async function seedAdminSession() {
  await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });
  const admin = await prisma.user.create({
    data: { ...createUser(), roles: { connect: { name: 'admin' } } },
    select: { id: true },
  });
  const session = await prisma.session.create({
    data: { userId: admin.id, expirationDate: new Date(Date.now() + DAY_MS) },
  });
  const cookie = await getSessionCookieHeader(session);
  return { admin, cookie };
}

describe('/admin/ops loader', () => {
  it('rejects non-admin users', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);
    const request = new Request('http://localhost/admin/ops', {
      headers: { cookie },
    });

    await expect(
      loader(toLoaderArgs({ request, params: {}, context: {} as any })),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('returns cleanup preview + disk usage for admin', async () => {
    const { cookie } = await seedAdminSession();
    const request = new Request('http://localhost/admin/ops', {
      headers: { cookie },
    });

    const result = await loader(
      toLoaderArgs({ request, params: {}, context: {} as any }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      cleanup: { expiredVerifications: number };
      disk: { wishlistItemTotal: number };
    }>(result);
    expect(typeof data.cleanup.expiredVerifications).toBe('number');
    expect(typeof data.disk.wishlistItemTotal).toBe('number');
  });
});

describe('/admin/ops action', () => {
  it('rejects invalid intents', async () => {
    const { cookie } = await seedAdminSession();
    const formData = new FormData();
    formData.append('intent', 'bogus');
    const request = new Request('http://localhost/admin/ops', {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });

    // invariantResponse throws a Response directly (not a react-router
    // data() envelope), so assert on the Response status.
    try {
      await action(toActionArgs({ request, params: {}, context: {} as any }));
      throw new Error('expected action to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(400);
    }
  });

  it('purges expired verifications and redirects', async () => {
    const { cookie } = await seedAdminSession();
    await prisma.verification.create({
      data: {
        type: '2fa',
        target: 'expired-target',
        secret: 'abc',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() - DAY_MS),
      },
    });

    const formData = new FormData();
    formData.append('intent', 'purge_verifications');
    const request = new Request('http://localhost/admin/ops', {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });

    const result = await action(
      toActionArgs({ request, params: {}, context: {} as any }),
    );
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(302);
      expect(result.headers.get('location')).toContain(
        '/admin/ops?just=purge_verifications&n=1',
      );
    }

    const remaining = await prisma.verification.count({
      where: { target: 'expired-target' },
    });
    expect(remaining).toBe(0);
  });

  it('expires group bans', async () => {
    const { cookie } = await seedAdminSession();
    const user = await prisma.user.create({ data: createUser() });
    const group = await prisma.giftGroup.create({
      data: { name: 'Bans', description: null },
    });
    await prisma.usersInGiftGroups.create({
      data: {
        userId: user.id,
        giftGroupId: group.id,
        bannedUntil: new Date(Date.now() - DAY_MS),
      },
    });

    const formData = new FormData();
    formData.append('intent', 'expire_group_bans');
    const request = new Request('http://localhost/admin/ops', {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });

    const result = await action(
      toActionArgs({ request, params: {}, context: {} as any }),
    );
    expect(result instanceof Response).toBe(true);

    const row = await prisma.usersInGiftGroups.findUniqueOrThrow({
      where: {
        userId_giftGroupId: { userId: user.id, giftGroupId: group.id },
      },
    });
    expect(row.bannedUntil).toBeNull();
  });
});
