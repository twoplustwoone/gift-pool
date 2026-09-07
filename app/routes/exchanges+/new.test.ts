/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: () => ({ eventId: 'evt-1' }),
  drainQueuedAnalytics: async () => {},
}));
vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: () => {},
  queueExchangeNamesDrawn: () => {},
  queueExchangeRevealed: () => {},
  queueExchangeCancelled: () => {},
}));

import { action } from './new.tsx';

vi.setConfig({ testTimeout: 20_000 });

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

async function user(name: string) {
  return prisma.user.create({
    data: { ...createUser(), name },
    select: { id: true },
  });
}

async function cookieFor(userId: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });
  return getSessionCookieHeader(session);
}

function post(cookie: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return action(
    toActionArgs({
      context,
      params: {},
      request: new Request('https://www.giftpool.app/exchanges/new', {
        method: 'POST',
        headers: { cookie },
        body,
      }),
    }),
  );
}

const nextYear = new Date().getUTCFullYear() + 1;

let organizer: { id: string };
let member: { id: string };
let groupId: string;
beforeEach(async () => {
  [organizer, member] = await Promise.all([user('Francisco'), user('Nicolas')]);
  const group = await prisma.giftGroup.create({
    data: {
      name: 'The Painted',
      groupMembers: {
        create: [
          { userId: organizer.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
    },
  });
  groupId = group.id;
});

describe('POST /exchanges/new', () => {
  it('creates a group exchange from the form fields and redirects to it', async () => {
    const cookie = await cookieFor(organizer.id);
    const result = await post(cookie, {
      giftGroupId: groupId,
      title: 'The Painted 2026',
      occasionType: 'HOLIDAY',
      eventDate: `${nextYear}-12-24`,
      spendingGuideline: 'Around $50',
      revealMode: 'ORGANIZER',
      autoReveal: 'on',
      autoRevealDate: `${nextYear}-12-27`,
      avoidRepeats: 'on',
      exclusions: JSON.stringify([[organizer.id, member.id]]),
    });
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(302);
    const location = response.headers.get('location') ?? '';
    expect(location).toMatch(/^\/exchanges\/[a-z0-9]+$/);
    const exchange = await prisma.exchange.findFirstOrThrow({
      where: { giftGroupId: groupId },
      include: { exclusions: true, participants: true },
    });
    expect(exchange.title).toBe('The Painted 2026');
    expect(exchange.eventDate.toISOString()).toBe(
      `${nextYear}-12-24T00:00:00.000Z`,
    );
    expect(exchange.autoRevealAt?.toISOString()).toBe(
      `${nextYear}-12-27T09:00:00.000Z`,
    );
    expect(exchange.avoidRepeatsLookback).toBe(2);
    expect(exchange.exclusions).toHaveLength(1);
    expect(exchange.participants.map((p) => p.status).sort()).toEqual([
      'IN',
      'PENDING',
    ]);
  });

  it('keeps a secret-forever exchange free of an auto-reveal date', async () => {
    const cookie = await cookieFor(organizer.id);
    await post(cookie, {
      giftGroupId: groupId,
      title: 'Quiet one',
      occasionType: 'OTHER',
      eventDate: `${nextYear}-06-01`,
      revealMode: 'SECRET_FOREVER',
      autoReveal: 'on',
      avoidRepeats: 'off',
    });
    const exchange = await prisma.exchange.findFirstOrThrow({
      where: { title: 'Quiet one' },
    });
    expect(exchange.revealMode).toBe('SECRET_FOREVER');
    expect(exchange.autoRevealAt).toBeNull();
    expect(exchange.avoidRepeatsLookback).toBeNull();
  });

  it('returns field errors for a missing name and a past date', async () => {
    const cookie = await cookieFor(organizer.id);
    const missing = await post(cookie, {
      giftGroupId: groupId,
      title: '',
      occasionType: 'HOLIDAY',
      eventDate: `${nextYear}-12-24`,
    });
    expect(getRouteResultStatus(missing)).toBe(400);
    expect(
      await getRouteResultData<{ errors: { title?: string } }>(missing),
    ).toMatchObject({
      errors: { title: expect.any(String) },
    });
    const past = await post(cookie, {
      giftGroupId: groupId,
      title: 'Too late',
      occasionType: 'HOLIDAY',
      eventDate: '2020-01-01',
    });
    expect(getRouteResultStatus(past)).toBe(400);
    expect(
      await getRouteResultData<{ errors: { form?: string } }>(past),
    ).toMatchObject({
      errors: { form: expect.stringContaining('future') },
    });
    expect(await prisma.exchange.count()).toBe(0);
  });

  it('refuses a group the organizer is not in with the plain not-found', async () => {
    const stranger = await user('Stranger');
    const cookie = await cookieFor(stranger.id);
    const result = await post(cookie, {
      giftGroupId: groupId,
      title: 'Sneaky',
      occasionType: 'HOLIDAY',
      eventDate: `${nextYear}-12-24`,
    });
    expect(getRouteResultStatus(result)).toBe(404);
    expect(await prisma.exchange.count()).toBe(0);
  });
});
