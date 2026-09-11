/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { OrganizeBanner, OrganizeCategoriesPanel } from './wishlist-organize';

// Hoisted so every `useFetcher()` call returns the SAME `Form` component
// reference. An inline `(props) => <form {...props} />` defined per call
// would give React a new component type on every re-render, unmounting
// and remounting the form (and any input inside it, losing focus/typed
// state) instead of reconciling in place.
const MockFetcherForm = (props: any) => <form {...props} />;

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: MockFetcherForm,
      submit: vi.fn(),
      state: 'idle',
      data: undefined,
    }),
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

function renderWithStub(ui: ReactElement) {
  const App = createRoutesStub([{ path: '/', Component: () => ui }]);
  return render(<App />);
}

describe('OrganizeBanner', () => {
  it('sticks below the fixed top bar, not behind it', () => {
    // This banner sticks to the app's single scroll container, whose
    // scrollport starts at the top of the viewport — behind the fixed header.
    // A bare `top-2` parks it underneath, invisible, the moment the header
    // reveals on scroll-up.
    const { container } = renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={false}
        isItemReorderMode
        onDone={() => {}}
        onModeChange={() => {}}
      />,
    );
    const banner = container.querySelector('.sticky')!;
    expect(banner.className).toContain('var(--top-bar-height)');
    expect(banner.className).not.toMatch(/\btop-2\b/);
  });

  it('shows the items-mode description by default', () => {
    renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={false}
        isItemReorderMode={true}
        onDone={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/reorder items or move them between categories/i),
    ).toBeInTheDocument();
  });

  it('shows the categories-mode description when in category reorder mode', () => {
    renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={true}
        isItemReorderMode={false}
        onDone={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/reorder, rename, or remove categories/i),
    ).toBeInTheDocument();
  });

  it('calls onModeChange with the selected mode', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={false}
        isItemReorderMode={true}
        onDone={vi.fn()}
        onModeChange={onModeChange}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /category reorder mode/i }),
    );
    expect(onModeChange).toHaveBeenCalledWith('categories');

    await user.click(
      screen.getByRole('button', { name: /item reorder mode/i }),
    );
    expect(onModeChange).toHaveBeenCalledWith('items');
  });

  it('reflects the active mode via aria-pressed', () => {
    renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={true}
        isItemReorderMode={false}
        onDone={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /category reorder mode/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /item reorder mode/i }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onDone when Done organizing is clicked', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithStub(
      <OrganizeBanner
        isCategoryReorderMode={false}
        isItemReorderMode={true}
        onDone={onDone}
        onModeChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /done organizing/i }));
    expect(onDone).toHaveBeenCalled();
  });
});

const baseCategoriesProps = {
  customCategories: [
    { id: 'cat1', name: 'Books', order: 0 },
    { id: 'cat2', name: 'Games', order: 1 },
  ],
  defaultCategory: { id: null, name: 'Default (Uncategorized)', order: -1 },
  dragState: 'idle' as const,
  itemIdsByCategoryKey: {
    default: ['item1', 'item2'],
    cat1: ['item3'],
    cat2: [],
  },
  onMoveCategoryByOffset: vi.fn(),
  onMutationResult: vi.fn(),
  onRequestDelete: vi.fn(),
};

describe('OrganizeCategoriesPanel', () => {
  it('renders the default category row with its item count', () => {
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);
    expect(screen.getByText('Default (Uncategorized)')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders every custom category with its item count', () => {
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('omits the default row when there is no default category', () => {
    renderWithStub(
      <OrganizeCategoriesPanel
        {...baseCategoriesProps}
        defaultCategory={null}
      />,
    );
    expect(
      screen.queryByText('Default (Uncategorized)'),
    ).not.toBeInTheDocument();
  });

  it('calls onMoveCategoryByOffset when a move button is used', async () => {
    const user = userEvent.setup();
    const onMoveCategoryByOffset = vi.fn();
    renderWithStub(
      <OrganizeCategoriesPanel
        {...baseCategoriesProps}
        onMoveCategoryByOffset={onMoveCategoryByOffset}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Move Books down' }));
    expect(onMoveCategoryByOffset).toHaveBeenCalledWith('cat1', 1);

    await user.click(screen.getByRole('button', { name: 'Move Games up' }));
    expect(onMoveCategoryByOffset).toHaveBeenCalledWith('cat2', -1);
  });

  it('disables the up move on the first category and the down move on the last', () => {
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);
    expect(
      screen.getByRole('button', { name: 'Move Books up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Games down' }),
    ).toBeDisabled();
  });

  it('switches a category into an inline rename form and back', async () => {
    const user = userEvent.setup();
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);

    await user.click(
      screen.getByRole('button', { name: 'Rename category Books' }),
    );
    const input = screen.getByDisplayValue('Books');
    expect(input).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel rename' }));
    expect(screen.queryByDisplayValue('Books')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rename category Books' }),
    ).toBeInTheDocument();
  });

  it('calls onRequestDelete with the category id and name', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    renderWithStub(
      <OrganizeCategoriesPanel
        {...baseCategoriesProps}
        onRequestDelete={onRequestDelete}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Delete category Games' }),
    );
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: 'cat2',
      name: 'Games',
    });
  });

  it('shows drag handles for every custom category', () => {
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);
    expect(
      screen.getByRole('button', { name: 'Drag category Books' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drag category Games' }),
    ).toBeInTheDocument();
  });

  it('lets the create-category input be typed into', async () => {
    const user = userEvent.setup();
    renderWithStub(<OrganizeCategoriesPanel {...baseCategoriesProps} />);
    const input = screen.getByPlaceholderText('Category name');
    await user.type(input, 'Movies');
    expect(input).toHaveValue('Movies');
  });
});
