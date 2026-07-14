/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto';
import { type User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

const queueNotification = vi.fn();
const captureException = vi.fn();

vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));

vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}));

import {
  ORGANIZER_NUDGE_KIND_COOLDOWN_MS,
  ORGANIZER_NUDGE_KINDS,
  ORGANIZER_NUDGE_POOL_WINDOW_MS,
  OrganizerNudgeError,
  previewOrganizerNudge,
  sendOrganizerNudge,
} from './organizer-nudges.server.ts';

const createdUserIds: string[] = [];
const createdPoolIds: string[] = [];
const createdGroupIds: string[] = [];

afterEach(async () => {
  queueNotification.mockReset();
  captureException.mockReset();
  if (createdPoolIds.length > 0) {
    await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
  }
  if (createdGroupIds.length > 0) {
    await prisma.giftGroup.deleteMany({
      where: { id: { in: createdGroupIds } },
    });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdPoolIds.length = 0;
  createdGroupIds.length = 0;
  createdUserIds.length = 0;
});

describe('organizer nudge module', () => {
  it('returns only an aggregate count after privacy and preference suppression', async () => {
    const [organizer, eligible, muted, recipient] = await createUsers(
      'preview',
      4,
    );
    const pool = await createPool({
      organizerId: organizer.id,
      recipientUserId: recipient.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 2500 },
        { userId: eligible.id, contributionCents: null },
        { userId: muted.id, contributionCents: null },
        { userId: recipient.id, contributionCents: null },
      ],
    });
    await prisma.poolNotificationPreference.create({
      data: { userId: muted.id, poolId: pool.id, activityLevel: 'MUTED' },
    });

    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: organizer.id,
        kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      }),
    ).resolves.toMatchObject({ status: 'AVAILABLE', eligibleCount: 1 });
    await expect(
      prisma.organizerNudge.count({ where: { poolId: pool.id } }),
    ).resolves.toBe(0);
  });

  it('claims an audit and private recipients once, then replays idempotently', async () => {
    const [organizer, contributor] = await createUsers('send', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });

    const input = {
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      idempotencyKey: `test:${randomUUID()}`,
    };
    const first = await sendOrganizerNudge(input);
    expect(first).toMatchObject({ status: 'QUEUED', queuedCount: 1 });
    await vi.waitFor(() => expect(queueNotification).toHaveBeenCalledTimes(1));
    expect(queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: contributor.id,
        sourceIdentifier: expect.stringMatching(/^organizer-nudge:/),
        payload: expect.objectContaining({
          poolId: pool.id,
          senderDisplayName: organizer.name,
        }),
      }),
    );

    const replay = await sendOrganizerNudge(input);
    expect(replay).toMatchObject({
      status: 'QUEUED',
      nudgeId: first.status === 'QUEUED' ? first.nudgeId : '',
      queuedCount: 1,
    });
    await expect(
      prisma.organizerNudge.count({ where: { poolId: pool.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.organizerNudgeRecipient.findMany({
        where: { nudge: { poolId: pool.id } },
        select: { userId: true },
      }),
    ).resolves.toEqual([{ userId: contributor.id }]);
    expect(queueNotification).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent submissions with the same idempotency key', async () => {
    const [organizer, contributor] = await createUsers('concurrent', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });
    const input = {
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      idempotencyKey: `test:${randomUUID()}`,
    };

    const [first, second] = await Promise.all([
      sendOrganizerNudge(input),
      sendOrganizerNudge(input),
    ]);
    expect(first).toMatchObject({ status: 'QUEUED' });
    expect(second).toMatchObject({
      status: 'QUEUED',
      nudgeId: first.status === 'QUEUED' ? first.nudgeId : '',
    });
    await expect(
      prisma.organizerNudge.count({ where: { poolId: pool.id } }),
    ).resolves.toBe(1);
  });

  it('serializes distinct concurrent requests against the kind cooldown', async () => {
    const [organizer, contributor] = await createUsers('concurrent-limit', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });
    const input = {
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
    };

    const results = await Promise.all([
      sendOrganizerNudge({
        ...input,
        idempotencyKey: `test:${randomUUID()}`,
      }),
      sendOrganizerNudge({
        ...input,
        idempotencyKey: `test:${randomUUID()}`,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'COOLDOWN',
      'QUEUED',
    ]);
    await expect(
      prisma.organizerNudge.count({ where: { poolId: pool.id } }),
    ).resolves.toBe(1);
  });

  it('keeps a zero-recipient attempt as a no-op that consumes no limit', async () => {
    const [organizer, contributor] = await createUsers('noop', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: 2000 },
      ],
    });

    await expect(
      sendOrganizerNudge({
        poolId: pool.id,
        senderId: organizer.id,
        kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
        idempotencyKey: `test:${randomUUID()}`,
      }),
    ).resolves.toMatchObject({ status: 'NO_ELIGIBLE' });
    await expect(
      prisma.organizerNudge.count({ where: { poolId: pool.id } }),
    ).resolves.toBe(0);
    expect(queueNotification).not.toHaveBeenCalled();
  });

  it('enforces manager permission and current assignment state', async () => {
    const [organizer, member] = await createUsers('permission', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      purchaserId: organizer.id,
      status: 'DECIDED',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: member.id, contributionCents: 1000 },
      ],
    });

    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: member.id,
        kind: ORGANIZER_NUDGE_KINDS.PURCHASE,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<OrganizerNudgeError>);
    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: organizer.id,
        kind: ORGANIZER_NUDGE_KINDS.PURCHASE,
      }),
    ).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
    } satisfies Partial<OrganizerNudgeError>);
  });

  it('allows a current group admin who is also a pool contributor', async () => {
    const [organizer, admin, contributor] = await createUsers('admin', 3);
    const group = await prisma.giftGroup.create({
      data: {
        name: `Admin group ${randomUUID()}`,
        groupMembers: {
          create: { userId: admin.id, role: 'ADMIN' },
        },
      },
    });
    createdGroupIds.push(group.id);
    const pool = await createPool({
      organizerId: organizer.id,
      giftGroupId: group.id,
      status: 'OPEN',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: admin.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });

    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: admin.id,
        kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      }),
    ).resolves.toMatchObject({ status: 'AVAILABLE', eligibleCount: 1 });

    await prisma.usersInGiftGroups.update({
      where: {
        userId_giftGroupId: { userId: admin.id, giftGroupId: group.id },
      },
      data: { removedAt: new Date() },
    });
    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: admin.id,
        kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('uses exact 24-hour and rolling-seven-day unlock timestamps', async () => {
    const now = new Date();
    const [organizer, contributor] = await createUsers('limits', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'VOTING',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });
    const sentAt = new Date(now.getTime() - 60 * 60 * 1000);
    await createAudit({
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.VOTE,
      createdAt: sentAt,
      recipientId: contributor.id,
    });

    const cooldown = await previewOrganizerNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.VOTE,
    });
    expect(cooldown).toMatchObject({
      status: 'COOLDOWN',
      availableAt: new Date(
        sentAt.getTime() + ORGANIZER_NUDGE_KIND_COOLDOWN_MS,
      ),
    });

    await prisma.organizerNudge.deleteMany({ where: { poolId: pool.id } });
    const oldest = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    for (const [index, kind] of [
      ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      ORGANIZER_NUDGE_KINDS.PURCHASE,
      ORGANIZER_NUDGE_KINDS.DELIVERY,
    ].entries()) {
      await createAudit({
        poolId: pool.id,
        senderId: organizer.id,
        kind,
        createdAt: new Date(oldest.getTime() + index * 24 * 60 * 60 * 1000),
      });
    }

    const weekly = await previewOrganizerNudge({
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.VOTE,
    });
    expect(weekly).toMatchObject({
      status: 'WEEKLY_LIMIT',
      availableAt: new Date(oldest.getTime() + ORGANIZER_NUDGE_POOL_WINDOW_MS),
    });
  });

  it('applies the recipient/pool cooldown across different reminder kinds', async () => {
    const now = new Date();
    const [organizer, contributor] = await createUsers('recipient-limit', 2);
    const pool = await createPool({
      organizerId: organizer.id,
      status: 'VOTING',
      contributors: [
        { userId: organizer.id, contributionCents: 1000 },
        { userId: contributor.id, contributionCents: null },
      ],
    });
    await createAudit({
      poolId: pool.id,
      senderId: organizer.id,
      kind: ORGANIZER_NUDGE_KINDS.CONTRIBUTION,
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      recipientId: contributor.id,
    });

    await expect(
      previewOrganizerNudge({
        poolId: pool.id,
        senderId: organizer.id,
        kind: ORGANIZER_NUDGE_KINDS.VOTE,
      }),
    ).resolves.toMatchObject({ status: 'NO_ELIGIBLE' });
  });
});

function createUsers(prefix: string, count: 2): Promise<[User, User]>;
function createUsers(prefix: string, count: 3): Promise<[User, User, User]>;
function createUsers(
  prefix: string,
  count: 4,
): Promise<[User, User, User, User]>;
async function createUsers(prefix: string, count: number): Promise<User[]> {
  const users: User[] = [];
  for (let index = 0; index < count; index += 1) {
    const token = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${index}-${token}@organizer-nudge.test`,
        username: `${prefix}_${index}_${token.slice(0, 8)}`.slice(0, 20),
        name: `${prefix} user ${index}`,
      },
    });
    createdUserIds.push(user.id);
    users.push(user);
  }
  return users;
}

async function createPool({
  organizerId,
  recipientUserId = null,
  giftGroupId = null,
  purchaserId = null,
  delivererId = null,
  status,
  contributors,
}: {
  organizerId: string;
  recipientUserId?: string | null;
  giftGroupId?: string | null;
  purchaserId?: string | null;
  delivererId?: string | null;
  status: string;
  contributors: Array<{ userId: string; contributionCents: number | null }>;
}) {
  const pool = await prisma.pool.create({
    data: {
      title: `Nudge pool ${randomUUID()}`,
      organizerId,
      recipientUserId,
      giftGroupId,
      purchaserId,
      delivererId,
      status,
      contributors: { create: contributors },
    },
  });
  createdPoolIds.push(pool.id);
  return pool;
}

async function createAudit({
  poolId,
  senderId,
  kind,
  createdAt,
  recipientId,
}: {
  poolId: string;
  senderId: string;
  kind: string;
  createdAt: Date;
  recipientId?: string;
}) {
  return prisma.organizerNudge.create({
    data: {
      poolId,
      senderId,
      kind,
      idempotencyKey: `test:${randomUUID()}`,
      targetCount: recipientId ? 1 : 0,
      createdAt,
      recipients: recipientId ? { create: { userId: recipientId } } : undefined,
    },
  });
}
