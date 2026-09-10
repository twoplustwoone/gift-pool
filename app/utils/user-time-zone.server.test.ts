/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

vi.mock('@sentry/react-router', () => ({ captureException: vi.fn() }));

import { queueTimeZoneUpdate } from './user-time-zone.server.ts';

// The update is fire-and-forget, so tests wait for the write rather than the
// call.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let userId: string;
beforeEach(async () => {
  const user = await prisma.user.create({
    data: createUser(),
    select: { id: true },
  });
  userId = user.id;
});

describe('queueTimeZoneUpdate', () => {
  it('remembers the zone so a note can be scheduled while they are offline', async () => {
    queueTimeZoneUpdate(userId, 'America/New_York');
    await settle();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).timeZone,
    ).toBe('America/New_York');
  });

  it('ignores a zone Intl cannot use, rather than sending every note to UTC', async () => {
    // The value comes from a client hint, so it is whatever the browser said.
    queueTimeZoneUpdate(userId, 'Mars/Base');
    await settle();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).timeZone,
    ).toBeNull();
  });

  it('does nothing for a signed-out request or a missing hint', async () => {
    queueTimeZoneUpdate(null, 'America/New_York');
    queueTimeZoneUpdate(userId, undefined);
    await settle();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).timeZone,
    ).toBeNull();
  });

  it('writes nothing when the zone has not changed', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { timeZone: 'Europe/London' },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { updatedAt: true },
    });
    queueTimeZoneUpdate(userId, 'Europe/London');
    await settle();
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { updatedAt: true, timeZone: true },
    });
    // Every page load calls this; the common case must not be a write.
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.timeZone).toBe('Europe/London');
  });
});
