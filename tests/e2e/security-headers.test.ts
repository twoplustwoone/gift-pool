import { expect, test } from '#tests/playwright-utils.ts';

/**
 * Regression guard: every document and React Router continuation script must
 * share the request nonce advertised by the report-only CSP header. Enforcement
 * remains a separate rollout after production violation telemetry is reviewed.
 */
test('homepage gives every streamed script the report-only CSP nonce', async ({
  page,
}) => {
  const response = await page.request.get('/');
  const headers = response.headers();
  const html = await response.text();
  const reportOnlyCsp = headers['content-security-policy-report-only'];

  // The report-only header must be present and contain the nonce-based script-src.
  expect(reportOnlyCsp).toBeTruthy();
  expect(reportOnlyCsp).toContain('script-src');
  expect(reportOnlyCsp).toContain('strict-dynamic');

  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map(
    ([scriptTag]) => scriptTag,
  );
  const scriptNonces = scriptTags.map((scriptTag) => {
    const match = scriptTag.match(/\bnonce=(?:"([^"]*)"|'([^']*)')/i);
    return match?.[1] ?? match?.[2] ?? '';
  });

  expect(scriptTags.length).toBeGreaterThan(0);
  expect(scriptNonces.every(Boolean)).toBe(true);
  expect(new Set(scriptNonces).size).toBe(1);
  expect(reportOnlyCsp).toContain(`'nonce-${scriptNonces[0]}'`);

  // Enforcement is intentionally a separate production rollout.
  expect(headers['content-security-policy']).toBeFalsy();
});
