/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { REQUEST_ID_HEADER } from '#app/utils/request-context.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const queueLogEvent = vi.fn();
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

import { action } from './index.tsx';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

const ensureUserRole = () =>
  prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user' },
  });

async function createUserRecord(birthday?: Date) {
  await ensureUserRole();
  return prisma.user.create({
    data: {
      ...createUser(),
      birthday: birthday ?? null,
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });
}

async function withSession(userId: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });
  return getSessionCookieHeader(session);
}

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = aId < bId ? [aId, bId] : [bId, aId];
  await prisma.friendship.create({ data: { userAId, userBId } });
}

async function createGroupWith(
  members: Array<{ userId: string; contributionCents?: number }>,
) {
  const group = await prisma.giftGroup.create({ data: { name: 'The Crew' } });
  for (const m of members) {
    await prisma.usersInGiftGroups.create({
      data: {
        userId: m.userId,
        giftGroupId: group.id,
        contributionCents: m.contributionCents ?? 0,
      },
    });
  }
  return group;
}

function invoke(
  username: string,
  cookie: string,
  fields: Record<string, string>,
) {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.set(k, v);
  const request = new Request('https://www.giftpool.app/users/' + username, {
    body: formData,
    headers: { cookie, [REQUEST_ID_HEADER]: 'req-1' },
    method: 'POST',
  });
  return action(toActionArgs({ context, params: { username }, request }));
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    return getRouteResultStatus(await promise);
  } catch (thrown) {
    return getRouteResultStatus(thrown);
  }
}

beforeEach(() => {
  queueLogEvent.mockReset();
  queueLogEvent.mockReturnValue({ eventId: 'evt-1' });
});

describe('person surface write authorization', () => {
  it('rejects save-idea / add-note / solo-commit for a stranger (neither friend nor groupmate)', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    const cookie = await withSession(viewer.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, { intent: 'save-idea', name: 'Shoes' }),
      ),
    ).toBe(403);
    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'add-note',
          body: 'Runs now',
        }),
      ),
    ).toBe(403);
    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'solo-commit',
          name: 'Book',
        }),
      ),
    ).toBe(403);

    expect(await prisma.giftListItem.count()).toBe(0);
    expect(await prisma.personNote.count()).toBe(0);
    expect(await prisma.pool.count()).toBe(0);
  });

  it('allows solo-commit for a groupmate who is NOT a friend, seeding a recipient-excluded pool-of-one', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    await createGroupWith([
      { userId: viewer.id, contributionCents: 5000 },
      { userId: target.id, contributionCents: 4000 },
    ]);
    const cookie = await withSession(viewer.id);

    const status = await statusOf(
      invoke(target.username, cookie, {
        intent: 'solo-commit',
        name: 'Trail shoes',
      }),
    );
    expect(status).toBe(200);

    const pool = await prisma.pool.findFirstOrThrow({
      include: { contributors: true },
    });
    expect(pool.title).toBe('Trail shoes');
    expect(pool.organizerId).toBe(viewer.id);
    expect(pool.recipientUserId).toBe(target.id);
    expect(pool.giftGroupId).toBeNull();
    // Recipient is never a contributor; a pool-of-one has exactly the organizer.
    expect(pool.contributors).toHaveLength(1);
    expect(pool.contributors[0]!.userId).toBe(viewer.id);
  });

  it('allows save-idea and add-note for a friend and writes owner/target + author/subject correctly', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    const cookie = await withSession(viewer.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'save-idea',
          name: 'Ceramics class',
          priceCents: '120',
        }),
      ),
    ).toBe(200);
    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'add-note',
          body: 'Buys everything himself — go novelty.',
        }),
      ),
    ).toBe(200);

    const idea = await prisma.giftListItem.findFirstOrThrow();
    expect(idea.ownerId).toBe(viewer.id);
    expect(idea.targetUserId).toBe(target.id);
    expect(idea.priceCents).toBe(12000); // dollars → cents

    const note = await prisma.personNote.findFirstOrThrow();
    expect(note.authorId).toBe(viewer.id);
    expect(note.subjectUserId).toBe(target.id);
  });

  it('never lets the recipient act on their own surface', async () => {
    const viewer = await createUserRecord();
    const cookie = await withSession(viewer.id);
    // Acting on your own username → 404 (recipient never sees this surface).
    expect(
      await statusOf(
        invoke(viewer.username, cookie, { intent: 'save-idea', name: 'x' }),
      ),
    ).toBe(404);
  });

  it('decline is self-scoped: creates one row for the current cycle, undo removes it', async () => {
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const viewer = await createUserRecord();
    const target = await createUserRecord(nextMonth);
    await makeFriends(viewer.id, target.id);
    const cookie = await withSession(viewer.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, { intent: 'decline-occasion' }),
      ),
    ).toBe(200);
    const decline = await prisma.occasionDecline.findFirstOrThrow();
    expect(decline.userId).toBe(viewer.id);
    expect(decline.targetUserId).toBe(target.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, { intent: 'undo-decline' }),
      ),
    ).toBe(200);
    expect(await prisma.occasionDecline.count()).toBe(0);
  });

  it('propose-to-pool rejects a viewer who is not a contributor of the pool', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    const other = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    // An OPEN pool the viewer is NOT part of.
    const pool = await prisma.pool.create({
      data: {
        title: 'Their pool',
        organizerId: other.id,
        recipientUserId: target.id,
        status: 'OPEN',
        contributors: { create: [{ userId: other.id }] },
      },
    });
    const cookie = await withSession(viewer.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'propose-to-pool',
          poolId: pool.id,
          name: 'Espresso machine',
        }),
      ),
    ).toBe(404);
    expect(await prisma.giftIdea.count()).toBe(0);
  });

  it('propose-to-pool promotes a saved idea and links it (giftListItemId)', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    const pool = await prisma.pool.create({
      data: {
        title: 'Our pool',
        organizerId: viewer.id,
        recipientUserId: target.id,
        status: 'OPEN',
        contributors: { create: [{ userId: viewer.id }] },
      },
    });
    const saved = await prisma.giftListItem.create({
      data: {
        ownerId: viewer.id,
        targetUserId: target.id,
        name: 'Trail shoes',
      },
    });
    const cookie = await withSession(viewer.id);

    expect(
      await statusOf(
        invoke(target.username, cookie, {
          intent: 'propose-to-pool',
          poolId: pool.id,
          name: 'Trail shoes',
          giftListItemId: saved.id,
        }),
      ),
    ).toBe(200);

    const idea = await prisma.giftIdea.findFirstOrThrow();
    expect(idea.poolId).toBe(pool.id);
    expect(idea.giftListItemId).toBe(saved.id);
  });

  it('record-outcome rejects a non-owner and accepts the pool organizer', async () => {
    const organizer = await createUserRecord();
    const target = await createUserRecord();
    const stranger = await createUserRecord();
    await makeFriends(organizer.id, target.id);

    const pool = await prisma.pool.create({
      data: {
        title: 'Solo gift',
        organizerId: organizer.id,
        recipientUserId: target.id,
      },
    });

    // A different user cannot record the outcome.
    const strangerCookie = await withSession(stranger.id);
    expect(
      await statusOf(
        invoke(target.username, strangerCookie, {
          intent: 'record-outcome',
          kind: 'pool',
          poolId: pool.id,
          feedback: 'LOVED',
        }),
      ),
    ).toBe(404);

    // The organizer can.
    const organizerCookie = await withSession(organizer.id);
    expect(
      await statusOf(
        invoke(target.username, organizerCookie, {
          intent: 'record-outcome',
          kind: 'pool',
          poolId: pool.id,
          feedback: 'LOVED',
        }),
      ),
    ).toBe(200);
    const updated = await prisma.pool.findUniqueOrThrow({
      where: { id: pool.id },
    });
    expect(updated.outcomeFeedback).toBe('LOVED');
  });
});
