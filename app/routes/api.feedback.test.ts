/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

// Side effects fire off the action response; stub them so they don't perform
// real network calls or race the test teardown. `vi.hoisted` ensures the mock
// fns exist before any transitive import pulls in the mocked modules.
const { sendEmail, queueLogEvent } = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ status: 'success' as const })),
  queueLogEvent: vi.fn(() => ({ eventId: 'test-event' })),
}));

vi.mock('#app/utils/email.server.ts', () => ({ sendEmail }));
vi.mock('#app/utils/analytics.server.ts', () => ({ queueLogEvent }));

import { action } from './api.feedback.tsx';

const DAY_MS = 1000 * 60 * 60 * 24;

function createRequest(
  body: Record<string, string>,
  { cookie }: { cookie?: string } = {},
) {
  return new Request('https://giftpool.app/api/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'vitest',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(body).toString(),
  });
}

const baseBody = {
  type: 'BUG',
  message: 'The vote button does nothing when I tap it on mobile.',
};

describe('/api/feedback action', () => {
  it('requires an email for anonymous submissions', async () => {
    const result = await action(
      toActionArgs({ request: createRequest(baseBody), params: {}, context: {} as any }),
    );
    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: { error: { email: expect.any(Array) } },
    });
    expect(await prisma.feedback.count()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('persists an anonymous submission that includes an email', async () => {
    const result = await action(
      toActionArgs({
        request: createRequest({ ...baseBody, email: 'Guest@Example.com' }),
        params: {},
        context: {} as any,
      }),
    );
    await expect(getRouteResultData(result)).resolves.toMatchObject({ ok: true });

    const rows = await prisma.feedback.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'BUG',
      email: 'guest@example.com',
      userId: null,
      status: 'NEW',
      userAgent: 'vitest',
    });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'feedback_submitted' }),
    );
    // One email to the operator inbox, one acknowledgment to the submitter.
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recipients = (
      sendEmail.mock.calls as unknown as Array<[{ to: string }]>
    ).map((call) => call[0].to);
    expect(recipients).toContain('support@giftpool.app');
    expect(recipients).toContain('guest@example.com');

    // No FEEDBACK_CC_EMAIL set in tests → the operator email omits cc.
    const operatorCall = (
      sendEmail.mock.calls as unknown as Array<[{ to: string; cc?: string }]>
    ).find((call) => call[0].to === 'support@giftpool.app');
    expect(operatorCall?.[0].cc).toBeUndefined();
  });

  it('CCs the operator email to FEEDBACK_CC_EMAIL when configured', async () => {
    vi.stubEnv('FEEDBACK_CC_EMAIL', 'owner@example.com');

    const result = await action(
      toActionArgs({
        request: createRequest({ ...baseBody, email: 'guest@example.com' }),
        params: {},
        context: {} as any,
      }),
    );
    await expect(getRouteResultData(result)).resolves.toMatchObject({ ok: true });

    const operatorCall = (
      sendEmail.mock.calls as unknown as Array<[{ to: string; cc?: string }]>
    ).find((call) => call[0].to === 'support@giftpool.app');
    expect(operatorCall?.[0].cc).toBe('owner@example.com');

    vi.unstubAllEnvs();
  });

  it('uses the stored email for a logged-in submitter', async () => {
    const user = await prisma.user.create({
      data: { ...createUser(), email: 'real-user@example.com' },
      select: { id: true },
    });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);

    const result = await action(
      toActionArgs({
        request: createRequest({ ...baseBody, type: 'FEATURE' }, { cookie }),
        params: {},
        context: {} as any,
      }),
    );
    await expect(getRouteResultData(result)).resolves.toMatchObject({ ok: true });

    const row = await prisma.feedback.findFirstOrThrow();
    expect(row.userId).toBe(user.id);
    expect(row.email).toBe('real-user@example.com');
    expect(row.type).toBe('FEATURE');
  });
});
