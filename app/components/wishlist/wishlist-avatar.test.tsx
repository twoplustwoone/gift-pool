/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, it, expect, vi } from 'vitest';

import { WishlistAvatar } from './wishlist-avatar';

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return {
    ...actual,
    getUserImgSrc: (id: string | undefined) =>
      id ? `/img/${id}` : '/img/default',
  };
});

const user = {
  username: 'jane',
  name: 'Jane',
  image: { id: 'img1' },
};

describe('WishlistAvatar', () => {
  it('renders img with correct src and alt', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistAvatar isOwner={true} user={user} />,
      },
    ]);
    render(<App />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'Jane');
    expect(img).toHaveAttribute('src', '/img/img1');
  });

  it('does not wrap image in a link for owner', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistAvatar isOwner={true} user={user} />,
      },
    ]);
    render(<App />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('wraps image in link to /users/:username for non-owner', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistAvatar isOwner={false} user={user} />,
      },
    ]);
    render(<App />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/users/jane');
  });
});
