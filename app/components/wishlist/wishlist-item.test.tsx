/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistItem } from './wishlist-item';

const mockOpenView = vi.fn();

vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
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
    useOptionalUser: () => ({ id: 'owner-id', roles: [] }),
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
        openEdit: vi.fn(),
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
  });

  it('opens the viewer when owners tap the mobile trigger', () => {
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

    const trigger = screen.getByRole('button', { name: /item one/i });

    fireEvent.pointerDown(trigger, { pointerType: 'touch', clientX: 0, clientY: 0 });
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });

    expect(mockOpenView).toHaveBeenCalledWith({ fromTrigger: true });
  });
});
