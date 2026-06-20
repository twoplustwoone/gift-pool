/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_LEGAL_VERSION } from '#app/utils/legal.ts';
import {
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireAnonymous = vi.fn();
const signup = vi.fn();
const findUnique = vi.fn();
const checkHoneypot = vi.fn();
const getRequestContext = vi.fn();
const queueLogEvent = vi.fn();
const redirectWithToast = vi.fn();
const authGetSession = vi.fn();
const authCommitSession = vi.fn();
const verifyGetSession = vi.fn();
const verifyDestroySession = vi.fn();

const onboardingEmail = 'new@example.com';

vi.mock('#app/utils/auth.server.ts', () => ({
  sessionKey: 'sessionId',
  requireAnonymous: (...args: Array<unknown>) => requireAnonymous(...args),
  signup: (...args: Array<unknown>) => signup(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
  },
}));

vi.mock('#app/utils/honeypot.server.ts', () => ({
  checkHoneypot: (...args: Array<unknown>) => checkHoneypot(...args),
}));

vi.mock('#app/utils/request-context.server.ts', () => ({
  getRequestContext: (...args: Array<unknown>) => getRequestContext(...args),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

vi.mock('#app/utils/session.server.ts', () => ({
  authSessionStorage: {
    getSession: (...args: Array<unknown>) => authGetSession(...args),
    commitSession: (...args: Array<unknown>) => authCommitSession(...args),
  },
}));

vi.mock('#app/utils/verification.server.ts', () => ({
  verifySessionStorage: {
    getSession: (...args: Array<unknown>) => verifyGetSession(...args),
    destroySession: (...args: Array<unknown>) => verifyDestroySession(...args),
  },
}));

import { action } from './onboarding.tsx';

function createRequest(fields: Record<string, string>, ip?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (ip) headers['fly-client-ip'] = ip;
  return new Request('https://giftpool.app/onboarding', {
    body: new URLSearchParams(fields).toString(),
    headers,
    method: 'POST',
  });
}

const validFields = {
  username: 'newbie',
  name: 'New Bie',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
  redirectTo: '/wishlist',
};

describe('app/routes/_auth+/onboarding.tsx action', () => {
  beforeEach(() => {
    requireAnonymous.mockResolvedValue(undefined);
    checkHoneypot.mockResolvedValue(undefined);
    findUnique.mockResolvedValue(null);
    authGetSession.mockResolvedValue({ set: vi.fn() });
    authCommitSession.mockResolvedValue('auth-cookie');
    verifyGetSession.mockResolvedValue({
      get: (key: string) =>
        key === 'onboardingEmail' ? onboardingEmail : null,
    });
    verifyDestroySession.mockResolvedValue('destroyed-cookie');
  });

  it('persists consent with the current legal version, affirmation, and request IP', async () => {
    getRequestContext.mockResolvedValue({
      requestId: 'req-1',
      visitorId: 'vis-1',
    });
    signup.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      expirationDate: new Date(Date.now() + 1000 * 60 * 60),
    });
    redirectWithToast.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: '/wishlist' } }),
    );

    const response = await action(
      toActionArgs({
        context: {},
        params: {},
        request: createRequest(
          { ...validFields, agreeToTermsOfServiceAndPrivacyPolicy: 'on' },
          '203.0.113.7',
        ),
      }),
    );

    expect(getRouteResultStatus(response)).toBe(302);
    expect(signup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: onboardingEmail,
        username: 'newbie',
        consent: {
          version: CURRENT_LEGAL_VERSION,
          ageAffirmed: true,
          ipAddress: '203.0.113.7',
        },
      }),
    );
  });

  it('rejects signup when the terms / 13+ affirmation is missing', async () => {
    getRequestContext.mockResolvedValue({
      requestId: 'req-2',
      visitorId: 'vis-2',
    });

    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: createRequest(validFields),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    expect(signup).not.toHaveBeenCalled();
  });
});
