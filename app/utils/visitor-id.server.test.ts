/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { ensureVisitorId, getVisitorId } from './visitor-id.server.ts';

const UUID = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const OTHER_UUID = '9b2d7a52-1f0e-4b3c-8a6d-2e4f6a8c0b1d';

function requestWith(headers: Record<string, string>) {
  return new Request('https://giftpool.app/', { headers });
}

describe('getVisitorId', () => {
  it('reads a well-formed gp_visitor cookie', () => {
    expect(getVisitorId(requestWith({ cookie: `gp_visitor=${UUID}` }))).toBe(
      UUID,
    );
  });

  it('rejects a tampered cookie value', () => {
    expect(
      getVisitorId(requestWith({ cookie: 'gp_visitor=not-a-uuid' })),
    ).toBeNull();
    expect(
      getVisitorId(
        requestWith({ cookie: "gp_visitor='; DROP TABLE AnalyticsEvent;" }),
      ),
    ).toBeNull();
  });

  it('falls back to the server-injected x-visitor-id header', () => {
    expect(getVisitorId(requestWith({ 'x-visitor-id': UUID }))).toBe(UUID);
  });

  it('prefers the cookie over the injected header', () => {
    expect(
      getVisitorId(
        requestWith({
          cookie: `gp_visitor=${UUID}`,
          'x-visitor-id': OTHER_UUID,
        }),
      ),
    ).toBe(UUID);
  });

  it('rejects a malformed x-visitor-id header', () => {
    expect(getVisitorId(requestWith({ 'x-visitor-id': 'spoofed' }))).toBeNull();
  });

  it('returns null without cookie or header', () => {
    expect(getVisitorId(requestWith({}))).toBeNull();
  });
});

describe('ensureVisitorId', () => {
  it('reuses an existing cookie id and refreshes the cookie', () => {
    const { visitorId, setCookieHeader } = ensureVisitorId(
      requestWith({ cookie: `gp_visitor=${UUID}` }),
    );
    expect(visitorId).toBe(UUID);
    expect(setCookieHeader).toContain(`gp_visitor=${UUID}`);
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Lax');
    expect(setCookieHeader).toContain('Path=/');
  });

  it('generates a UUID for first visits and sets it in the cookie', () => {
    const request = requestWith({});
    const { visitorId, setCookieHeader } = ensureVisitorId(request);
    expect(visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(setCookieHeader).toContain(`gp_visitor=${visitorId}`);
  });

  it('returns a stable id for repeated calls with the same Request', () => {
    const request = requestWith({});
    const first = ensureVisitorId(request).visitorId;
    const second = ensureVisitorId(request).visitorId;
    expect(second).toBe(first);
    // Distinct requests get distinct generated ids.
    expect(ensureVisitorId(requestWith({})).visitorId).not.toBe(first);
  });
});
