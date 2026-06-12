/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { handleVerification } from './onboarding.server.ts';

function submission(value: Record<string, unknown>) {
  return { status: 'success', value } as never;
}

const args = (value: Record<string, unknown>) => ({
  request: new Request('https://giftpool.app/verify', { method: 'POST' }),
  body: new FormData(),
  submission: submission(value),
});

describe('onboarding handleVerification', () => {
  it('forwards redirectTo so signup lands where the user meant to go', async () => {
    const response = await handleVerification(
      args({ target: 'new@example.com', redirectTo: '/groups/join/abc' }),
    );
    expect(response.headers.get('location')).toBe(
      '/onboarding?redirectTo=%2Fgroups%2Fjoin%2Fabc',
    );
    expect(response.headers.get('set-cookie')).toContain('en_verification');
  });

  it('redirects plainly when no redirectTo was carried', async () => {
    const response = await handleVerification(
      args({ target: 'new@example.com' }),
    );
    expect(response.headers.get('location')).toBe('/onboarding');
  });
});
