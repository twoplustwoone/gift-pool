import { describe, expect, it } from 'vitest';
import {
  createPreferenceToken,
  verifyPreferenceToken,
} from '#app/utils/notification-preference-token.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts';

describe('notification preference tokens', () => {
  it('creates and verifies tokens', async () => {
    const token = await createPreferenceToken({
      userId: 'user-123',
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
    });
    const payload = verifyPreferenceToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.uid).toBe('user-123');
    expect(payload?.type).toBe(NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED);
  });

  it('fails verification when expired', async () => {
    const token = await createPreferenceToken({
      userId: 'user-123',
      ttlMs: -1000,
    });
    const payload = verifyPreferenceToken(token);
    expect(payload).toBeNull();
  });
});
