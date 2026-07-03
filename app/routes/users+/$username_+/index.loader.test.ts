/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const findFirst = vi.fn();
const getRelationshipDetails = vi.fn();
const loadProfilePageData = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => findFirst(...args),
    },
  },
}));

vi.mock('#app/utils/friends.server.ts', () => ({
  getRelationshipDetails: (...args: Array<unknown>) =>
    getRelationshipDetails(...args),
}));

vi.mock('#app/utils/profile-page.server.ts', () => ({
  loadProfilePageData: (...args: Array<unknown>) => loadProfilePageData(...args),
}));

import { loader } from './index.tsx';

function setup(birthdayVisibility: string) {
  requireUserId.mockResolvedValue('viewer-1');
  // First findFirst: the lightweight targetUser lookup.
  findFirst.mockResolvedValueOnce({
    id: 'target-1',
    name: 'Alex',
    username: 'alex',
    image: { id: 'image-1' },
  });
  // The viewer is a confirmed friend, so the gated branch is reached.
  getRelationshipDetails.mockResolvedValue({
    state: 'FRIENDS',
    friendship: { id: 'friendship-1' },
  });
  // Second findFirst: the full profile including birthdayVisibility.
  findFirst.mockResolvedValueOnce({
    id: 'target-1',
    name: 'Alex',
    username: 'alex',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    bio: null,
    birthday: new Date('1990-04-15T12:00:00.000Z'),
    birthdayVisibility,
    image: { id: 'image-1' },
  });
  loadProfilePageData.mockResolvedValue({
    mutualGroups: [],
    mutualFriends: [],
    wishlistPreview: { items: [], totalCount: 0 },
  });
}

async function runLoader() {
  return loader({
    context: {},
    params: { username: 'alex' },
    request: new Request('https://giftpool.app/users/alex'),
  } as never);
}

describe('app/routes/users+/$username_+/index.tsx loader — birthday visibility', () => {
  it('marks the birthday hidden for a NOBODY target even though the viewer is a friend', async () => {
    setup('NOBODY');
    const result = (await runLoader()) as { birthdayVisible: boolean };
    expect(result.birthdayVisible).toBe(false);
  });

  it('marks the birthday visible for a non-NOBODY target when the viewer is a friend', async () => {
    setup('FRIENDS');
    const result = (await runLoader()) as { birthdayVisible: boolean };
    expect(result.birthdayVisible).toBe(true);
  });
});
