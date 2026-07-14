import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

// Stub the network-touching web-push library. setVapidDetails is a no-op;
// sendNotification is asserted/overridden per test.
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

async function createUser() {
  return prisma.user.create({
    select: { id: true },
    data: {
      email: `user-${randomUUID()}@example.com`,
      username: `user_${randomUUID().slice(0, 8)}`,
      roles: {
        connectOrCreate: {
          where: { name: 'user' },
          create: { name: 'user' },
        },
      },
    },
  });
}

async function createSubscription(userId: string, endpoint: string) {
  return prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' },
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  // Each test re-imports the module so the memoized VAPID config is recomputed.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('sendWebPush', () => {
  it('is a no-op when VAPID keys are not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    const user = await createUser();
    await createSubscription(user.id, `https://push.example/${randomUUID()}`);

    const { sendWebPush } = await import('#app/utils/web-push.server.ts');
    const result = await sendWebPush(user.id, {
      title: 'Hi',
      body: 'There',
      url: '/friends',
    });

    expect(sendNotification).not.toHaveBeenCalled();
    expect(result.status).toBe('unavailable');
  });

  it('sends to every subscription when configured', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    const user = await createUser();
    const endpointA = `https://push.example/${randomUUID()}`;
    const endpointB = `https://push.example/${randomUUID()}`;
    await createSubscription(user.id, endpointA);
    await createSubscription(user.id, endpointB);

    sendNotification.mockResolvedValue({ statusCode: 201 });

    const { sendWebPush } = await import('#app/utils/web-push.server.ts');
    const result = await sendWebPush(user.id, {
      title: 'New friend request',
      body: 'Ada sent you a friend request',
      url: '/friends#incoming-requests',
      tag: 'friend-request:abc:received',
    });

    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'pub',
      'priv',
    );
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: 'delivered',
      attempted: 2,
      delivered: 2,
    });
    const firstCall = sendNotification.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = JSON.parse(firstCall?.[1] as string);
    expect(payload).toMatchObject({
      title: 'New friend request',
      url: '/friends#incoming-requests',
      tag: 'friend-request:abc:received',
    });
  });

  it('prunes a subscription the push service reports as gone (410)', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    const user = await createUser();
    const endpoint = `https://push.example/${randomUUID()}`;
    await createSubscription(user.id, endpoint);

    sendNotification.mockRejectedValue({ statusCode: 410 });

    const { sendWebPush } = await import('#app/utils/web-push.server.ts');
    const result = await sendWebPush(user.id, {
      title: 'Hi',
      body: 'There',
      url: '/friends',
    });

    const remaining = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(remaining).toBeNull();
    expect(result).toEqual({ status: 'failed', attempted: 1, delivered: 0 });
  });
});
