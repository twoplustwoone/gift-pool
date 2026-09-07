/**
 * @vitest-environment node
 */
// The group overview carries the current exchange for the viewer: join prompt
// state for a member who hasn't answered, dismissal persistence, and nothing
// once the exchange is over.
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  cancelExchange,
  createExchange,
  dismissJoinPrompt,
} from '#app/utils/exchanges.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
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

import { loader } from './index.tsx';

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

type Summary = {
  exchange: {
    exchange: { id: string; status: string };
    viewer: {
      isOrganizer: boolean;
      participation: string | null;
      dismissedJoinPrompt: boolean;
    };
  } | null;
};

async function load(groupId: string, cookie: string) {
  const result = await loader(
    toLoaderArgs({
      context,
      params: { giftGroupId: groupId },
      request: new Request(`https://www.giftpool.app/groups/${groupId}`, {
        headers: { cookie },
      }),
    }),
  );
  return getRouteResultData<Summary>(result);
}

let organizer: { id: string };
let member: { id: string };
let groupId: string;
beforeEach(async () => {
  [organizer, member] = await Promise.all([user('Francisco'), user('Juan')]);
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

describe('group overview exchange summary', () => {
  it('is null with no active exchange', async () => {
    const data = await load(groupId, await cookieFor(member.id));
    expect(data.exchange).toBeNull();
  });

  it('shows a pending member the prompt, remembers the dismissal, and drops it once cancelled', async () => {
    const { id } = await createExchange({
      organizerId: organizer.id,
      title: 'The Painted 2026',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      giftGroupId: groupId,
    });
    const cookie = await cookieFor(member.id);
    let data = await load(groupId, cookie);
    expect(data.exchange?.exchange.id).toBe(id);
    expect(data.exchange?.viewer).toEqual({
      isOrganizer: false,
      participation: 'PENDING',
      dismissedJoinPrompt: false,
    });

    await dismissJoinPrompt({ exchangeId: id, userId: member.id });
    data = await load(groupId, cookie);
    expect(data.exchange?.viewer.dismissedJoinPrompt).toBe(true);

    const organizerData = await load(groupId, await cookieFor(organizer.id));
    expect(organizerData.exchange?.viewer).toMatchObject({
      isOrganizer: true,
      participation: 'IN',
    });

    await cancelExchange({ exchangeId: id, actorId: organizer.id });
    data = await load(groupId, cookie);
    expect(data.exchange).toBeNull();
  });
});
