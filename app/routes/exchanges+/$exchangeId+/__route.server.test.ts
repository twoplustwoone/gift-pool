/**
 * @vitest-environment node
 */
// Route-boundary tests for the exchange page: a signed-in request through the
// real loader/action against the real module and database. The unit tests in
// exchanges.server.test.ts cover the domain rules; these cover what a browser
// actually gets back — and, above all, that every denial is the same 404.
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import {
  createExchange,
  drawNames,
  setParticipation,
} from '#app/utils/exchanges.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
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

import { action, loader } from './__route.server.ts';

vi.setConfig({ testTimeout: 20_000 });

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

const NOW = new Date('2026-12-01T12:00:00Z');
const EVENT = new Date('2026-12-24T00:00:00Z');

async function user(name: string) {
  return prisma.user.create({
    data: { ...createUser(), name },
    select: { id: true, username: true },
  });
}

async function cookieFor(userId: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });
  return getSessionCookieHeader(session);
}

async function fixture() {
  const [organizer, a, b, c, outsider] = await Promise.all([
    user('Francisco'),
    user('Nicolas P'),
    user('Nicolas B'),
    user('Agustin'),
    user('Outsider'),
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
  });
  const exchange = await createExchange({
    organizerId: organizer.id,
    title: 'The Painted 2026',
    eventDate: EVENT,
    giftGroupId: group.id,
    now: NOW,
  });
  return { organizer, a, b, c, outsider, group, exchangeId: exchange.id };
}

function get(exchangeId: string, cookie: string) {
  return loader(
    toLoaderArgs({
      context,
      params: { exchangeId },
      request: new Request(`https://www.giftpool.app/exchanges/${exchangeId}`, {
        headers: { cookie },
      }),
    }),
  );
}

function post(
  exchangeId: string,
  cookie: string,
  fields: Record<string, string>,
) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return action(
    toActionArgs({
      context,
      params: { exchangeId },
      request: new Request(`https://www.giftpool.app/exchanges/${exchangeId}`, {
        method: 'POST',
        headers: { cookie },
        body,
      }),
    }),
  );
}

async function settle(promise: Promise<unknown>) {
  try {
    const result = await promise;
    return { status: getRouteResultStatus(result), result };
  } catch (thrown) {
    return { status: getRouteResultStatus(thrown), result: thrown };
  }
}

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});

describe('exchange page loader', () => {
  it('returns the same 404 to an outsider as to a nonexistent id', async () => {
    const cookie = await cookieFor(f.outsider.id);
    const denied = await settle(get(f.exchangeId, cookie));
    const missing = await settle(get('nope', cookie));
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await getRouteResultData(denied.result)).toEqual(
      await getRouteResultData(missing.result),
    );
  });

  it('redirects a signed-out request to login', async () => {
    const { status } = await settle(get(f.exchangeId, ''));
    expect(status).toBe(302);
  });

  it('shapes the projection by role and never ships assignments', async () => {
    const organizer = await getRouteResultData<{
      view: { viewer: { role: string }; draw: unknown; exclusions: unknown };
    }>(await get(f.exchangeId, await cookieFor(f.organizer.id)));
    expect(organizer.view.viewer.role).toBe('ORGANIZER');
    expect(organizer.view.draw).not.toBeNull();
    const member = await getRouteResultData<{ view: Record<string, unknown> }>(
      await get(f.exchangeId, await cookieFor(f.a.id)),
    );
    expect(member.view.viewer).toMatchObject({
      role: 'MEMBER',
      participation: 'PENDING',
    });
    expect(member.view.draw).toBeNull();
    expect(JSON.stringify(member)).not.toContain('"assignments"');
  });
});

describe('exchange page action', () => {
  it('lets a member opt in and out', async () => {
    const cookie = await cookieFor(f.a.id);
    expect(
      (
        await settle(
          post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.OptIn }),
        )
      ).status,
    ).toBe(200);
    let row = await prisma.exchangeParticipant.findUniqueOrThrow({
      where: {
        exchangeId_userId: { exchangeId: f.exchangeId, userId: f.a.id },
      },
    });
    expect(row.status).toBe('IN');
    expect(
      (
        await settle(
          post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.OptOut }),
        )
      ).status,
    ).toBe(200);
    row = await prisma.exchangeParticipant.findUniqueOrThrow({
      where: {
        exchangeId_userId: { exchangeId: f.exchangeId, userId: f.a.id },
      },
    });
    expect(row.status).toBe('OUT');
  });

  it('returns domain refusals as data, not thrown responses, so the page survives', async () => {
    const cookie = await cookieFor(f.a.id);
    const { status, result } = await settle(
      post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.DrawNames }),
    );
    expect(status).toBe(403);
    expect(await getRouteResultData<{ error: string }>(result)).toMatchObject({
      error: expect.stringContaining('organizer'),
    });
    expect(result).not.toBeInstanceOf(Response);
  });

  it('draws names for the organizer once three people are in, and refuses before', async () => {
    const cookie = await cookieFor(f.organizer.id);
    const tooFew = await settle(
      post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.DrawNames }),
    );
    expect(tooFew.status).toBe(409);
    expect(
      await getRouteResultData<{ preview: { kind: string } }>(tooFew.result),
    ).toMatchObject({
      preview: { kind: 'TOO_FEW' },
    });
    await setParticipation({
      exchangeId: f.exchangeId,
      userId: f.a.id,
      status: 'IN',
    });
    await setParticipation({
      exchangeId: f.exchangeId,
      userId: f.b.id,
      status: 'IN',
    });
    const drawn = await settle(
      post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.DrawNames }),
    );
    expect(drawn.status).toBe(200);
    expect(await getRouteResultData(drawn.result)).toEqual({
      ok: true,
      drawn: true,
    });
    const exchange = await prisma.exchange.findUniqueOrThrow({
      where: { id: f.exchangeId },
    });
    expect(exchange.status).toBe('DRAWN');
  });

  it('refuses to reveal before the exchange date with a 409 the dialog can show', async () => {
    await setParticipation({
      exchangeId: f.exchangeId,
      userId: f.a.id,
      status: 'IN',
    });
    await setParticipation({
      exchangeId: f.exchangeId,
      userId: f.b.id,
      status: 'IN',
    });
    await drawNames({
      exchangeId: f.exchangeId,
      actorId: f.organizer.id,
      now: NOW,
    });
    const cookie = await cookieFor(f.organizer.id);
    const { status, result } = await settle(
      post(f.exchangeId, cookie, { intent: EXCHANGE_INTENT.Reveal }),
    );
    expect(status).toBe(409);
    expect(await getRouteResultData<{ error: string }>(result)).toMatchObject({
      error: expect.stringContaining('exchange date'),
    });
  });

  it('turns the auto-reveal switch off and on through update-settings', async () => {
    const cookie = await cookieFor(f.organizer.id);
    await post(f.exchangeId, cookie, {
      intent: EXCHANGE_INTENT.UpdateSettings,
      autoReveal: 'off',
    });
    let exchange = await prisma.exchange.findUniqueOrThrow({
      where: { id: f.exchangeId },
    });
    expect(exchange.autoRevealAt).toBeNull();
    await post(f.exchangeId, cookie, {
      intent: EXCHANGE_INTENT.UpdateSettings,
      autoReveal: 'on',
      autoRevealDate: '2026-12-28',
    });
    exchange = await prisma.exchange.findUniqueOrThrow({
      where: { id: f.exchangeId },
    });
    // 09:00 in the default (UTC) client-hint zone.
    expect(exchange.autoRevealAt?.toISOString()).toBe(
      '2026-12-28T09:00:00.000Z',
    );
  });

  it('rejects an unknown intent with a 400', async () => {
    const cookie = await cookieFor(f.organizer.id);
    const { status } = await settle(
      post(f.exchangeId, cookie, { intent: 'explode' }),
    );
    expect(status).toBe(400);
  });
});
