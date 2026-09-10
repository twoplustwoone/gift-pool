/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

const fanOut = vi.hoisted(() => ({ reminder: vi.fn() }));
vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: vi.fn(),
  queueExchangeNamesDrawn: vi.fn(),
  queueExchangeRevealed: vi.fn(),
  queueExchangeCancelled: vi.fn(),
  queueExchangeNotesDelivered: vi.fn(),
  queueExchangeSpliceNotices: vi.fn(),
  queueExchangeReminder: (...args: Array<unknown>) => fanOut.reminder(...args),
}));

import { EXCHANGE_STATUS } from './exchange-constants.ts';
import {
  previewExchangeReminder,
  REMINDER_KIND_COOLDOWN_MS,
  sendExchangeReminder,
} from './exchange-reminders.server.ts';
import { createExchange, setParticipation } from './exchanges.server.ts';

vi.setConfig({ testTimeout: 20_000 });

const NOW = new Date('2026-12-01T12:00:00Z');
const EVENT = new Date('2026-12-24T00:00:00Z');

const makeUser = (name: string) =>
  prisma.user.create({ data: { ...createUser(), name }, select: { id: true } });

let f: Awaited<ReturnType<typeof makeFixture>>;

async function makeFixture() {
  const [organizer, a, b, c] = await Promise.all([
    makeUser('Francisco'),
    makeUser('Nicolas'),
    makeUser('Agustin'),
    makeUser('Juan'),
  ]);
  const group = await prisma.giftGroup.create({
    data: {
      name: 'The Painted',
      groupMembers: {
        create: [organizer, a, b, c].map((u, i) => ({
          userId: u.id,
          role: i === 0 ? 'OWNER' : 'MEMBER',
        })),
      },
    },
    select: { id: true },
  });
  const { id } = await createExchange({
    organizerId: organizer.id,
    title: 'The Painted 2026',
    eventDate: EVENT,
    giftGroupId: group.id,
    now: NOW,
  });
  return { id, group, organizer, a, b, c };
}

beforeEach(async () => {
  fanOut.reminder.mockClear();
  f = await makeFixture();
});

describe('previewExchangeReminder', () => {
  it('counts who has not answered, and never says who they are', async () => {
    const preview = await previewExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      now: NOW,
    });
    expect(preview).toEqual({
      status: 'AVAILABLE',
      kind: 'ANSWER',
      eligibleCount: 3,
    });
    // The organizer is told how many, never which.
    expect(JSON.stringify(preview)).not.toContain(f.a.id);
  });

  it('has nothing to send once everyone has answered', async () => {
    for (const u of [f.a, f.b, f.c]) {
      await setParticipation({
        exchangeId: f.id,
        userId: u.id,
        status: 'OUT',
        now: NOW,
      });
    }
    expect(
      await previewExchangeReminder({
        exchangeId: f.id,
        actorId: f.organizer.id,
        now: NOW,
      }),
    ).toEqual({ status: 'NO_ELIGIBLE', kind: 'ANSWER' });
  });

  it('does not count someone who has turned exchange reminders off', async () => {
    // Sending to an audience that would receive nothing would still burn the
    // day's reminder and tell the organizer it reached people.
    await prisma.notificationTopicPreference.createMany({
      data: ['IN_APP', 'EMAIL', 'WEB_PUSH'].map((channel) => ({
        userId: f.a.id,
        topic: 'EXCHANGE_REMINDERS',
        channel,
        enabled: false,
      })),
    });
    const preview = await previewExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      now: NOW,
    });
    expect(preview).toEqual({
      status: 'AVAILABLE',
      kind: 'ANSWER',
      eligibleCount: 2,
    });
  });

  it('stops applying once the names are drawn', async () => {
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.DRAWN },
    });
    expect(
      await previewExchangeReminder({
        exchangeId: f.id,
        actorId: f.organizer.id,
        now: NOW,
      }),
    ).toEqual({ status: 'NOT_APPLICABLE', kind: 'ANSWER' });
  });

  it("is the organizer's to send, and nobody else's", async () => {
    await expect(
      previewExchangeReminder({
        exchangeId: f.id,
        actorId: f.a.id,
        now: NOW,
      }),
    ).rejects.toBeDefined();
  });
});

describe('sendExchangeReminder', () => {
  it('records the send and fans out to the people who have not answered', async () => {
    const result = await sendExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      idempotencyKey: 'k1',
      now: NOW,
    });
    expect(result).toEqual({
      status: 'QUEUED',
      kind: 'ANSWER',
      targetCount: 3,
    });
    expect(fanOut.reminder).toHaveBeenCalledWith(f.id, {
      senderId: f.organizer.id,
      giftGroupId: f.group.id,
    });

    const rows = await prisma.exchangeReminder.findMany({
      where: { exchangeId: f.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetCount).toBe(3);
  });

  it('treats a double tap as one reminder', async () => {
    await sendExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      idempotencyKey: 'same',
      now: NOW,
    });
    const again = await sendExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      idempotencyKey: 'same',
      now: NOW,
    });
    expect(again).toEqual({ status: 'QUEUED', kind: 'ANSWER', targetCount: 3 });
    expect(
      await prisma.exchangeReminder.count({ where: { exchangeId: f.id } }),
    ).toBe(1);
    // The second tap sends nothing to anyone.
    expect(fanOut.reminder).toHaveBeenCalledTimes(1);
  });

  it('holds the next one for a day', async () => {
    await sendExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      idempotencyKey: 'k1',
      now: NOW,
    });
    const soon = await previewExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(soon.status).toBe('COOLDOWN');

    // A different idempotency key must not get around it.
    let caught: unknown;
    try {
      await sendExchangeReminder({
        exchangeId: f.id,
        actorId: f.organizer.id,
        idempotencyKey: 'k2',
        now: new Date(NOW.getTime() + 60_000),
      });
    } catch (err) {
      caught = err;
    }
    expect(
      (caught as { init?: { status?: number } })?.init?.status ?? 200,
    ).toBe(200);
    expect(
      await prisma.exchangeReminder.count({ where: { exchangeId: f.id } }),
    ).toBe(1);

    // A day later it is available again.
    const later = await previewExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      now: new Date(NOW.getTime() + REMINDER_KIND_COOLDOWN_MS + 1000),
    });
    expect(later.status).toBe('AVAILABLE');
  });

  it('stops at three in a week, however far apart they are', async () => {
    const day = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 3; i++) {
      await sendExchangeReminder({
        exchangeId: f.id,
        actorId: f.organizer.id,
        idempotencyKey: `k${i}`,
        now: new Date(NOW.getTime() + i * 2 * day),
      });
    }
    const fourth = await previewExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      now: new Date(NOW.getTime() + 6 * day),
    });
    expect(fourth.status).toBe('WEEKLY_LIMIT');
    // A fourth send comes back as data rather than throwing — the page posts
    // with a fetcher, and a thrown response would replace it with the error
    // boundary instead of saying why.
    const refused = await sendExchangeReminder({
      exchangeId: f.id,
      actorId: f.organizer.id,
      idempotencyKey: 'k4',
      now: new Date(NOW.getTime() + 6 * day),
    });
    expect(refused.status).toBe('WEEKLY_LIMIT');
    expect(
      await prisma.exchangeReminder.count({ where: { exchangeId: f.id } }),
    ).toBe(3);
  });
});
