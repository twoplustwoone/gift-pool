/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toActionArgs } from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const setContextActivityPreference = vi.fn();
const clearContextActivityPreference = vi.fn();
const dismissContextNotificationNotice = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  setContextActivityPreference: (...args: Array<unknown>) =>
    setContextActivityPreference(...args),
  clearContextActivityPreference: (...args: Array<unknown>) =>
    clearContextActivityPreference(...args),
  dismissContextNotificationNotice: (...args: Array<unknown>) =>
    dismissContextNotificationNotice(...args),
}));

import { action } from './api.notification-preferences.context.ts';

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue('user-1');
});

describe('context notification preference action', () => {
  it('sets a validated pool activity preference', async () => {
    await action(
      toActionArgs({
        context: {},
        params: {},
        request: formRequest({
          intent: 'set-activity',
          contextKind: 'POOL',
          contextId: 'pool-1',
          activityLevel: 'IMPORTANT_ONLY',
        }),
      }),
    );

    expect(setContextActivityPreference).toHaveBeenCalledWith({
      userId: 'user-1',
      context: { kind: 'POOL', poolId: 'pool-1' },
      activityLevel: 'IMPORTANT_ONLY',
      customTopics: [],
      source: 'context:notification-settings',
    });
  });

  it('clears overrides and dismisses awareness for group contexts', async () => {
    for (const intent of ['clear-activity', 'dismiss-notice'] as const) {
      await action(
        toActionArgs({
          context: {},
          params: {},
          request: formRequest({
            intent,
            contextKind: 'GROUP',
            contextId: 'group-1',
          }),
        }),
      );
    }

    expect(clearContextActivityPreference).toHaveBeenCalledWith({
      userId: 'user-1',
      context: { kind: 'GROUP', groupId: 'group-1' },
      source: 'context:notification-settings',
    });
    expect(dismissContextNotificationNotice).toHaveBeenCalledWith({
      userId: 'user-1',
      context: { kind: 'GROUP', groupId: 'group-1' },
      source: 'context:notification-settings',
    });
  });

  it('rejects invalid contexts before calling the preference module', async () => {
    await expect(
      action(
        toActionArgs({
          context: {},
          params: {},
          request: formRequest({
            intent: 'dismiss-notice',
            contextKind: 'ACCOUNT',
            contextId: 'user-1',
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(dismissContextNotificationNotice).not.toHaveBeenCalled();
  });
});

function formRequest(values: Record<string, string>) {
  return new Request(
    'https://giftpool.app/api/notification-preferences/context',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values).toString(),
    },
  );
}
