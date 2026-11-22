/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

const sendEmail = vi.fn();

vi.mock('#app/utils/email.server.ts', () => ({
  sendEmail: (...args: Array<unknown>) => sendEmail(...args),
}));

import { handleResend, prepareVerification } from './verify.server.ts';

function resendForm(entries: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    body.set(key, value);
  }
  return body;
}

const request = () =>
  new Request('https://giftpool.app/verify?type=onboarding', {
    method: 'POST',
  });

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ status: 'success' });
});

describe('prepareVerification', () => {
  it('carries redirectTo into the verify URL and emailed link', async () => {
    const { verifyUrl, redirectTo } = await prepareVerification({
      period: 600,
      request: new Request('https://giftpool.app/signup'),
      type: 'onboarding',
      target: 'prep-redirect@example.com',
      redirectTo: '/groups/join/abc',
    });
    expect(verifyUrl.searchParams.get('redirectTo')).toBe('/groups/join/abc');
    expect(redirectTo.searchParams.get('redirectTo')).toBe('/groups/join/abc');
  });

  it('omits redirectTo when none was given', async () => {
    const { verifyUrl } = await prepareVerification({
      period: 600,
      request: new Request('https://giftpool.app/signup'),
      type: 'onboarding',
      target: 'prep-plain@example.com',
    });
    expect(verifyUrl.searchParams.get('redirectTo')).toBeNull();
  });
});

describe('handleResend', () => {
  it('re-sends the onboarding email and upserts the verification', async () => {
    const target = 'resend-me@example.com';
    const result = await handleResend(
      request(),
      resendForm({ type: 'onboarding', target, redirectTo: '/wishlist' }),
    );
    expect(result.data).toEqual({ resent: true });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: target,
        subject: 'Welcome to GiftPool!',
      }),
    );
    const verification = await prisma.verification.findUnique({
      where: { target_type: { target, type: 'onboarding' } },
    });
    expect(verification).not.toBeNull();
  });

  it('refuses non-onboarding types', async () => {
    const result = await handleResend(
      request(),
      resendForm({ type: 'reset-password', target: 'x@example.com' }),
    );
    expect(result.init?.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses a missing target', async () => {
    const result = await handleResend(
      request(),
      resendForm({ type: 'onboarding' }),
    );
    expect(result.init?.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('surfaces email delivery failures', async () => {
    sendEmail.mockResolvedValue({
      status: 'error',
      error: { message: 'delivery failed' },
    });
    const result = await handleResend(
      request(),
      resendForm({ type: 'onboarding', target: 'fail@example.com' }),
    );
    expect(result.init?.status).toBe(500);
    expect(result.data).toEqual({ error: 'delivery failed' });
  });
});
