/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserWithGroupPermission = vi.fn();
const requireUserWithGroupRole = vi.fn();
const usersInGiftGroupsFindUnique = vi.fn();
const usersInGiftGroupsUpdate = vi.fn();
const groupReminderDeleteMany = vi.fn();
const logGroupActivity = vi.fn();

vi.mock('./group-permissions.server', () => ({
  requireUserWithGroupPermission: (...args: Array<unknown>) =>
    requireUserWithGroupPermission(...args),
  requireUserWithGroupRole: (...args: Array<unknown>) =>
    requireUserWithGroupRole(...args),
}));

vi.mock('./db.server', () => ({
  prisma: {
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) =>
        usersInGiftGroupsFindUnique(...args),
      update: (...args: Array<unknown>) => usersInGiftGroupsUpdate(...args),
    },
    groupReminder: {
      deleteMany: (...args: Array<unknown>) => groupReminderDeleteMany(...args),
    },
  },
}));

vi.mock('./group-activity.server', () => ({
  logGroupActivity: (...args: Array<unknown>) => logGroupActivity(...args),
}));

vi.mock('./analytics.server', () => ({
  queueLogEvent: vi.fn(),
}));

vi.mock('./auth.server', () => ({
  requireUserId: vi.fn(),
}));

import { banMember, removeReminder } from './groups.server';

const statusOf = (err: unknown): number | undefined => {
  const e = err as { init?: { status?: number }; status?: number };
  return e?.init?.status ?? e?.status;
};

beforeEach(() => {
  requireUserWithGroupPermission.mockReset().mockResolvedValue('actor-1');
  requireUserWithGroupRole.mockReset().mockResolvedValue('actor-1');
  usersInGiftGroupsFindUnique.mockReset();
  usersInGiftGroupsUpdate.mockReset().mockResolvedValue(undefined);
  groupReminderDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  logGroupActivity.mockReset().mockResolvedValue(undefined);
});

describe('banMember target-role guard', () => {
  it('refuses to ban the owner', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ role: 'ADMIN' }) // actor
      .mockResolvedValueOnce({ role: 'OWNER' }); // target

    const promise = banMember(new Request('https://x'), 'g1', 'owner', null);
    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(400));
    expect(usersInGiftGroupsUpdate).not.toHaveBeenCalled();
  });

  it('refuses an admin banning a peer admin', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce({ role: 'ADMIN' });

    const promise = banMember(new Request('https://x'), 'g1', 'peer', null);
    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(403));
    expect(usersInGiftGroupsUpdate).not.toHaveBeenCalled();
  });

  it('allows an admin to ban a plain member', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    const until = new Date('2030-01-01');

    await banMember(new Request('https://x'), 'g1', 'member', until);

    expect(usersInGiftGroupsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannedUntil: until } }),
    );
  });

  it('404s when the target is not a member', async () => {
    usersInGiftGroupsFindUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce(null);

    const promise = banMember(new Request('https://x'), 'g1', 'ghost', null);
    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(404));
  });
});

describe('removeReminder scoping', () => {
  it('scopes the delete to the authorized group', async () => {
    await removeReminder(new Request('https://x'), 'g1', 'reminder-9');

    expect(groupReminderDeleteMany).toHaveBeenCalledWith({
      where: { id: 'reminder-9', giftGroupId: 'g1' },
    });
  });
});
