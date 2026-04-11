import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { signup } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts';

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
});
