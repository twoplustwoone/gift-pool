/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { PastEducationCallout, PastWishlistItemCard, PastWishlistItems } from './past-wishlist-items';
import  { type WishlistItem } from './wishlist-item-state';

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef(({ trigger }: any, _ref: any) =>
    trigger ?? React.createElement('div', null, 'editor'),
  );
  return { WishlistItemEditor };
});

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
      submit: () => {},
      state: 'idle',
      data: undefined,
    }),
  };
});

const makeItem = (overrides: Partial<WishlistItem> & { id: string }): WishlistItem => ({
  id: overrides.id,
  title: overrides.title ?? `Item ${overrides.id}`,
  ownerId: 'owner1',
  note: overrides.note ?? null,
  url: null,
  type: 'text',
  categoryId: null,
  sortOrder: 0,
  updatedAt: overrides.updatedAt ?? new Date('2024-01-01'),
  status: 'ARCHIVED',
  hasImage: false,
  imageSource: null,
});

describe('PastEducationCallout', () => {
  it('renders copy text', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastEducationCallout
            onViewPast={() => {}}
            onDismissEducation={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('Item moved to Past items')).toBeInTheDocument();
  });

  it('"Got it" calls onDismissEducation', () => {
    const onDismiss = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastEducationCallout
            onViewPast={() => {}}
            onDismissEducation={onDismiss}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('"View Past items" calls onViewPast', () => {
    const onViewPast = vi.fn();
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastEducationCallout
            onViewPast={onViewPast}
            onDismissEducation={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /view past items/i }));
    expect(onViewPast).toHaveBeenCalledOnce();
  });
});

describe('PastWishlistItems', () => {
  it('shows item count badge', () => {
    const items = [makeItem({ id: '1' }), makeItem({ id: '2' })];
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastWishlistItems
            items={items}
            isOwner={true}
            categories={[]}
            showEducation={false}
            onDismissEducation={() => {}}
            onViewPast={() => {}}
            onStatusChange={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastWishlistItems
            items={[]}
            isOwner={true}
            categories={[]}
            showEducation={false}
            onDismissEducation={() => {}}
            onViewPast={() => {}}
            onStatusChange={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByText('Your past wishlist items live here'),
    ).toBeInTheDocument();
  });

  it('shows callout when showEducation is true', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastWishlistItems
            items={[]}
            isOwner={true}
            categories={[]}
            showEducation={true}
            onDismissEducation={() => {}}
            onViewPast={() => {}}
            onStatusChange={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('Item moved to Past items')).toBeInTheDocument();
  });
});

describe('PastWishlistItemCard', () => {
  it('renders title', () => {
    const item = makeItem({ id: '1', title: 'My Past Item' });
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastWishlistItemCard
            item={item}
            isOwner={true}
            categories={[]}
            onStatusChange={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('My Past Item')).toBeInTheDocument();
  });

  it('renders "Previously wanted" badge', () => {
    const item = makeItem({ id: '1' });
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PastWishlistItemCard
            item={item}
            isOwner={true}
            categories={[]}
            onStatusChange={() => {}}
          />
        ),
      },
    ]);
    render(<App />);
    expect(screen.getByText('Previously wanted')).toBeInTheDocument();
  });
});
