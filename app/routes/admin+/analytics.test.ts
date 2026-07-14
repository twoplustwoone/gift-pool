import { describe, expect, it } from 'vitest';
import { loader } from '#app/routes/admin+/analytics.tsx';
import {
  logClientEnvironmentObservation,
  logEvent,
} from '#app/utils/analytics.server.ts';
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

describe('/admin/analytics loader', () => {
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

  it('returns analytics metrics for users with the admin role', async () => {
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
    const otherUser = await prisma.user.create({ data: createUser() });

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
    await logClientEnvironmentObservation({
      visitorId: '11111111-1111-4111-8111-111111111111',
      requestId: 'req-env',
      sessionId: null,
      properties: {
        browserFamily: 'Chrome',
        browserMajor: 120,
        osFamily: 'macOS',
        deviceType: 'desktop',
        viewportBucket: 'desktop',
        displayMode: 'browser',
        isStandalone: false,
        serviceWorkerSupported: true,
        notificationPermission: 'default',
        observedAt: now.toISOString(),
      },
      createdAt: now,
    });

    const response = await loader(
      toLoaderArgs({
        request: buildRequest(cookie),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(response)).toBe(200);
    const data = await getRouteResultData<{
      analytics: any;
      environment: any;
      organizerReminders: any;
    }>(response);
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
    expect(data.environment.totalObservations).toBe(1);
    expect(data.environment.browsers[0]).toMatchObject({
      label: 'Chrome 120',
      count: 1,
      percent: 100,
    });
    expect(data.organizerReminders).toMatchObject({
      days: 30,
      queuedReminders: 0,
      targetedRecipients: 0,
      deliveredRecipients: 0,
      notificationClicks: 0,
    });
  });
});
