/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

const actionFetcher = {
  Form: (props: any) => <form {...props} />,
  submit: vi.fn(),
  state: 'idle',
  data: undefined,
} as any;

const baseProps: CategoryCardProps = {
  category: { id: 'cat1', name: 'Books', order: 0 },
  isOwner: true,
  isPublicView: false,
  canReorder: true,
  isItemReorderMode: false,
  isCategoryReorderMode: false,
  isCollapsed: false,
  isEditing: false,
  isCategoryDropHighlighted: false,
  dragState: 'idle',
  itemsForCategory: [],
  itemIds: [],
  optimisticCategories: [],
  actionFetcher,
  onToggleCollapse: vi.fn(),
  onSetEditing: vi.fn(),
  onRequestDelete: vi.fn(),
  onOpenQuickAdd: vi.fn(),
  onStartItemReorder: vi.fn(),
  onStartCategoryReorder: vi.fn(),
  onStatusChange: vi.fn(),
  onAttachClientMutationId: vi.fn(),
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

  it('shows action menu when not in reorder mode', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <WishlistCategoryCard {...baseProps} />,
      },
    ]);
    render(<App />);
    expect(
      screen.getByText('Category actions for Books'),
    ).toBeInTheDocument();
  });

  it('hides action menu in item reorder mode', () => {
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
      screen.queryByText('Category actions for Books'),
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

  it('shows rename form when isEditing', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard {...baseProps} isEditing={true} />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onRequestDelete when delete action selected', () => {
    const onRequestDelete = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            onRequestDelete={onRequestDelete}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(
      screen.getByRole('menuitem', { name: /delete category/i }),
    );
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: 'cat1',
      name: 'Books',
    });
  });

  it('shows drag handle when categoryHandle prop provided', () => {
    const categoryHandle = {
      attributes: {} as any,
      listeners: {} as any,
      setActivatorNodeRef: vi.fn(),
      isDragging: false,
    };
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistCategoryCard
            {...baseProps}
            categoryHandle={categoryHandle}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: /drag category books/i }),
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
