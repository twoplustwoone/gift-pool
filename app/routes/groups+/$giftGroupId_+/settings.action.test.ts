/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateOwnPreferences = vi.fn();

// settings.tsx imports the whole groups.server surface at module load — stub
// every name so the module evaluates, and capture updateOwnPreferences.
vi.mock('#app/utils/groups.server.ts', () => ({
  updateOwnPreferences: (...args: Array<unknown>) =>
    updateOwnPreferences(...args),
  requireUserIdInGroup: vi.fn(),
  addReminder: vi.fn(),
  approveJoinRequest: vi.fn(),
  banMember: vi.fn(),
  rejectJoinRequest: vi.fn(),
  removeMember: vi.fn(),
  removeReminder: vi.fn(),
  transferOwnership: vi.fn(),
  updateGroupSettings: vi.fn(),
  promoteToAdmin: vi.fn(),
  demoteAdminToMember: vi.fn(),
  deleteGiftGroup: vi.fn(),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  createToastHeaders: vi.fn(async () => ({})),
}));

import { action } from './settings.tsx';

function memberUpdateSelfRequest(fields: Record<string, string>) {
  const formData = new FormData();
  formData.set('intent', 'member-update-self');
  formData.set('giftGroupId', 'group-1');
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return new Request('https://giftpool.app/groups/group-1/settings', {
    method: 'POST',
    body: formData,
  });
}

describe('settings action — member-update-self is a partial update', () => {
  beforeEach(() => updateOwnPreferences.mockReset());

  it('does not reset budget visibility when only the cap is submitted', async () => {
    // The Overview budget editor sends only contributionCents.
    await action({
      request: memberUpdateSelfRequest({ contributionCents: '2500' }),
    } as never);

    expect(updateOwnPreferences).toHaveBeenCalledWith(
      expect.any(Request),
      'group-1',
      expect.objectContaining({
        contributionCents: 2500,
      }),
    );
  });
});
