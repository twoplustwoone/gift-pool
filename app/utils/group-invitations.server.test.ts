/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// These mocks isolate the DB/auth boundary but leave the real permission check
// (`requireUserWithGroupPermission`) in place, so the test exercises the actual
// server-side authorization — not a mock of it.
const requireUserId = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const logGroupActivity = vi.fn();
const nanoid = vi.fn();

vi.mock('nanoid', () => ({
  nanoid: () => nanoid(),
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
    groupInvitation: {
      create: (...args: Array<unknown>) => create(...args),
    },
  },
}));

vi.mock('#app/utils/group-activity.server.ts', () => ({
  logGroupActivity: (...args: Array<unknown>) => logGroupActivity(...args),
}));

import { createInviteLink } from './group-invitations.server.ts';

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; init?: { status?: number } };
  return e?.init?.status ?? e?.status;
};

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  findUnique.mockReset();
  create.mockReset().mockResolvedValue({ code: 'new-code' });
  logGroupActivity.mockReset().mockResolvedValue(undefined);
  nanoid.mockReset().mockReturnValue('new-code');
});

const args = { giftGroupId: 'group-1', expiresInDays: '7' };

describe('createInviteLink server-side authorization', () => {
  it('rejects a MEMBER with 403 and never creates an invitation', async () => {
    findUnique.mockResolvedValue({ role: 'MEMBER' });

    const promise = createInviteLink(new Request('https://x'), args);

    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(403));
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a non-member with 403 and never creates an invitation', async () => {
    findUnique.mockResolvedValue(null);

    const promise = createInviteLink(new Request('https://x'), args);

    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(403));
    expect(create).not.toHaveBeenCalled();
  });

  it('allows an ADMIN to create an invitation', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });

    await createInviteLink(new Request('https://x'), args);

    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('createInviteLink role clamping', () => {
  it('rejects an ADMIN minting an OWNER-granting invite (finding #3)', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });

    const promise = createInviteLink(new Request('https://x'), {
      ...args,
      roleGranted: 'OWNER',
    });

    await expect(promise).rejects.toBeDefined();
    await promise.catch((err) => expect(statusOf(err)).toBe(403));
    expect(create).not.toHaveBeenCalled();
  });

  it('allows an ADMIN to grant ADMIN (equal rank)', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });

    await createInviteLink(new Request('https://x'), {
      ...args,
      roleGranted: 'ADMIN',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleGranted: 'ADMIN' }),
      }),
    );
  });

  it('allows an OWNER to mint an OWNER-granting invite', async () => {
    findUnique.mockResolvedValue({ role: 'OWNER' });

    await createInviteLink(new Request('https://x'), {
      ...args,
      roleGranted: 'OWNER',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleGranted: 'OWNER' }),
      }),
    );
  });
});
