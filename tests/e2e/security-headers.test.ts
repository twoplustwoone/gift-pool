import { expect, test } from '#tests/playwright-utils.ts';

/**
 * Regression guard: confirms the server sends a Content-Security-Policy header
 * (in report-only mode) with the expected nonce-based script-src directives.
 *
 * The CSP is intentionally kept in report-only mode until React Router v7 adds
 * nonce support for its streaming continuation scripts (the inline <script> tags
 * emitted after </html> to populate the deferred ReadableStream). Those scripts
 * currently have no nonce, so strict-dynamic blocks them when enforced, which
 * prevents React from hydrating. Once upstream support lands this test should be
 * updated to assert the enforced header instead.
 */
test('homepage sends a Content-Security-Policy-Report-Only header with nonce-based script-src', async ({
  page,
}) => {
  const response = await page.request.get('/');
  const headers = response.headers();

  // The report-only header must be present and contain the nonce-based script-src.
  expect(headers['content-security-policy-report-only']).toBeTruthy();
  expect(headers['content-security-policy-report-only']).toContain('script-src');
  expect(headers['content-security-policy-report-only']).toContain('strict-dynamic');

  // The enforced header must be absent — its presence would mean enforcement
  // is on, which breaks React hydration via the streaming script issue above.
  expect(headers['content-security-policy']).toBeFalsy();
});
