/**
 * @vitest-environment jsdom
 */
import { createRoutesStub } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
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
  CategoryManager: ({ onStartItemReorder, onStartCategoryReorder }: any) => (
    <div>
      {onStartItemReorder ? (
        <button type="button" onClick={onStartItemReorder}>
          Start item reorder
        </button>
      ) : null}
      {onStartCategoryReorder ? (
        <button type="button" onClick={onStartCategoryReorder}>
          Start category reorder
        </button>
      ) : null}
    </div>
  ),
}));

describe('Wishlist components', () => {
  it('renders wishlist with items', async () => {
    const App = createRoutesStub([
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
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
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

  it('shows a share control for owners', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              id: 'user-owner',
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

    await screen.findByRole('button', { name: /share wishlist/i });
  });

  it("lets viewers copy someone's wishlist link", async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={false}
            user={{
              id: 'user-viewer',
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

  it('hides claim controls for public viewers', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={false}
            isPublicView
            user={{
              id: 'user-public',
              username: 'jane',
              name: 'Jane',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'owner',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: { purchasedById: 'someone-else' },
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
                {
                  id: '2',
                  title: 'Item two',
                  ownerId: 'owner',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  purchase: null,
                  sortOrder: 1,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    expect(
      screen.queryByRole('button', { name: /grab this gift/i }),
    ).not.toBeInTheDocument();
    await screen.findByText(/already claimed/i);
    const itemTwoNode = await screen.findByText('Item two');
    expect(
      itemTwoNode.closest('div')?.textContent?.match(/claimed/i)?.length ?? 0,
    ).toBe(0);
  });

  it('shows empty message for others', async () => {
    const App = createRoutesStub([
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

    await screen.findByText(/doesn't have any active items in their wishlist/i);
  });

  it('hides default category for viewers when it has no items', async () => {
    const App = createRoutesStub([
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

    await screen.findByText(/doesn't have any active items in their wishlist/i);
    expect(
      screen.queryByRole('heading', {
        name: /default \(uncategorized\)/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows default category for viewers when it has items', async () => {
    const App = createRoutesStub([
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
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
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
    const App = createRoutesStub([
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
    const App = createRoutesStub([
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
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
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
    const PurchasedByViewer = createRoutesStub([
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
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
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

    const PurchasedByOther = createRoutesStub([
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
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
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
    expect(
      screen.queryByRole('button', { name: /grab this/i }),
    ).not.toBeInTheDocument();
  });

  it('shows reorder handles for owners only after entering reorder mode', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner
            user={{
              id: 'user11',
              username: 'jane',
              name: 'Jane',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: 'item-1',
                  title: 'Item One',
                  ownerId: 'user11',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: 'cat-1',
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
              ],
              wishlistCategories: [{ id: 'cat-1', name: 'Books', order: 0 }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    expect(
      screen.queryByRole('button', { name: /drag category books/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /drag item item one/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /start item reorder/i }),
    );
    await screen.findByRole('button', { name: /drag item item one/i });
    expect(
      screen.queryByRole('button', { name: /category actions for books/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /category reorder mode/i }),
    );
    await screen.findByRole('button', { name: /drag category books/i });
    expect(
      screen.queryByRole('button', { name: /drag item item one/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /done reordering/i }));
    expect(
      screen.queryByRole('button', { name: /drag category books/i }),
    ).not.toBeInTheDocument();

    await screen.findByRole('button', { name: /category actions for books/i });
    expect(
      screen.getAllByRole('button', { name: /item actions for item one/i }),
    ).toHaveLength(2);

    const categoryRows = await screen.findAllByTestId('wishlist-category-row');
    expect(categoryRows[0]).toHaveAttribute('data-drag-state', 'idle');
    const itemRows = await screen.findAllByTestId('wishlist-item-row');
    expect(itemRows[0]).toHaveAttribute('data-drag-state', 'idle');
  });

  it('keeps the category delete dialog open after selecting delete from row actions', async () => {
    const user = userEvent.setup();
    const App = createRoutesStub([
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
              wishlistItems: [],
              wishlistCategories: [{ id: 'cat-1', name: 'Books', order: 0 }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await user.click(
      await screen.findByRole('button', {
        name: /category actions for books/i,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /delete category/i }),
    );

    expect(
      await screen.findByRole('dialog', { name: /delete category/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: /delete category/i }),
    ).not.toBeInTheDocument();
  });

  it('does not show drag handles for viewers', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={false}
            user={{
              id: 'user12',
              username: 'jim',
              name: 'Jim',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: 'item-1',
                  title: 'Item One',
                  ownerId: 'user11',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
              ],
              wishlistCategories: [{ id: 'cat-1', name: 'Books', order: 0 }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    expect(
      screen.queryByRole('button', { name: /drag category/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /drag item/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /category actions for/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /item actions for/i }),
    ).not.toBeInTheDocument();
  });
});
