import { describe, expect, it } from 'vitest';
import {
  getRequestPath,
  normalizeAppPath,
  safeRedirectPath,
} from './request-path.server.ts';

describe('normalizeAppPath', () => {
  it.each([
    ['/wishlist?filter=open', '/wishlist?filter=open'],
    ['/groups/', '/groups/'],
    ['/', '/'],
    ['/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex', '/wishlist'],
    [
      '/settings/profile/two-factor/disable.data?return=1&_routes=routes%2Fsettings',
      '/settings/profile/two-factor/disable?return=1',
    ],
    ['/settings/profile/_.data?index&_routes=x', '/settings/profile'],
    [
      '/settings/profile/_.data?index&_data=routes%2Fsettings',
      '/settings/profile',
    ],
    ['/_root.data?_routes=root', '/'],
    ['/_.data', '/'],
    ['/wishlist.data#item-3', '/wishlist#item-3'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAppPath(input)).toBe(expected);
  });

  it('leaves a non-data query string byte-for-byte intact', () => {
    expect(normalizeAppPath('/search?q=a%20b&tag=x')).toBe(
      '/search?q=a%20b&tag=x',
    );
  });
});

describe('getRequestPath', () => {
  it('returns the document path for a document request', () => {
    expect(
      getRequestPath(new Request('https://giftpool.app/wishlist?filter=open')),
    ).toBe('/wishlist?filter=open');
  });

  it('strips single-fetch internals from a data request', () => {
    expect(
      getRequestPath(
        new Request(
          'https://giftpool.app/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex',
        ),
      ),
    ).toBe('/wishlist');
  });
});

describe('safeRedirectPath', () => {
  it('rewrites a data URL that leaked into redirectTo', () => {
    expect(
      safeRedirectPath('/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex'),
    ).toBe('/wishlist');
  });

  it.each([
    [undefined, '/'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['//evil.example.data', '/'],
  ])('falls back to / for unsafe target %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it('passes ordinary in-app targets through', () => {
    expect(safeRedirectPath('/groups/join/abc')).toBe('/groups/join/abc');
  });
});
