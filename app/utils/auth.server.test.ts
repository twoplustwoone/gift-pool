import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { signup } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  CURRENT_LEGAL_VERSION,
  LEGAL_DOCUMENT_TYPE,
} from '#app/utils/legal.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';

const testConsent = {
  version: CURRENT_LEGAL_VERSION,
  ageAffirmed: true,
  ipAddress: '203.0.113.7',
};

describe('auth.server', () => {
  beforeEach(async () => {
    await prisma.userNotificationPreference.deleteMany();
    await prisma.session.deleteMany({
      where: { user: { email: { contains: '@signup-test.com' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@signup-test.com' } },
    });
  });

  it('signup seeds a notification preference row for every registered type', async () => {
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

    const prefs = await prisma.userNotificationPreference.findMany({
      where: { userId: session.userId },
      select: { type: true, inAppEnabled: true, emailEnabled: true },
    });

    const seededTypes = new Set(prefs.map((p) => p.type));
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      expect(seededTypes.has(type)).toBe(true);
    }
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
