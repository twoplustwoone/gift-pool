/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { WishlistCategoryCard, type CategoryCardProps } from './wishlist-category-card';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
      submit: vi.fn(),
      state: 'idle',
      data: undefined,
    }),
  };
});

vi.mock('./wishlist-item', () => ({
  WishlistItem: ({ wishlistItem }: any) => (
    <div data-testid="wishlist-item">{wishlistItem.title}</div>
  ),
}));

vi.mock('./wishlist-row-actions', () => ({
  WishlistRowActionsMenu: ({ label, children }: any) => (
    <div>
      <button type="button">{label}</button>
      {children}
    </div>
  ),
  WishlistRowActionsItem: ({ onSelect, children }: any) => (
    <button type="button" role="menuitem" onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    SortableContext: ({ children }: any) => children,
  };
});

const baseProps: CategoryCardProps = {
  category: { id: 'cat1', name: 'Books', order: 0 },
  isOwner: true,
  isPublicView: false,
  canReorder: true,
  isItemReorderMode: false,
  isCategoryReorderMode: false,
  isCollapsed: false,
  isCategoryDropHighlighted: false,
  dragState: 'idle',
  itemsForCategory: [],
  itemIds: [],
  optimisticCategories: [],
  moveTargets: [],
  onToggleCollapse: vi.fn(),
  onOpenQuickAdd: vi.fn(),
  onMoveItemByOffset: vi.fn(),
  onMoveItemToCategory: vi.fn(),
  onStatusChange: vi.fn(),
};

describe('WishlistCategoryCard', () => {
  it('renders category name and item count', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistCategoryCard {...baseProps} />,
      },
    ]);
    render(<App />);
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('shows an add-item control for owners when not in reorder mode', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistCategoryCard {...baseProps} />,
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: 'Add item to Books' }),
    ).toBeInTheDocument();
  });

  it('calls onOpenQuickAdd with the category id when the add-item control is used', async () => {
    const user = userEvent.setup();
    const onOpenQuickAdd = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard {...baseProps} onOpenQuickAdd={onOpenQuickAdd} />
        ),
      },
    ]);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add item to Books' }));
    expect(onOpenQuickAdd).toHaveBeenCalledWith('cat1');
  });

  it('hides the add-item control for non-owners', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistCategoryCard {...baseProps} isOwner={false} />,
      },
    ]);
    render(<App />);
    expect(
      screen.queryByRole('button', { name: 'Add item to Books' }),
    ).not.toBeInTheDocument();
  });

  it('hides the add-item control in item reorder mode', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard {...baseProps} isItemReorderMode={true} />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.queryByRole('button', { name: 'Add item to Books' }),
    ).not.toBeInTheDocument();
  });

  it('calls onToggleCollapse on header click in normal mode', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            onToggleCollapse={onToggleCollapse}
          />
        ),
      },
    ]);
    render(<App />);
    await user.click(screen.getByRole('button', { name: /books \(0\)/i }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('calls onToggleCollapse when pressing Enter on the category header button', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            onToggleCollapse={onToggleCollapse}
          />
        ),
      },
    ]);
    render(<App />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /books \(0\)/i })).toHaveFocus();
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('shows drag handles and non-drag move buttons for items in item reorder mode', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            isItemReorderMode={true}
            itemIds={['item1']}
            itemsForCategory={[
              {
                id: 'item1',
                title: 'Novel',
                ownerId: 'owner1',
                note: null,
                url: null,
                type: 'text',
                categoryId: 'cat1',
                sortOrder: 0,
                updatedAt: new Date(),
                status: 'ACTIVE',
              },
            ]}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: 'Drag item Novel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move Novel up' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move Novel down' }),
    ).toBeInTheDocument();
  });

  it('shows drop placeholder in item reorder mode for empty category', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            isItemReorderMode={true}
            itemsForCategory={[]}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('Drop item here')).toBeInTheDocument();
  });

  it('collapses body when isCollapsed is true (outside reorder mode)', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard {...baseProps} isCollapsed={true} />
        ),
      },
    ]);
    render(<App />);
    expect(screen.queryByText('Drop item here')).not.toBeInTheDocument();
  });
});
