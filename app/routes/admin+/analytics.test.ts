import { describe, expect, it, afterEach } from 'vitest';
import { loader } from '#app/routes/admin+/analytics.tsx';
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

const buildRequest = (cookie?: string) =>
  new Request('http://localhost/admin/analytics', {
    headers: cookie ? { cookie } : undefined,
  });

const originalEmails = process.env.ANALYTICS_ADMIN_EMAILS;
const originalIds = process.env.ANALYTICS_ADMIN_USER_IDS;

afterEach(() => {
  process.env.ANALYTICS_ADMIN_EMAILS = originalEmails;
  process.env.ANALYTICS_ADMIN_USER_IDS = originalIds;
});

describe('/admin/analytics loader', () => {
  it('rejects users outside the allowlist', async () => {
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

  it('returns analytics metrics for allowlisted admins', async () => {
    const adminData = createUser();
    const admin = await prisma.user.create({ data: adminData });
    const otherUser = await prisma.user.create({ data: createUser() });
    process.env.ANALYTICS_ADMIN_EMAILS = admin.email;

    const session = await prisma.session.create({
      data: {
        userId: admin.id,
        expirationDate: new Date(Date.now() + DAY_MS),
      },
    });
    const cookie = await getSessionCookieHeader(session);

    const now = new Date();
    await logEvent({
      name: 'wishlist_viewed',
      userId: admin.id,
      source: 'server',
      requestId: 'req-admin',
      sessionId: session.id,
      createdAt: now,
    });
    await logEvent({
      name: 'wishlist_item_added',
      userId: otherUser.id,
      source: 'client',
      requestId: 'req-other',
      sessionId: null,
      createdAt: new Date(now.getTime() - 2 * DAY_MS),
    });

    const response = await loader(
      toLoaderArgs({
        request: buildRequest(cookie),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(response)).toBe(200);
    const data = await getRouteResultData<{ analytics: any }>(response);
    expect(data.analytics.totalUsers).toBe(2);
    expect(data.analytics.dau).toBe(1);
    expect(data.analytics.wau).toBe(2);
    expect(data.analytics.mau).toBe(2);
    expect(data.analytics.dailyActive).toHaveLength(30);

    const byDate = Object.fromEntries(
      data.analytics.dailyActive.map((entry: any) => [entry.date, entry.count]),
    );
    expect(byDate[now.toISOString().slice(0, 10)]).toBeGreaterThanOrEqual(1);
    expect(
      byDate[new Date(now.getTime() - 2 * DAY_MS).toISOString().slice(0, 10)],
    ).toBeGreaterThanOrEqual(1);

    const event7 = data.analytics.eventsLast7Days.find(
      (row: any) => row.name === 'wishlist_viewed',
    );
    const event30 = data.analytics.eventsLast30Days.find(
      (row: any) => row.name === 'wishlist_item_added',
    );
    expect(event7?.count).toBe(1);
    expect(event30?.count).toBe(1);
  });
});
