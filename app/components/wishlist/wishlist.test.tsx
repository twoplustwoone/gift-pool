/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from '@remix-run/testing';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Wishlist } from './index';

vi.mock('#app/utils/user.ts', async () => {
  const actual = await vi.importActual('#app/utils/user.ts');
  return {
    ...actual,
    useOptionalUser: () => ({ id: 'user1', roles: [] }),
    userHasPermission: () => true,
  };
});

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return {
    ...actual,
    useIsPending: () => false,
  };
});

vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
      submit: () => {},
      state: 'idle',
      data: undefined,
    }),
    useRevalidator: () => ({ revalidate: () => {} }),
  };
});

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef((_props: any, ref: any) => {
    // support trigger passthrough like the real component
    const { trigger } = _props ?? {};

    // provide a stub handle so calls like editorRef.current?.openView() don't blow up
    React.useImperativeHandle(
      ref,
      () => ({
        open: () => {},
        close: () => {},
        toggle: () => {},
        openView: () => {},
        openEdit: () => {},
        openCreate: () => {},
      }),
      [],
    );

    return trigger ?? React.createElement('div', null, 'editor');
  });

  return { WishlistItemEditor };
});

vi.mock('./category-manager', () => ({
  CategoryManager: () => <div />,
}));

describe('Wishlist components', () => {
  it('renders wishlist with items', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={true}
                user={{
                  id: 'user1',
                  username: 'jane',
                  name: 'Jane',
                  image: { id: 'img1' },
                  wishlistItems: [
                    {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'user1',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  updatedAt: new Date(),
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText('My Wishlist');
    // 2 items: one for the desktop view, one for the mobile view
    expect(await screen.findAllByText('Item one')).toHaveLength(2);
  });

  it('shows a copy link control for owners', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={true}
                user={{
                  id: 'user2',
                  username: 'jane',
                  name: 'Jane',
                  image: { id: 'img1' },
                  wishlistItems: [],
                  wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByRole('button', { name: /copy link to my wishlist/i });
  });

  it("lets viewers copy someone's wishlist link", async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user3',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [],
                  wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByRole('button', { name: /copy jim's wishlist link/i });
  });

  it('shows empty message for others', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user4',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [],
                  wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText(
      "Jim doesn't have any items in their wishlist yet!",
    );
  });

  it('hides default category for viewers when it has no items', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user5',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [],
                  wishlistCategories: [
                { id: 'cat1', name: 'Books', order: 0 },
                { id: 'cat2', name: 'Games', order: 1 },
              ],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText(
      "Jim doesn't have any items in their wishlist yet!",
    );
    expect(
      screen.queryByRole('heading', {
        name: /default \(uncategorized\)/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows default category for viewers when it has items', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user6',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [
                {
                  id: 'item-1',
                  title: 'Default item',
                  ownerId: 'user2',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: null,
                  updatedAt: new Date(),
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByRole('heading', {
      name: /default \(uncategorized\).*1/i,
    });
    await screen.findByText('Default item');
  });

  it('renders empty categories', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={true}
                user={{
                  id: 'user7',
                  username: 'jane',
                  name: 'Jane',
                  image: { id: 'img1' },
                  wishlistItems: [],
              wishlistCategories: [{ id: 'cat1', name: 'Books', order: 0 }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByRole('heading', { name: /books \(0\)/i });
  });

  it('lets viewers mark an item as purchased', async () => {
    const App = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user8',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [
                {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'user2',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: null,
                  updatedAt: new Date(),
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    const purchaseButton = await screen.findByRole('button', {
      name: /grab this gift/i,
    });
    expect(purchaseButton.tagName).toBe('BUTTON');
  });

  it('shows purchase status for viewers', async () => {
    const PurchasedByViewer = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user9',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [
                {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'user2',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: { purchasedById: 'user1' },
                  updatedAt: new Date(),
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<PurchasedByViewer />);

    await screen.findByText(/you’re on gift duty/i);
    const unmarkButton = screen.getByRole('button', {
      name: /someone else pick up this gift/i,
    });
    expect(unmarkButton.tagName).toBe('BUTTON');
    expect(unmarkButton).toBeEnabled();

    const PurchasedByOther = createRemixStub([
      {
        path: '/',
            Component: () => (
              <Wishlist
                isOwner={false}
                user={{
                  id: 'user10',
                  username: 'jim',
                  name: 'Jim',
                  image: { id: 'img1' },
                  wishlistItems: [
                {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'user2',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: { purchasedById: 'someone-else' },
                  updatedAt: new Date(),
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<PurchasedByOther />);

    await screen.findByText(/someone already grabbed this/i);
    expect(screen.queryByRole('button', { name: /grab this/i })).not.toBeInTheDocument();
  });
});
