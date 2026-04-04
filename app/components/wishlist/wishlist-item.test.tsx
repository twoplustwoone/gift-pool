/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistItem } from './wishlist-item';

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
        layout="reorder"
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
          purchase: null,
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

  it('renders already claimed inside the row button for read-only claimed items', () => {
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
          purchase: { purchasedById: 'friend-id' },
        }}
      />,
    );

    expect(getFirstWishlistItemRow()).toHaveTextContent(/already claimed/i);
  });
});
