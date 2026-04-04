import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';
import routes from './routes.ts';

describe('route manifest', () => {
  it('uses one shared /users/:username parent branch for profile and wishlist', () => {
    const profileMatches = matchRoutes(routes, '/users/taylor');
    const wishlistMatches = matchRoutes(routes, '/users/taylor/wishlist');

    expect(profileMatches?.map((match) => match.route.id)).toEqual([
      'routes/users+/$username_+/route',
      'routes/users+/$username_+/index',
    ]);
    expect(wishlistMatches?.map((match) => match.route.id)).toEqual([
      'routes/users+/$username_+/route',
      'routes/users+/$username_+/wishlist',
    ]);
    expect(profileMatches?.[0]?.route.id).toBe(wishlistMatches?.[0]?.route.id);
  });
});
