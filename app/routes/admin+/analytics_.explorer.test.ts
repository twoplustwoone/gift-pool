import { describe, expect, it } from 'vitest';
import { loader } from '#app/routes/admin+/analytics_.explorer.tsx';
import { logEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

const buildRequest = (cookie?: string, search = '') =>
  new Request(`http://localhost/admin/analytics/explorer${search}`, {
    headers: cookie ? { cookie } : undefined,
  });

async function seedAdminSession() {
  await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });
  const admin = await prisma.user.create({
    data: {
      ...createUser(),
      roles: { connect: { name: 'admin' } },
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: admin.id,
      expirationDate: new Date(Date.now() + DAY_MS),
    },
  });
  return getSessionCookieHeader(session);
}

describe('/admin/analytics/explorer loader', () => {
  it('rejects users without the admin role', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expirationDate: new Date(Date.now() + DAY_MS),
      },
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

  it('returns filtered explorer data for admin users', async () => {
    const cookie = await seedAdminSession();
    const user = await prisma.user.create({ data: createUser() });
    await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'client',
      visitorId: 'visitor-one',
      createdAt: new Date(),
    });

    const response = await loader(
      toLoaderArgs({
        request: buildRequest(
          cookie,
          '?days=7&event=wishlist_viewed&groupBy=source&chart=bar',
        ),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(response)).toBe(200);
    const data = await getRouteResultData<{
      chart: string;
      explorer: {
        days: number;
        eventName: string;
        groupBy: string;
        totalEvents: number;
        breakdown: Array<{ label: string; count: number }>;
      };
    }>(response);
    expect(data.chart).toBe('bar');
    expect(data.explorer.days).toBe(7);
    expect(data.explorer.eventName).toBe('wishlist_viewed');
    expect(data.explorer.groupBy).toBe('source');
    expect(data.explorer.totalEvents).toBe(1);
    expect(data.explorer.breakdown[0]).toMatchObject({
      label: 'client',
      count: 1,
    });
  });
});
