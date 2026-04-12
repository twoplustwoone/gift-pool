import { describe, expect, it } from 'vitest';
import {
  action,
  loader as detailLoader,
} from '#app/routes/admin+/pools_.$poolId.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { POOL_STATUS } from '#app/utils/pool-constants.ts';
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

describe('/admin/pools/:poolId loader', () => {
  it('404s on an unknown pool id', async () => {
    const { cookie } = await seedAdminSession();
    const request = new Request('http://localhost/admin/pools/nope', {
      headers: { cookie },
    });
    try {
      await detailLoader(
        toLoaderArgs({
          request,
          params: { poolId: 'nope' },
          context: {} as any,
        }),
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(404);
    }
  });

  it('returns full pool detail shape', async () => {
    const { admin, cookie } = await seedAdminSession();
    const pool = await prisma.pool.create({
      data: {
        title: 'Test pool',
        organizerId: admin.id,
        status: POOL_STATUS.OPEN,
        contributors: { create: { userId: admin.id } },
      },
      select: { id: true },
    });
    const request = new Request(`http://localhost/admin/pools/${pool.id}`, {
      headers: { cookie },
    });
    const result = await detailLoader(
      toLoaderArgs({
        request,
        params: { poolId: pool.id },
        context: {} as any,
      }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      pool: {
        id: string;
        title: string;
        status: string;
        contributors: unknown[];
        ideas: unknown[];
        activities: unknown[];
      };
    }>(result);
    expect(data.pool.id).toBe(pool.id);
    expect(data.pool.title).toBe('Test pool');
    expect(data.pool.contributors).toHaveLength(1);
    expect(data.pool.ideas).toHaveLength(0);
    expect(data.pool.activities).toHaveLength(0);
  });
});

describe('/admin/pools/:poolId action — cancel_pool', () => {
  it('cancels the pool and logs a supplemental admin activity', async () => {
    const { admin, cookie } = await seedAdminSession();
    const pool = await prisma.pool.create({
      data: {
        title: 'Cancelable pool',
        organizerId: admin.id,
        status: POOL_STATUS.OPEN,
      },
      select: { id: true },
    });

    const formData = new FormData();
    formData.append('intent', 'cancel_pool');
    const request = new Request(`http://localhost/admin/pools/${pool.id}`, {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });
    const result = await action(
      toActionArgs({
        request,
        params: { poolId: pool.id },
        context: {} as any,
      }),
    );
    expect(result).toMatchObject({ ok: true });

    // Pool is now cancelled
    const refreshed = await prisma.pool.findUniqueOrThrow({
      where: { id: pool.id },
      select: { status: true },
    });
    expect(refreshed.status).toBe(POOL_STATUS.CANCELLED);

    // Two activity rows: one from cancelPool + one supplemental from admin action
    const activities = await prisma.poolActivity.findMany({
      where: { poolId: pool.id },
      orderBy: { createdAt: 'desc' },
      select: { type: true, actorId: true, payload: true },
    });
    expect(activities.length).toBeGreaterThanOrEqual(2);
    const adminActivity = activities.find((a) =>
      a.payload?.includes('"source":"admin"'),
    );
    expect(adminActivity).toBeDefined();
    expect(adminActivity?.actorId).toBe(admin.id);
  });

  it('returns error for unknown intents', async () => {
    const { admin, cookie } = await seedAdminSession();
    const pool = await prisma.pool.create({
      data: { title: 'Pool', organizerId: admin.id, status: POOL_STATUS.OPEN },
      select: { id: true },
    });
    const formData = new FormData();
    formData.append('intent', 'bogus');
    const request = new Request(`http://localhost/admin/pools/${pool.id}`, {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });
    const result = await action(
      toActionArgs({
        request,
        params: { poolId: pool.id },
        context: {} as any,
      }),
    );
    expect(result).toMatchObject({ ok: false });
  });
});
