/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserIdInGroup = vi.fn();

vi.mock('#app/utils/groups.server.ts', () => ({
  requireUserIdInGroup: (...args: Array<unknown>) =>
    requireUserIdInGroup(...args),
}));

import { loader } from './members.tsx';

beforeEach(() => {
  requireUserIdInGroup.mockReset().mockResolvedValue('viewer-1');
});

describe('members tab loader — membership gate', () => {
  it('requires the viewer to be a member of the group', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    expect(requireUserIdInGroup).toHaveBeenCalledWith(
      expect.any(Request),
      'group-1',
    );
    // The roster itself comes from the layout loader, so this loader returns
    // nothing of its own.
    expect(result).toBeNull();
  });
});
