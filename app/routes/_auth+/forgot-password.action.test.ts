/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const checkHoneypot = vi.fn();
const findFirst = vi.fn();
const findFirstOrThrow = vi.fn();
const sendEmail = vi.fn();
const prepareVerification = vi.fn();

vi.mock('#app/utils/honeypot.server.ts', () => ({
  checkHoneypot: (...args: Array<unknown>) => checkHoneypot(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => findFirst(...args),
      findFirstOrThrow: (...args: Array<unknown>) => findFirstOrThrow(...args),
    },
  },
}));

vi.mock('#app/utils/email.server.ts', () => ({
  sendEmail: (...args: Array<unknown>) => sendEmail(...args),
}));

vi.mock('./verify.server.ts', () => ({
  prepareVerification: (...args: Array<unknown>) => prepareVerification(...args),
}));

import { action } from './forgot-password.tsx';

function createRequest(usernameOrEmail: string) {
  return new Request('https://giftpool.app/forgot-password', {
    body: new URLSearchParams({
      usernameOrEmail,
    }).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

describe('app/routes/_auth+/forgot-password.tsx action', () => {
  it('returns a validation error when no user matches the submission', async () => {
    checkHoneypot.mockResolvedValue(undefined);
    findFirst.mockResolvedValue(null);

    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: createRequest('missinguser'),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: {
        error: {
          usernameOrEmail: ['No user exists with this username or email'],
        },
      },
    });
    expect(findFirstOrThrow).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails reset instructions and redirects on success', async () => {
    checkHoneypot.mockResolvedValue(undefined);
    findFirst.mockResolvedValue({ id: 'user-1' });
    findFirstOrThrow.mockResolvedValue({
      email: 'taylor@example.com',
      username: 'taylor',
    });
    prepareVerification.mockResolvedValue({
      otp: '123456',
      redirectTo: new URL('https://giftpool.app/verify?type=reset-password'),
      verifyUrl: new URL(
        'https://giftpool.app/verify?type=reset-password&code=123456',
      ),
    });
    sendEmail.mockResolvedValue({
      status: 'success',
    });

    const response = await action(
      toActionArgs({
        context: {},
        params: {},
        request: createRequest('taylor'),
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect(getRouteResultStatus(response)).toBe(302);
    expect((response as Response).headers.get('Location')).toBe(
      'https://giftpool.app/verify?type=reset-password',
    );
    expect(prepareVerification).toHaveBeenCalledWith({
      period: 600,
      request: expect.any(Request),
      target: 'taylor',
      type: 'reset-password',
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'GiftPool Password Reset',
        to: 'taylor@example.com',
      }),
    );
  });

  it('returns a form error when the email provider fails', async () => {
    checkHoneypot.mockResolvedValue(undefined);
    findFirst.mockResolvedValue({ id: 'user-1' });
    findFirstOrThrow.mockResolvedValue({
      email: 'taylor@example.com',
      username: 'taylor',
    });
    prepareVerification.mockResolvedValue({
      otp: '123456',
      redirectTo: new URL('https://giftpool.app/verify?type=reset-password'),
      verifyUrl: new URL(
        'https://giftpool.app/verify?type=reset-password&code=123456',
      ),
    });
    sendEmail.mockResolvedValue({
      error: {
        message: 'Email service unavailable',
      },
      status: 'error',
    });

    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: createRequest('taylor'),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(500);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: {
        error: {
          '': ['Email service unavailable'],
        },
      },
    });
  });
});
