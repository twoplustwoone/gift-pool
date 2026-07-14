/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { getOrganizerReminderMetrics } from './admin-organizer-reminders.server.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('organizer reminder admin metrics', () => {
  it('aggregates outcomes and de-identifies post-delivery preference reductions', async () => {
    const now = new Date('2026-07-14T12:00:00.000Z');
    const [organizer, recipientOne, recipientTwo, recipientThree] =
      await Promise.all([
        prisma.user.create({ data: createUser() }),
        prisma.user.create({ data: createUser() }),
        prisma.user.create({ data: createUser() }),
        prisma.user.create({ data: createUser() }),
      ]);
    const pool = await prisma.pool.create({
      data: { title: 'Observable pool', organizerId: organizer.id },
    });

    const contributionOne = await createNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: 'CONTRIBUTION',
      targetCount: 2,
      createdAt: daysBefore(now, 10),
    });
    const contributionTwo = await createNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: 'CONTRIBUTION',
      targetCount: 1,
      createdAt: daysBefore(now, 8),
    });
    const vote = await createNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: 'VOTE',
      targetCount: 1,
      createdAt: daysBefore(now, 6),
    });
    await createNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: 'DELIVERY',
      targetCount: 20,
      createdAt: daysBefore(now, 40),
    });

    const firstDeliveryAt = daysBefore(now, 10);
    const secondDeliveryAt = daysBefore(now, 6);
    await Promise.all([
      createEvent({
        name: 'organizer_reminder_sent',
        userId: recipientOne.id,
        createdAt: firstDeliveryAt,
        properties: deliveryProperties(
          contributionOne.id,
          pool.id,
          'POOL_CONTRIBUTION_REMINDER',
          ['IN_APP'],
        ),
      }),
      createEvent({
        name: 'organizer_reminder_sent',
        userId: recipientTwo.id,
        createdAt: firstDeliveryAt,
        properties: deliveryProperties(
          contributionOne.id,
          pool.id,
          'POOL_CONTRIBUTION_REMINDER',
          ['IN_APP', 'EMAIL'],
        ),
      }),
      createEvent({
        name: 'organizer_reminder_sent',
        userId: recipientThree.id,
        createdAt: secondDeliveryAt,
        properties: deliveryProperties(vote.id, pool.id, 'POOL_VOTE_REMINDER', [
          'IN_APP',
        ]),
      }),
      createEvent({
        name: 'notification_clicked',
        userId: recipientOne.id,
        createdAt: daysBefore(now, 9),
        properties: { type: 'POOL_CONTRIBUTION_REMINDER' },
      }),
      createEvent({
        name: 'notification_clicked',
        userId: recipientThree.id,
        createdAt: daysBefore(now, 5),
        properties: { type: 'POOL_VOTE_REMINDER' },
      }),
      createEvent({
        name: 'organizer_reminder_skipped',
        userId: organizer.id,
        createdAt: daysBefore(now, 4),
        properties: { kind: 'VOTE', reason: 'NO_ELIGIBLE' },
      }),
      createEvent({
        name: 'organizer_reminder_skipped',
        userId: organizer.id,
        createdAt: daysBefore(now, 3),
        properties: { kind: 'VOTE', reason: 'COOLDOWN' },
      }),
      createEvent({
        name: 'organizer_reminder_skipped',
        userId: organizer.id,
        createdAt: daysBefore(now, 2),
        properties: { kind: 'VOTE', reason: 'WEEKLY_LIMIT' },
      }),
    ]);

    await Promise.all([
      prisma.notificationPreferenceAudit.create({
        data: {
          userId: recipientOne.id,
          kind: 'TOPIC',
          preferenceKey: 'ORGANIZER_NUDGES',
          channel: 'IN_APP',
          previousValue: 'true',
          newValue: 'false',
          source: 'test',
          createdAt: daysAfter(firstDeliveryAt, 1),
        },
      }),
      prisma.notificationPreferenceAudit.create({
        data: {
          userId: recipientTwo.id,
          kind: 'CONTEXT_ACTIVITY',
          contextKind: 'POOL',
          contextId: pool.id,
          previousValue: null,
          newValue: JSON.stringify({
            activityLevel: 'CUSTOM',
            customTopics: ['IDEAS_AND_VOTING'],
          }),
          source: 'test',
          createdAt: daysAfter(firstDeliveryAt, 2),
        },
      }),
      prisma.notificationPreferenceAudit.create({
        data: {
          userId: recipientThree.id,
          kind: 'TOPIC',
          preferenceKey: 'BIRTHDAY_REMINDERS',
          channel: 'IN_APP',
          previousValue: 'true',
          newValue: 'false',
          source: 'test',
          createdAt: daysAfter(secondDeliveryAt, 1),
        },
      }),
    ]);

    const metrics = await getOrganizerReminderMetrics({ days: 30, now });

    expect(metrics).toMatchObject({
      days: 30,
      queuedReminders: 3,
      targetedRecipients: 4,
      deliveredRecipients: 3,
      deliveryRate: 75,
      notificationClicks: 2,
      clickEventRate: 67,
      repeatSends: 1,
      skippedAttempts: { noEligible: 1, cooldown: 1, weeklyLimit: 1 },
      settingsReducedWithin7Days: 2,
    });
    expect(metrics.byKind).toEqual([
      expect.objectContaining({
        kind: 'CONTRIBUTION',
        queued: 2,
        targeted: 3,
        delivered: 2,
        clicks: 1,
      }),
      expect.objectContaining({
        kind: 'VOTE',
        queued: 1,
        targeted: 1,
        delivered: 1,
        clicks: 1,
      }),
      expect.objectContaining({
        kind: 'PURCHASE',
        queued: 0,
        targeted: 0,
        delivered: 0,
        clicks: 0,
      }),
      expect.objectContaining({
        kind: 'DELIVERY',
        queued: 0,
        targeted: 0,
        delivered: 0,
        clicks: 0,
      }),
    ]);

    // A nudge can be queued but deliver to nobody after a concurrent opt-out.
    expect(contributionTwo.targetCount).toBe(1);
  });

  it('returns stable zero rates when there is no reminder data', async () => {
    await expect(
      getOrganizerReminderMetrics({
        days: 27,
        now: new Date('2040-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      queuedReminders: 0,
      targetedRecipients: 0,
      deliveredRecipients: 0,
      deliveryRate: 0,
      notificationClicks: 0,
      clickEventRate: 0,
      repeatSends: 0,
      settingsReducedWithin7Days: 0,
    });
  });
});

function createNudge({
  poolId,
  senderId,
  kind,
  targetCount,
  createdAt,
}: {
  poolId: string;
  senderId: string;
  kind: string;
  targetCount: number;
  createdAt: Date;
}) {
  return prisma.organizerNudge.create({
    data: {
      poolId,
      senderId,
      kind,
      targetCount,
      idempotencyKey: randomUUID(),
      createdAt,
    },
  });
}

function createEvent({
  name,
  userId,
  properties,
  createdAt,
}: {
  name: string;
  userId: string;
  properties: Record<string, unknown>;
  createdAt: Date;
}) {
  return prisma.analyticsEvent.create({
    data: {
      eventId: randomUUID(),
      name,
      userId,
      source: 'server',
      properties: JSON.stringify(properties),
      createdAt,
    },
  });
}

function deliveryProperties(
  organizerNudgeId: string,
  poolId: string,
  notificationType: string,
  channels: string[],
) {
  return { organizerNudgeId, poolId, notificationType, channels };
}

function daysBefore(date: Date, days: number) {
  return new Date(date.getTime() - days * DAY_MS);
}

function daysAfter(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
