import { describe, expect, test } from 'vitest';
import { getRoutePath, normalizeDataRequestPathname } from './route-url.ts';

describe('normalizeDataRequestPathname', () => {
  test.each([
    ['/_root.data', '/'],
    ['/_.data', '/'],
    ['/wishlist.data', '/wishlist'],
    ['/pools/abc/_.data', '/pools/abc/'],
    ['/wishlist', '/wishlist'],
    ['/', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDataRequestPathname(input)).toBe(expected);
  });
});

describe('getRoutePath', () => {
  test('maps the single-fetch request from GIFTPOOL-UI-37 to the page path', () => {
    expect(
      getRoutePath(
        'https://giftpool.app/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex',
      ),
    ).toBe('/wishlist');
  });

  test('keeps user query params and drops only router-internal ones', () => {
    expect(
      getRoutePath(
        'https://giftpool.app/friends.data?tab=requests&_routes=routes%2Ffriends&index',
      ),
    ).toBe('/friends?tab=requests');
  });

  test('leaves document request URLs unchanged', () => {
    expect(getRoutePath('https://giftpool.app/pools/abc?view=all')).toBe(
      '/pools/abc?view=all',
    );
  });
});
