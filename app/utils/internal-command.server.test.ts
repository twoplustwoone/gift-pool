/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyInternalCommandToken } from './internal-command.server.ts';

const ORIGINAL = process.env.INTERNAL_COMMAND_TOKEN;

function req(auth?: string) {
  return new Request('https://giftpool.app/api/internal/x', {
    headers: auth ? { Authorization: auth } : {},
  });
}

beforeEach(() => {
  process.env.INTERNAL_COMMAND_TOKEN = 'secret-token';
});
afterEach(() => {
  process.env.INTERNAL_COMMAND_TOKEN = ORIGINAL;
});

describe('verifyInternalCommandToken', () => {
  it('accepts the exact bearer token', () => {
    expect(verifyInternalCommandToken(req('Bearer secret-token'))).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyInternalCommandToken(req('Bearer nope'))).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(verifyInternalCommandToken(req())).toBe(false);
  });

  it('rejects when the env token is unset/empty (no Bearer undefined bypass)', () => {
    // Env vars are typed as required strings here, so clear via assignment
    // rather than `delete`; an empty token is falsy and must still reject.
    process.env.INTERNAL_COMMAND_TOKEN = '';
    expect(verifyInternalCommandToken(req('Bearer undefined'))).toBe(false);
    expect(verifyInternalCommandToken(req('Bearer '))).toBe(false);
  });

  it('rejects a token that is a prefix of the expected value', () => {
    expect(verifyInternalCommandToken(req('Bearer secret'))).toBe(false);
  });
});
