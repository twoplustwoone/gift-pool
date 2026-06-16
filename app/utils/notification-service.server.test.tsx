import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import {
  ensureNotificationPreferencesForUser,
  setNotificationPreference,
} from '#app/utils/notification-preferences.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-registry.ts';
import { notifyUser } from '#app/utils/notification-service.server.tsx';

vi.mock('#app/utils/email.server.ts', () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ status: 'success', data: { id: 'mock-email' } }),
}));

const sendWebPush = vi.fn().mockResolvedValue(undefined);
vi.mock('#app/utils/web-push.server.ts', () => ({
  sendWebPush: (...args: Array<unknown>) => sendWebPush(...args),
}));

async function createUser(
  overrides: Partial<{ email: string; username: string; name: string }> = {},
) {
  return prisma.user.create({
    select: { id: true, email: true, username: true, name: true },
    data: {
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      username: overrides.username ?? `user_${randomUUID().slice(0, 8)}`,
      name: overrides.name ?? 'Test User',
      roles: {
        connectOrCreate: {
          where: { name: 'user' },
          create: { name: 'user' },
        },
      },
    },
  });
}

describe('notification service', () => {
  const emailMock = vi.mocked(sendEmail);

  afterEach(async () => {
    emailMock.mockClear();
    sendWebPush.mockClear();
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.userNotificationPreference.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('creates in-app notification and sends email by default', async () => {
    const recipient = await createUser();
    const actor = await createUser();
    await ensureNotificationPreferencesForUser(recipient.id);
    const friendRequest = await prisma.friendRequest.create({
      data: {
        fromUserId: actor.id,
        toUserId: recipient.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await notifyUser({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source',
    });

    const notifications = await prisma.notification.findMany({
      where: {
        userId: recipient.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      },
    });
    expect(notifications).toHaveLength(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('respects email preference toggles', async () => {
    const recipient = await createUser();
    const actor = await createUser();
    await ensureNotificationPreferencesForUser(recipient.id);

    await setNotificationPreference(
      recipient.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      false,
      'test',
    );

    const friendRequest = await prisma.friendRequest.create({
      data: {
        fromUserId: actor.id,
        toUserId: recipient.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await notifyUser({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-email-off',
    });

    expect(emailMock).not.toHaveBeenCalled();
  });

  it('sends a web push when the push preference is enabled', async () => {
    const recipient = await createUser();
    const actor = await createUser();
    await ensureNotificationPreferencesForUser(recipient.id);

    await setNotificationPreference(
      recipient.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.WEB_PUSH,
      true,
      'test',
    );

    const friendRequest = await prisma.friendRequest.create({
      data: { fromUserId: actor.id, toUserId: recipient.id, status: 'PENDING' },
      select: { id: true },
    });

    await notifyUser({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-push-on',
    });

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(sendWebPush).toHaveBeenCalledWith(
      recipient.id,
      expect.objectContaining({ url: '/friends#incoming-requests' }),
    );
  });

  it('does not send a web push when the push preference is off (default)', async () => {
    const recipient = await createUser();
    const actor = await createUser();
    await ensureNotificationPreferencesForUser(recipient.id);

    const friendRequest = await prisma.friendRequest.create({
      data: { fromUserId: actor.id, toUserId: recipient.id, status: 'PENDING' },
      select: { id: true },
    });

    await notifyUser({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-push-off',
    });

    expect(sendWebPush).not.toHaveBeenCalled();
  });
});
