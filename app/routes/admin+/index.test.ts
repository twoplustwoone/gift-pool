import { describe, expect, it } from 'vitest';
import { loader } from '#app/routes/admin+/index.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { POOL_STATUS } from '#app/utils/pool-constants.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

const buildRequest = (cookie?: string) =>
  new Request('http://localhost/admin', {
    headers: cookie ? { cookie } : undefined,
  });

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

describe('/admin (overview) loader', () => {
  it('rejects users without the admin role', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);

    await expect(
      loader(
        toLoaderArgs({
          request: buildRequest(cookie),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('returns overview + stuck pools + cleanup preview + activity for admin', async () => {
    const { admin, cookie } = await seedAdminSession();

    // Create a stuck OPEN pool so the stuck list has one row.
    await prisma.pool.create({
      data: {
        title: 'Overdue pool',
        organizerId: admin.id,
        status: POOL_STATUS.OPEN,
        eventDate: new Date(Date.now() - 3 * DAY_MS),
        contributors: { create: { userId: admin.id } },
      },
    });
    await prisma.wishlistItem.create({
      data: {
        ownerId: admin.id,
        title: 'Hat',
        sortOrder: 0,
        type: 'text',
        status: 'ACTIVE',
      },
    });

    const result = await loader(
      toLoaderArgs({
        request: buildRequest(cookie),
        params: {},
        context: {} as any,
      }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      overview: { users: { total: number }; pools: { stuck: number } };
      stuckPools: Array<{ title: string; reason: string }>;
      cleanup: { expiredVerifications: number };
      activity: Array<unknown>;
    }>(result);

    expect(data.overview.users.total).toBeGreaterThanOrEqual(1);
    expect(data.overview.pools.stuck).toBe(1);
    expect(data.stuckPools).toHaveLength(1);
    expect(data.stuckPools[0]?.reason).toBe('open_overdue');
    expect(data.cleanup.expiredVerifications).toBe(0);
    expect(Array.isArray(data.activity)).toBe(true);
  });
});
