/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { toActionArgs } from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

import { action } from './__group-editor.server.tsx';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

function createFormRequest(form: Record<string, string>) {
  return new Request('https://giftpool.app/groups/new', {
    body: new URLSearchParams(form),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

describe('group create action', () => {
  it('records the acting user as the group creator', async () => {
    const user = await prisma.user.create({ data: createUser() });
    requireUserId.mockResolvedValue(user.id);

    const result = await action(
      toActionArgs({
        context,
        params: {},
        request: createFormRequest({ name: 'Birthday Squad' }),
      }),
    );

    // The create branch redirects to the new group on success.
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);

    const group = await prisma.giftGroup.findFirstOrThrow({
      where: { name: 'Birthday Squad' },
      include: { groupMembers: true },
    });

    expect(group.createdById).toBe(user.id);
    // Provenance is recorded alongside the OWNER membership, not instead of it.
    expect(group.groupMembers).toEqual([
      expect.objectContaining({ userId: user.id, role: 'OWNER' }),
    ]);
  });
});
