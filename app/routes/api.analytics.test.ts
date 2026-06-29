/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toActionArgs } from '#tests/route-module-test-utils.ts';

const getUserId = vi.fn();
const logClientEnvironmentObservation = vi.fn();
const logEvent = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({
  logClientEnvironmentObservation: (...args: Array<unknown>) =>
    logClientEnvironmentObservation(...args),
  logEvent: (...args: Array<unknown>) => logEvent(...args),
}));

vi.mock('#app/utils/request-context.server.ts', () => ({
  getRequestContext: vi.fn(async () => ({
    requestId: 'req-1',
    sessionId: null,
    visitorId: 'visitor-1',
  })),
  applyRequestIdHeader: vi.fn(() => new Headers()),
}));

import { action, loader } from './api.analytics.ts';

function postEvent(body: Record<string, unknown>) {
  return action(
    toActionArgs({
      context: {} as never,
      params: {},
      request: new Request('https://giftpool.app/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    }),
  );
}

describe('/api/analytics', () => {
  beforeEach(() => {
    getUserId.mockReset().mockResolvedValue(null);
    logClientEnvironmentObservation.mockReset().mockResolvedValue({
      eventId: 'client-environment-1',
    });
    logEvent.mockReset().mockResolvedValue({ eventId: 'evt-1' });
  });

  it('rejects non-POST requests', async () => {
    const result = await loader();
    expect(result.init?.status).toBe(405);
  });

  it('rejects unregistered event names', async () => {
    const result = await postEvent({ name: 'made_up_event' });
    expect(result.init?.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('401s anonymous posts of user-required events', async () => {
    const result = await postEvent({ name: 'wishlist_item_added' });
    expect(result.init?.status).toBe(401);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('accepts anonymous posts of non-user-required events with the visitor id', async () => {
    const result = await postEvent({
      name: 'home_cta_clicked',
      properties: { cta: 'create_wishlist' },
    });
    expect(result.init?.status ?? 200).toBe(200);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'home_cta_clicked',
        userId: null,
        source: 'client',
        visitorId: 'visitor-1',
      }),
    );
  });

  it('logs user-required events for authenticated users', async () => {
    getUserId.mockResolvedValue('user-1');
    const result = await postEvent({
      name: 'wishlist_item_added',
      eventId: 'client-evt-1',
    });
    expect(result.init?.status ?? 200).toBe(200);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wishlist_item_added',
        userId: 'user-1',
        eventId: 'client-evt-1',
        visitorId: 'visitor-1',
      }),
    );
  });

  it('accepts normalized client environment observations anonymously', async () => {
    const result = await postEvent({
      name: 'client_environment_observed',
      properties: {
        browserFamily: 'Safari',
        browserMajor: 17,
        osFamily: 'iOS',
        deviceType: 'mobile',
        viewportBucket: 'mobile',
        displayMode: 'browser',
        isStandalone: false,
        serviceWorkerSupported: true,
        notificationPermission: 'default',
        observedAt: '2026-06-29T17:00:00.000Z',
      },
    });
    expect(result.init?.status ?? 200).toBe(200);
    expect(logClientEnvironmentObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        requestId: 'req-1',
        sessionId: null,
        visitorId: 'visitor-1',
      }),
    );
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('rejects client environment observations with raw user-agent payloads', async () => {
    const result = await postEvent({
      name: 'client_environment_observed',
      properties: {
        browserFamily: 'Chrome',
        browserMajor: 126,
        osFamily: 'Windows',
        deviceType: 'desktop',
        viewportBucket: 'desktop',
        displayMode: 'browser',
        isStandalone: false,
        serviceWorkerSupported: true,
        notificationPermission: 'default',
        observedAt: '2026-06-29T17:00:00.000Z',
        userAgent: 'Mozilla/5.0',
      },
    });
    expect(result.init?.status).toBe(400);
    expect(logClientEnvironmentObservation).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
