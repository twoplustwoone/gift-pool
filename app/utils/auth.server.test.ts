import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { requireUserId, signup } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  CURRENT_LEGAL_VERSION,
  LEGAL_DOCUMENT_TYPE,
} from '#app/utils/legal.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import { getNotificationPreferences } from '#app/utils/notification-preferences.server.ts';

const testConsent = {
  version: CURRENT_LEGAL_VERSION,
  ageAffirmed: true,
  ipAddress: '203.0.113.7',
};

describe('auth.server', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany({
      where: { user: { email: { contains: '@signup-test.com' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@signup-test.com' } },
    });
  });

  it('signup inherits sparse notification defaults without materializing rows', async () => {
    await prisma.role.upsert({
      where: { name: 'user' },
      update: {},
      create: { name: 'user' },
    });

    const username = `signup_${randomUUID().slice(0, 8)}`;
    const email = `${username}@signup-test.com`;

    const session = await signup({
      email,
      username,
      password: 'correct horse battery staple',
      name: 'Signup Test',
      consent: testConsent,
    });

    const prefs = await getNotificationPreferences(session.userId);
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      expect(prefs.get(type)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES[type]);
    }
    await expect(
      prisma.notificationTopicPreference.count({
        where: { userId: session.userId },
      }),
    ).resolves.toBe(0);
  });

  it('signup writes a consent row with the current legal version and age affirmation', async () => {
    await prisma.role.upsert({
      where: { name: 'user' },
      update: {},
      create: { name: 'user' },
    });

    const username = `signup_${randomUUID().slice(0, 8)}`;
    const email = `${username}@signup-test.com`;

    const session = await signup({
      email,
      username,
      password: 'correct horse battery staple',
      name: 'Signup Test',
      consent: testConsent,
    });

    const consents = await prisma.consent.findMany({
      where: { userId: session.userId },
    });

    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      documentType: LEGAL_DOCUMENT_TYPE,
      version: CURRENT_LEGAL_VERSION,
      ageAffirmed: true,
      ipAddress: '203.0.113.7',
    });
    expect(consents[0]?.acceptedAt).toBeInstanceOf(Date);
  });
});

describe('requireUserId', () => {
  async function loginRedirectFor(
    url: string,
    options?: Parameters<typeof requireUserId>[1],
  ) {
    const thrown: unknown = await requireUserId(
      new Request(url),
      options,
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    return (thrown as Response).headers.get('location');
  }

  it('sends anonymous document requests back to the page after login', async () => {
    expect(
      await loginRedirectFor('https://giftpool.app/pools/abc?view=all'),
    ).toBe(
      `/login?${new URLSearchParams({ redirectTo: '/pools/abc?view=all' })}`,
    );
  });

  it('uses the page path, not the single-fetch URL, for data requests (GIFTPOOL-UI-37)', async () => {
    expect(
      await loginRedirectFor(
        'https://giftpool.app/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex',
      ),
    ).toBe('/login?redirectTo=%2Fwishlist');
  });

  it('honours an explicit redirectTo and redirectTo: null', async () => {
    const url = 'https://giftpool.app/wishlist.data';
    expect(await loginRedirectFor(url, { redirectTo: '/friends' })).toBe(
      '/login?redirectTo=%2Ffriends',
    );
    expect(await loginRedirectFor(url, { redirectTo: null })).toBe('/login');
  });
});
