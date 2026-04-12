import { expect, test } from '#tests/playwright-utils.ts';

/**
 * Regression guard: confirms the server sends an enforced CSP header, not a
 * report-only one. A single line change in server/index.ts could silently
 * downgrade enforcement back to reporting, which this catches immediately.
 */
test('homepage sends an enforced Content-Security-Policy header', async ({
  page,
}) => {
  const response = await page.request.get('/');
  const headers = response.headers();

  // Enforced header must be present and contain the nonce-based script-src.
  expect(headers['content-security-policy']).toBeTruthy();
  expect(headers['content-security-policy']).toContain('script-src');
  expect(headers['content-security-policy']).toContain('strict-dynamic');

  // The report-only header must be absent — its presence means enforcement is off.
  expect(headers['content-security-policy-report-only']).toBeFalsy();
});
