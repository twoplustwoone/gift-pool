/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { WishlistHeader } from './wishlist-header';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
      submit: vi.fn(),
      load: vi.fn(),
      state: 'idle',
      data: undefined,
    }),
  };
});

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef((_props: any, _ref: any) =>
    React.createElement('div', { 'data-testid': 'wishlist-item-editor' }),
  );
  return { WishlistItemEditor };
});

vi.mock('./wishlist-share-dialog', () => ({
  WishlistShareDialog: () => (
    <button type="button">Share wishlist stub</button>
  ),
}));

vi.mock('./wishlist-link-copy-button', () => ({
  WishlistLinkCopyButton: ({ displayName }: { displayName: string }) => (
    <button type="button">Copy {displayName}'s link stub</button>
  ),
}));

vi.mock('./wishlist-avatar', () => ({
  WishlistAvatar: () => <div data-testid="wishlist-avatar" />,
}));

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return { ...actual };
});

const baseUser = {
  username: 'jane',
  name: 'Jane',
  image: { id: 'img1' },
  wishlistCategories: [],
};

describe('WishlistHeader', () => {
  it('renders "My Wishlist" for owner', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={true}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={false}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('My Wishlist')).toBeInTheDocument();
  });

  it("renders \"Jane's Wishlist\" for non-owner", () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={false}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={false}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText("Jane's Wishlist")).toBeInTheDocument();
  });

  it('shows share dialog for owner', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={true}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={false}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('Share wishlist stub')).toBeInTheDocument();
  });

  it('shows copy link for non-owner', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={false}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={false}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText("Copy Jane's link stub")).toBeInTheDocument();
  });

  it('shows the Organize control when isOwner && !hideOwnerControls && showOrganize', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={true}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={true}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: 'Organize' }),
    ).toBeInTheDocument();
  });

  it('hides owner controls when hideOwnerControls is true', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={true}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={true}
            hideFloatingAddButton={true}
            showOrganize={true}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.queryByRole('button', { name: 'Organize' }),
    ).not.toBeInTheDocument();
  });

  it('hides the Organize control when showOrganize is false', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistHeader
            isOwner={true}
            user={baseUser}
            displayName="Jane"
            publicShare={null}
            isPublicView={false}
            hideOwnerControls={false}
            hideFloatingAddButton={false}
            showOrganize={false}
            onStartOrganize={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.queryByRole('button', { name: 'Organize' }),
    ).not.toBeInTheDocument();
  });
});
