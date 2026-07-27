/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { buildMoveTargets } from './wishlist';
import { Wishlist } from './index';

// Hoisted so every `useFetcher()` call returns the SAME `Form` component
// reference — an inline `(props) => <form {...props} />` defined per call
// gives React a new component type on every re-render, which unmounts and
// remounts the form (and any input inside it) instead of reconciling.
const { MockFetcherForm, mockFetcherSubmit } = vi.hoisted(() => ({
  MockFetcherForm: (props: any) => <form {...props} />,
  mockFetcherSubmit: vi.fn(),
}));

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
      Form: MockFetcherForm,
      submit: mockFetcherSubmit,
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

describe('Wishlist components', () => {
  beforeEach(() => {
    mockFetcherSubmit.mockClear();
  });

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
    // The unified row renders each item ONCE (the old split rendered
    // desktop and mobile copies into the DOM simultaneously).
    expect(await screen.findAllByText('Item one')).toHaveLength(1);
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
                  claim: { claimedByUserId: 'someone-else' },
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
                  claim: null,
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
    // Item one is claimed → the row's right slot renders a "Claimed" badge.
    // Item two is not claimed → no claim text anywhere on its row.
    await screen.findByText('Item one');
    await screen.findByText('Item two');
    expect(screen.getAllByText('Claimed')).toHaveLength(1);
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

  it('renders a flat item list with no category chrome when there are no custom categories', async () => {
    // Item-first composition: with zero custom categories the wishlist is a
    // plain item list, not a single "Default (Uncategorized)" section.
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
                  claim: null,
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

    await screen.findByText('Default item');
    expect(
      screen.queryByRole('heading', { name: /default \(uncategorized\)/i }),
    ).not.toBeInTheDocument();
  });

  it('shows Default (Uncategorized) alongside custom categories when it has items', async () => {
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
                  claim: null,
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
              ],
              wishlistCategories: [{ id: 'cat1', name: 'Books', order: 0 }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    expect(
      await screen.findByRole('heading', {
        name: /default \(uncategorized\).*1/i,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Default item')).toBeInTheDocument();
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

  it('shows the view toggle once a past item exists and switches between views', async () => {
    const user = userEvent.setup();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              id: 'user-past',
              username: 'jane',
              name: 'Jane',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: 'item-1',
                  title: 'Active Item',
                  ownerId: 'user-past',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ACTIVE',
                },
                {
                  id: 'item-2',
                  title: 'Past Item',
                  ownerId: 'user-past',
                  note: null,
                  url: null,
                  type: 'text',
                  categoryId: null,
                  sortOrder: 0,
                  updatedAt: new Date(),
                  status: 'ARCHIVED',
                },
              ],
              wishlistCategories: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText('Active Item');
    expect(screen.queryByText('Past Item')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^past items$/i }));
    expect(await screen.findByText('Past Item')).toBeInTheDocument();
    expect(screen.queryByText('Active Item')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^wishlist$/i }));
    expect(await screen.findByText('Active Item')).toBeInTheDocument();
  });

  it('starts a flat (category-free) reorder list when the owner enters Organize with no categories', async () => {
    const user = userEvent.setup();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              id: 'user-flat',
              username: 'jane',
              name: 'Jane',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: 'item-1',
                  title: 'Flat Item',
                  ownerId: 'user-flat',
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

    await user.click(await screen.findByRole('button', { name: /^organize$/i }));
    expect(
      await screen.findByRole('button', { name: /drag item flat item/i }),
    ).toBeInTheDocument();

    // Swap to categories then back to items — exercises both branches of
    // the Organize mode toggle.
    await user.click(
      screen.getByRole('button', { name: /category reorder mode/i }),
    );
    await user.click(screen.getByRole('button', { name: /item reorder mode/i }));
    expect(
      await screen.findByRole('button', { name: /drag item flat item/i }),
    ).toBeInTheDocument();
  });

  it('opens the quick-add editor from the empty-state CTA', async () => {
    const user = userEvent.setup();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              id: 'user-empty',
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

    const addFirstItem = await screen.findByRole('button', {
      name: /add your first item/i,
    });
    // No throw — clicking calls through to the (mocked) editor ref's
    // openCreate() and flips the quick-add category id state.
    await user.click(addFirstItem);
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
                  claim: null,
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

  it('shows claim state in the row right slot for viewers', async () => {
    // The old footer-bar copy ("you're on gift duty" / "someone already
    // grabbed this") is now only rendered inside the item-editor modal via
    // WishlistNonOwnerExtras. The row itself communicates claim state via
    // the right-slot pill/button: "Claimed" + toggle when I claimed it,
    // or a non-interactive "Claimed" lock badge when someone else did.
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
                  claim: { claimedByUserId: 'user1' },
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

    // Claimed-by-me: the right-slot button shows "Claimed" (visible text on
    // ≥sm) and remains interactive to let the user un-claim.
    const unmarkButton = await screen.findByRole('button', {
      name: /someone else pick up this gift/i,
    });
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
                  claim: { claimedByUserId: 'someone-else' },
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

    // Claimed-by-other: the right slot is a non-actionable badge
    // ("Claimed") that opens an info bottom-sheet when tapped. There is no
    // "I'll grab" button because that would let us double-claim.
    expect(screen.getAllByText('Claimed').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /grab this gift/i }),
    ).not.toBeInTheDocument();
  });

  it('shows reorder handles for owners only after entering Organize mode', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /^organize$/i }));
    await screen.findByRole('button', { name: /drag item item one/i });
    expect(
      screen.queryByRole('button', { name: /add item to books/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /category reorder mode/i }),
    );
    await screen.findByRole('button', { name: /drag category books/i });
    expect(
      screen.queryByRole('button', { name: /drag item item one/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /done organizing/i }));
    expect(
      screen.queryByRole('button', { name: /drag category books/i }),
    ).not.toBeInTheDocument();

    await screen.findByRole('button', { name: /add item to books/i });
    expect(
      screen.getAllByRole('button', { name: /item actions for item one/i }),
    ).toHaveLength(1);

    const categoryRows = await screen.findAllByTestId('wishlist-category-row');
    expect(categoryRows[0]).toHaveAttribute('data-drag-state', 'idle');
    const itemRows = await screen.findAllByTestId('wishlist-item-row');
    expect(itemRows[0]).toHaveAttribute('data-drag-state', 'idle');
  });

  it('opens a confirmation dialog after selecting delete from Organize mode', async () => {
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

    await user.click(await screen.findByRole('button', { name: /^organize$/i }));
    await user.click(
      await screen.findByRole('button', { name: /category reorder mode/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /delete category books/i }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: /delete category/i,
    });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: /^delete$/i }),
    ).toBeInTheDocument();
  });

  it('submits the delete and closes the dialog when confirmed', async () => {
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

    await user.click(await screen.findByRole('button', { name: /^organize$/i }));
    await user.click(
      await screen.findByRole('button', { name: /category reorder mode/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /delete category books/i }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: /delete category/i,
    });
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(mockFetcherSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'delete', id: 'cat-1' }),
      expect.objectContaining({
        method: 'post',
        action: '/wishlist/categories',
      }),
    );
    expect(
      screen.queryByRole('dialog', { name: /delete category/i }),
    ).not.toBeInTheDocument();
  });

  it('closes the delete dialog without submitting when cancelled', async () => {
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

    await user.click(await screen.findByRole('button', { name: /^organize$/i }));
    await user.click(
      await screen.findByRole('button', { name: /category reorder mode/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /delete category books/i }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: /delete category/i,
    });
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    expect(mockFetcherSubmit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: /delete category/i }),
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

describe('buildMoveTargets', () => {
  it('returns no targets when there are no categories', () => {
    expect(buildMoveTargets([])).toEqual([]);
  });

  it('offers Default plus every persisted category as a target', () => {
    const categories = [
      { id: 'cat1', name: 'Books', order: 0 },
      { id: 'cat2', name: 'Games', order: 1 },
    ];
    const targets = buildMoveTargets(categories).map(({ id, name }) => ({
      id,
      name,
    }));
    expect(targets).toEqual([
      { id: null, name: 'Default (Uncategorized)' },
      { id: 'cat1', name: 'Books' },
      { id: 'cat2', name: 'Games' },
    ]);
  });

  // Regression test: a category that was just created is represented
  // client-side by an `optimistic-category:<mutationId>` placeholder id
  // until its create request settles. Submitting that id as a move
  // destination fails server-side ownership validation and reverts the
  // optimistic item move with an error — so it must never be offered.
  it('excludes an in-flight (optimistic) category from the move targets', () => {
    const categories = [
      { id: 'cat1', name: 'Books', order: 0 },
      { id: 'optimistic-category:mut-1', name: 'Movies', order: 1 },
    ];
    const targets = buildMoveTargets(categories);
    expect(targets.map((target) => target.name)).toEqual([
      'Default (Uncategorized)',
      'Books',
    ]);
  });

  it('returns no targets when the only category is still optimistic', () => {
    const categories = [
      { id: 'optimistic-category:mut-1', name: 'Movies', order: 0 },
    ];
    expect(buildMoveTargets(categories)).toEqual([]);
  });
});
