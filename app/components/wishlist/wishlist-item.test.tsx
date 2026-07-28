/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WishlistItem,
  parseDisplayUrl,
  toPurchaseBySentinel,
} from './wishlist-item';

const mockOpenView = vi.fn();
const mockOpenEdit = vi.fn();
let mockUser = { id: 'owner-id', roles: [] as string[] };

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

vi.mock('#app/utils/user.ts', async () => {
  const actual = await vi.importActual('#app/utils/user.ts');
  return {
    ...actual,
    useOptionalUser: () => mockUser,
    userHasPermission: () => true,
  };
});

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return { ...actual, useIsPending: () => false };
});

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef((_props: any, ref: any) => {
    const { trigger } = _props ?? {};

    React.useImperativeHandle(
      ref,
      () => ({
        open: vi.fn(),
        close: vi.fn(),
        toggle: vi.fn(),
        openView: mockOpenView,
        openEdit: mockOpenEdit,
        openCreate: vi.fn(),
      }),
      [],
    );

    return trigger ?? null;
  });

  return { WishlistItemEditor };
});

describe('WishlistItem', () => {
  beforeEach(() => {
    mockOpenView.mockClear();
    mockOpenEdit.mockClear();
    mockUser = { id: 'owner-id', roles: [] };
  });

  const getFirstWishlistItemRow = () => {
    const row = screen.getAllByTestId('wishlist-item-row')[0];
    if (!row) {
      throw new Error('Expected wishlist row trigger');
    }
    return row;
  };

  const getLastWishlistItemRow = () => {
    const row = screen.getAllByTestId('wishlist-item-row').at(-1);
    if (!row) {
      throw new Error('Expected wishlist row trigger');
    }
    return row;
  };

  it('opens the editor when owners tap the mobile trigger', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Item one',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const trigger = getLastWishlistItemRow();
    await user.click(trigger);

    expect(mockOpenEdit).toHaveBeenCalledWith();
  });

  it('renders the formatted price when the item has one and omits it otherwise', () => {
    const baseItem = {
      id: 'item-1',
      title: 'Item one',
      note: null,
      url: null,
      type: 'text',
      categoryId: null,
      ownerId: 'owner-id',
      updatedAt: new Date(),
      status: 'ACTIVE' as const,
    };

    const { rerender } = render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{ ...baseItem, priceCents: 1999, currency: 'USD' }}
      />,
    );
    expect(screen.getByTestId('wishlist-item-price')).toHaveTextContent(
      '$19.99',
    );

    rerender(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{ ...baseItem, priceCents: 125000, currency: 'EUR' }}
      />,
    );
    expect(screen.getByTestId('wishlist-item-price')).toHaveTextContent(
      '€1,250.00',
    );

    rerender(<WishlistItem isOwner categories={[]} wishlistItem={baseItem} />);
    expect(screen.queryByTestId('wishlist-item-price')).not.toBeInTheDocument();
  });

  it('opens the editor when owners click the desktop row', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Item one',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const row = getFirstWishlistItemRow();
    await user.click(row);

    expect(mockOpenEdit).toHaveBeenCalledWith();
  });

  it('renders owner row hooks and action menu without opening viewer', () => {
    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Item one',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const row = getFirstWishlistItemRow();
    expect(row).toHaveAttribute('data-drag-state', 'idle');
    const actionsButton = screen.getAllByRole('button', {
      name: /item actions for item one/i,
    })[0];
    if (!actionsButton) {
      throw new Error('Expected item actions button');
    }
    fireEvent.click(actionsButton);
    expect(mockOpenView).not.toHaveBeenCalled();
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });

  it('keeps the delete dialog open after selecting delete from the actions menu', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Item one',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const actionsButton = screen.getAllByRole('button', {
      name: /item actions for item one/i,
    })[0];
    if (!actionsButton) {
      throw new Error('Expected item actions button');
    }

    await user.click(actionsButton);
    await user.click(
      await screen.findByRole('menuitem', { name: /delete item/i }),
    );

    expect(
      await screen.findByRole('dialog', { name: /delete wishlist item/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: /delete item/i }),
    ).not.toBeInTheDocument();
  });

  it('disables owner row open behavior and hides actions in reorder mode', () => {
    render(
      <WishlistItem
        isOwner
        categories={[]}
        isReorderMode
        wishlistItem={{
          id: 'item-1',
          title: 'Item one',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const trigger = getFirstWishlistItemRow();
    fireEvent.pointerDown(trigger, {
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });

    expect(mockOpenView).not.toHaveBeenCalled();
    expect(mockOpenEdit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /item actions for item one/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the viewer when non-owners click the wishlist row', async () => {
    const user = userEvent.setup();
    mockUser = { id: 'friend-id', roles: [] };

    render(
      <WishlistItem
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Friend item',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const row = getFirstWishlistItemRow();
    await user.click(row);

    expect(mockOpenView).toHaveBeenCalledWith();
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });

  it('does not open the viewer when non-owners click the claim button', async () => {
    const user = userEvent.setup();
    mockUser = { id: 'friend-id', roles: [] };

    render(
      <WishlistItem
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Friend item',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
          claim: null,
        }}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /i'll grab this gift/i }),
    );

    expect(mockOpenView).not.toHaveBeenCalled();
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });

  it('opens the viewer when non-owners press Enter on the row button', async () => {
    const user = userEvent.setup();
    mockUser = { id: 'friend-id', roles: [] };

    render(
      <WishlistItem
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Friend item',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    getFirstWishlistItemRow().focus();
    await user.keyboard('{Enter}');

    expect(mockOpenView).toHaveBeenCalledWith();
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });

  it('renders a "Claimed" badge in the right slot for read-only claimed items', () => {
    mockUser = { id: 'viewer-id', roles: [] };

    render(
      <WishlistItem
        categories={[]}
        disableClaims
        wishlistItem={{
          id: 'item-1',
          title: 'Public Claimed Item',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
          claim: { claimedByUserId: 'friend-id' },
        }}
      />,
    );

    // The new row renders the claim state in a right-slot pill instead of
    // inside the row button itself, so assert on the Card ancestor rather
    // than on the row button specifically.
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('renders a "Claimed" badge for a pool-held item too, not just a solo claim', () => {
    // Regression test: a pool claim has `claimedByUserId: null` (the pool
    // holds it, not a person). Deriving "is this claimed" from that field
    // directly — as this component used to — collapsed a pool hold to the
    // same shape as "unclaimed", so this exact item used to render as
    // free-to-grab instead of claimed.
    mockUser = { id: 'viewer-id', roles: [] };

    render(
      <WishlistItem
        categories={[]}
        disableClaims
        wishlistItem={{
          id: 'item-1',
          title: 'Pool Claimed Item',
          note: 'A note',
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
          claim: { claimedByUserId: null },
        }}
      />,
    );

    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });
});

describe('toPurchaseBySentinel', () => {
  it('returns null for an unclaimed item', () => {
    expect(toPurchaseBySentinel(null)).toBeNull();
    expect(toPurchaseBySentinel(undefined)).toBeNull();
  });

  it('returns the real user id for a solo claim', () => {
    expect(toPurchaseBySentinel({ claimedByUserId: 'user-1' })).toBe('user-1');
  });

  it('returns a non-null sentinel — never a real user id — for a pool-held claim', () => {
    const sentinel = toPurchaseBySentinel({ claimedByUserId: null });
    expect(sentinel).not.toBeNull();
    expect(sentinel).not.toBe('user-1');
    // Deterministic and distinct from an unclaimed item, so every
    // `purchaseBy === userId` / `!== userId` comparison downstream treats a
    // pool hold as "claimed by someone else" rather than "free to claim".
    expect(sentinel).toBe(toPurchaseBySentinel({ claimedByUserId: null }));
  });
});

describe('parseDisplayUrl', () => {
  it('returns host and href for a valid https URL', () => {
    const result = parseDisplayUrl('https://www.amazon.com/hz/wishlist/ls/abc');
    expect(result).toEqual({
      host: 'amazon.com',
      href: 'https://www.amazon.com/hz/wishlist/ls/abc',
    });
  });

  it('returns null for a javascript: URL', () => {
    expect(parseDisplayUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for a data: URL', () => {
    expect(
      parseDisplayUrl('data:text/html,<script>alert(1)</script>'),
    ).toBeNull();
  });

  it('returns null for a malformed string', () => {
    expect(parseDisplayUrl('not a url at all')).toBeNull();
  });

  it('strips www from the host', () => {
    const result = parseDisplayUrl('https://www.example.com/path');
    expect(result?.host).toBe('example.com');
  });
});

describe('WishlistItem — list link type', () => {
  beforeEach(() => {
    mockUser = { id: 'friend-id', roles: [] };
  });

  it('renders a "List link" badge for wishlist-type items', () => {
    render(
      <WishlistItem
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'My Amazon Wishlist',
          note: null,
          url: 'https://www.amazon.com/hz/wishlist/ls/abc',
          type: 'wishlist',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    expect(screen.getByText('List link')).toBeInTheDocument();
  });

  it('does not render a "List link" badge for gift-idea items', () => {
    render(
      <WishlistItem
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'A Gift Idea',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    expect(screen.queryByText('List link')).not.toBeInTheDocument();
  });

  it('renders a Visit link for non-owners viewing a list link with a valid URL', () => {
    render(
      <WishlistItem
        categories={[]}
        disableClaims
        wishlistItem={{
          id: 'item-1',
          title: 'My Amazon Wishlist',
          note: null,
          url: 'https://www.amazon.com/hz/wishlist/ls/abc',
          type: 'wishlist',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const visitLink = screen.getByRole('link', { name: /visit/i });
    expect(visitLink).toBeInTheDocument();
    // Routes through /out so the click is tagged + counted server-side.
    expect(visitLink).toHaveAttribute('href', '/out?item=item-1');
    expect(visitLink).toHaveAttribute('target', '_blank');
    expect(visitLink).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  });

  it('does not render a Visit link when the stored URL has a non-http(s) scheme', () => {
    render(
      <WishlistItem
        categories={[]}
        disableClaims
        wishlistItem={{
          id: 'item-1',
          title: 'Suspicious List',
          note: null,
          url: 'javascript:alert(1)',
          type: 'wishlist',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    expect(
      screen.queryByRole('link', { name: /visit/i }),
    ).not.toBeInTheDocument();
  });

  it('does not render a Visit link when the list link has no URL', () => {
    render(
      <WishlistItem
        categories={[]}
        disableClaims
        wishlistItem={{
          id: 'item-1',
          title: 'Unnamed List',
          note: null,
          url: null,
          type: 'wishlist',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    expect(
      screen.queryByRole('link', { name: /visit/i }),
    ).not.toBeInTheDocument();
  });
});

describe('WishlistItem — owner ⋮ menu type-change', () => {
  beforeEach(() => {
    mockOpenView.mockClear();
    mockOpenEdit.mockClear();
    mockUser = { id: 'owner-id', roles: [] };
  });

  it('opens the editor when "Mark as list link" is clicked and the item has no URL', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Gift with no URL',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const actionsButton = screen.getAllByRole('button', {
      name: /item actions for gift with no url/i,
    })[0];
    if (!actionsButton) throw new Error('Expected actions button');

    await user.click(actionsButton);
    await user.click(
      await screen.findByRole('menuitem', { name: /mark as list link/i }),
    );

    expect(mockOpenEdit).toHaveBeenCalledOnce();
  });

  it('does not open the editor when "Mark as list link" is clicked and the item already has a URL', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItem
        isOwner
        categories={[]}
        wishlistItem={{
          id: 'item-1',
          title: 'Gift with URL',
          note: null,
          url: 'https://www.amazon.com/dp/B001',
          type: 'text',
          categoryId: null,
          ownerId: 'owner-id',
          updatedAt: new Date(),
          status: 'ACTIVE',
        }}
      />,
    );

    const actionsButton = screen.getAllByRole('button', {
      name: /item actions for gift with url/i,
    })[0];
    if (!actionsButton) throw new Error('Expected actions button');

    await user.click(actionsButton);
    await user.click(
      await screen.findByRole('menuitem', { name: /mark as list link/i }),
    );

    // When a URL is already set the quick-convert path is taken, not the editor
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });
});
