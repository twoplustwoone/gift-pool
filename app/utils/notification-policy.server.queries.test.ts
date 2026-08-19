/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_TYPES,
  type NotificationContext,
} from '#app/utils/notification-catalog.ts';

// Regression harness for GIFTPOOL-UI-1M/-1P/-1Q/-1R.
//
// The equivalence tests in notification-policy.server.test.ts prove the bulk
// resolver returns the right answers; they cannot see HOW it gets them, and a
// resolver that loops per user returns identical answers right up until a real
// pool times out. So this file counts Prisma calls instead of comparing
// results, and asserts the two properties the outage was actually about:
//
//   1. the statement count does not grow with the audience, and
//   2. no interactive transaction (`$transaction(fn)`) is opened, because
//      Prisma opens those with BEGIN IMMEDIATE — SQLite's single-holder write
//      lock — even when every statement inside is a read.
//
// Counting stubs rather than a real database keeps this deterministic and
// makes the failure message point straight at the offending call.
const calls: Array<{ model: string; method: string; args: unknown }> = [];
const interactiveTransactions = vi.fn();

function record(model: string, method: string, result: unknown) {
  return (...args: Array<unknown>) => {
    calls.push({ model, method, args: args[0] });
    return Promise.resolve(result);
  };
}

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    // Array form batches independent statements into one round trip and holds
    // no lock across user code; the callback form is the one that hurt us.
    $transaction: (arg: unknown) => {
      if (typeof arg === 'function') {
        interactiveTransactions(arg);
        throw new Error(
          'Policy resolution opened an interactive $transaction(fn). This is ' +
            'what caused GIFTPOOL-UI-1M/-1P/-1Q/-1R: Prisma opens it with ' +
            'BEGIN IMMEDIATE, so concurrent un-awaited fan-out dispatches ' +
            'serialise behind SQLite’s write lock until their 5s timers expire.',
        );
      }
      calls.push({ model: '$transaction', method: 'batch', args: undefined });
      return Promise.all(arg as Array<Promise<unknown>>);
    },
    pool: { findUnique: record('pool', 'findUnique', poolRow()) },
    notificationChannelPreference: {
      findMany: record('notificationChannelPreference', 'findMany', []),
    },
    notificationCategoryPreference: {
      findMany: record('notificationCategoryPreference', 'findMany', []),
    },
    notificationTopicPreference: {
      findMany: record('notificationTopicPreference', 'findMany', []),
    },
    groupNotificationPreference: {
      findMany: record('groupNotificationPreference', 'findMany', []),
    },
    poolNotificationPreference: {
      findMany: record('poolNotificationPreference', 'findMany', []),
    },
  },
}));

function poolRow() {
  return {
    giftGroupId: 'group-1',
    notificationPreferences: [],
    giftGroup: { notificationPreferences: [] },
  };
}

const { resolveNotificationPoliciesForUsers } =
  await import('./notification-policy.server.ts');

const POOL_CONTEXT: NotificationContext = { kind: 'POOL', poolId: 'pool-1' };

const userIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `user-${index}`);

beforeEach(() => {
  calls.length = 0;
  interactiveTransactions.mockClear();
});

describe('resolveNotificationPoliciesForUsers query shape', () => {
  it('issues the same statements for 2 recipients as for 50', async () => {
    await resolveNotificationPoliciesForUsers({
      userIds: userIds(2),
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context: POOL_CONTEXT,
    });
    const small = calls.map((call) => `${call.model}.${call.method}`).sort();

    calls.length = 0;
    await resolveNotificationPoliciesForUsers({
      userIds: userIds(50),
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context: POOL_CONTEXT,
    });
    const large = calls.map((call) => `${call.model}.${call.method}`).sort();

    expect(large).toEqual(small);
  });

  it('reads the pool once for the whole audience, not once per recipient', async () => {
    const ids = userIds(50);
    await resolveNotificationPoliciesForUsers({
      userIds: ids,
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context: POOL_CONTEXT,
    });

    const poolReads = calls.filter((call) => call.model === 'pool');
    expect(poolReads).toHaveLength(1);
    // ...and it asks for every recipient's rows in that one read.
    expect(poolReads[0]!.args).toMatchObject({
      select: {
        notificationPreferences: { where: { userId: { in: ids } } },
        giftGroup: {
          select: {
            notificationPreferences: { where: { userId: { in: ids } } },
          },
        },
      },
    });
  });

  it('never opens an interactive transaction', async () => {
    await resolveNotificationPoliciesForUsers({
      userIds: userIds(50),
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context: POOL_CONTEXT,
    });

    expect(interactiveTransactions).not.toHaveBeenCalled();
  });

  it('issues no queries at all for an empty audience', async () => {
    const policies = await resolveNotificationPoliciesForUsers({
      userIds: [],
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context: POOL_CONTEXT,
    });

    expect(policies.size).toBe(0);
    expect(calls.filter((call) => call.model === 'pool')).toHaveLength(0);
  });
});
