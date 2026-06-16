/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const upsert = vi.fn();
const setNotificationPreference = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pushSubscription: {
      upsert: (...args: Array<unknown>) => upsert(...args),
    },
  },
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  setNotificationPreference: (...args: Array<unknown>) =>
    setNotificationPreference(...args),
}));

import { action } from './api.push.subscribe.ts';

const validBody = {
  subscription: {
    endpoint: 'https://push.example/abc',
    keys: { p256dh: 'p256', auth: 'authsecret' },
  },
};

function postRequest(body: unknown) {
  return new Request('https://giftpool.app/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'test-agent' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireUserId.mockReset();
  upsert.mockReset();
  setNotificationPreference.mockReset();
  requireUserId.mockResolvedValue('user-1');
  upsert.mockResolvedValue({});
  setNotificationPreference.mockResolvedValue({});
});

describe('api push subscribe action', () => {
  it('upserts the subscription by endpoint and does not enable prefs by default', async () => {
    const result = await action(
      toActionArgs({ context: {}, params: {}, request: postRequest(validBody) }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example/abc' },
        create: expect.objectContaining({
          userId: 'user-1',
          endpoint: 'https://push.example/abc',
          p256dh: 'p256',
          auth: 'authsecret',
        }),
      }),
    );
    expect(setNotificationPreference).not.toHaveBeenCalled();
  });

  it('enables push for every type when enableAll is set', async () => {
    await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ ...validBody, enableAll: true }),
      }),
    );

    expect(setNotificationPreference).toHaveBeenCalled();
    for (const call of setNotificationPreference.mock.calls) {
      expect(call[1]).toBeTypeOf('string'); // type
      expect(call[2]).toBe('WEB_PUSH'); // channel
      expect(call[3]).toBe(true); // enabled
    }
  });

  it('rejects an invalid subscription payload', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ subscription: { endpoint: 'not-a-url' } }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/api/push/subscribe', {
          method: 'GET',
        }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(405);
  });
});
