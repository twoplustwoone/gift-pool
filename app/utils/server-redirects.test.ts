import { describe, expect, it } from 'vitest';
import {
  buildSafeAppRedirectTarget,
  getCanonicalRedirectTarget,
} from '../../server/redirects.js';

describe('buildSafeAppRedirectTarget', () => {
  it('removes a trailing slash from nested routes', () => {
    expect(buildSafeAppRedirectTarget('/friends/')).toBe('/friends');
  });

  it('collapses repeated slashes and preserves the query string', () => {
    expect(buildSafeAppRedirectTarget('/friends//wishlist/?tab=all')).toBe(
      '/friends/wishlist?tab=all',
    );
  });

  it('returns a safe root path for protocol-relative targets', () => {
    expect(buildSafeAppRedirectTarget('//evil.com/')).toBe('/');
  });

  it('returns a safe root path for slash-only targets', () => {
    expect(buildSafeAppRedirectTarget('//')).toBe('/');
    expect(buildSafeAppRedirectTarget('////')).toBe('/');
  });

  it('falls back to a safe relative target for degenerate external paths', () => {
    expect(buildSafeAppRedirectTarget('///evil.com///?x=1')).toBe('/?x=1');
  });

  it('returns a safe root path for malformed external-looking targets', () => {
    expect(buildSafeAppRedirectTarget('///foo')).toBe('/');
  });

  it('preserves query strings exactly', () => {
    expect(
      buildSafeAppRedirectTarget('/friends/?tab=all&view=grid&sort=name'),
    ).toBe('/friends?tab=all&view=grid&sort=name');
  });
});

describe('getCanonicalRedirectTarget', () => {
  it('returns null for the root path', () => {
    expect(getCanonicalRedirectTarget('/')).toBeNull();
  });

  it('returns null for already canonical paths', () => {
    expect(getCanonicalRedirectTarget('/friends?tab=all')).toBeNull();
  });

  it('returns the canonical path for trailing slash routes', () => {
    expect(getCanonicalRedirectTarget('/friends/')).toBe('/friends');
  });

  it('returns the canonical path for repeated slashes', () => {
    expect(getCanonicalRedirectTarget('/friends//wishlist/?tab=all')).toBe(
      '/friends/wishlist?tab=all',
    );
  });

  it('returns a safe path for protocol-relative inputs', () => {
    expect(getCanonicalRedirectTarget('//evil.com/')).toBe('/');
  });

  it('returns a safe path for slash-only targets', () => {
    expect(getCanonicalRedirectTarget('//')).toBe('/');
    expect(getCanonicalRedirectTarget('////')).toBe('/');
  });

  it('returns a safe path for malformed external-looking targets', () => {
    expect(getCanonicalRedirectTarget('///foo')).toBe('/');
  });
});
