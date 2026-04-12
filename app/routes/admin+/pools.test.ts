import { describe, expect, it } from 'vitest';
import { loader } from '#app/routes/admin+/pools.tsx';
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

describe('/admin/pools loader', () => {
  it('rejects non-admin users', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);
    const request = new Request('http://localhost/admin/pools', {
      headers: { cookie },
    });
    await expect(
      loader(toLoaderArgs({ request, params: {}, context: {} as any })),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('returns stuck pools by default', async () => {
    const { admin, cookie } = await seedAdminSession();
    await prisma.pool.create({
      data: {
        title: 'Overdue one',
        organizerId: admin.id,
        status: POOL_STATUS.OPEN,
        eventDate: new Date(Date.now() - 3 * DAY_MS),
      },
    });
    const request = new Request('http://localhost/admin/pools', {
      headers: { cookie },
    });
    const result = await loader(
      toLoaderArgs({ request, params: {}, context: {} as any }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      pools: Array<{ title: string }>;
      statusParam: string;
    }>(result);
    expect(data.statusParam).toBe('stuck');
    expect(data.pools).toHaveLength(1);
    expect(data.pools[0]?.title).toBe('Overdue one');
  });

  it('filters by status when ?status=OPEN', async () => {
    const { admin, cookie } = await seedAdminSession();
    await prisma.pool.create({
      data: {
        title: 'Open pool',
        organizerId: admin.id,
        status: POOL_STATUS.OPEN,
      },
    });
    await prisma.pool.create({
      data: {
        title: 'Voting pool',
        organizerId: admin.id,
        status: POOL_STATUS.VOTING,
      },
    });
    const request = new Request(
      'http://localhost/admin/pools?status=OPEN',
      { headers: { cookie } },
    );
    const result = await loader(
      toLoaderArgs({ request, params: {}, context: {} as any }),
    );
    const data = await getRouteResultData<{
      pools: Array<{ title: string; status: string }>;
      total: number;
    }>(result);
    expect(data.total).toBe(1);
    expect(data.pools[0]?.status).toBe('OPEN');
  });
});
