import { describe, expect, it } from 'vitest';
import routes from './routes.ts';

describe('route manifest', () => {
  it('uses one shared /users/:username parent branch for profile and wishlist', () => {
    const userRoute = routes.find(
      (route) => route.id === 'routes/users+/$username_+/route',
    );

    expect(userRoute).toMatchObject({
      path: 'users/:username',
    });
    expect(userRoute?.children?.map((route) => route.id)).toEqual([
      'routes/users+/$username_+/index',
      'routes/users+/$username_+/wishlist',
    ]);
    expect(
      routes.filter((route) => route.path === 'users/:username'),
    ).toHaveLength(1);
  });
});
