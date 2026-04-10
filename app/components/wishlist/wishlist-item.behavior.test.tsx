/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteWishlistItem, WishlistItem } from './wishlist-item';

const mockOpenView = vi.fn();
const mockOpenEdit = vi.fn();
const track = vi.fn();

let mockUser: { id: string; roles: string[] } | null = {
  id: 'owner-id',
  roles: [],
};
let requestInfoSnapshot: { requestId: string } | null = {
  requestId: 'fallback-request',
};
let fetcherMode: 'delete' | 'wishlist' = 'wishlist';
let useFetcherCallCount = 0;

const purchaseFetcherState = {
  Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
  data: undefined,
  state: 'idle' as const,
  submit: vi.fn(),
};

const imageFetcherState = {
  Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
  data: undefined,
  state: 'idle' as const,
  submit: vi.fn(),
};

const deleteFetcherState = {
  Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
  data: undefined as
    | undefined
    | {
        analyticsEventId?: string | null;
        requestId?: string;
        success: boolean;
      },
  state: 'idle' as const,
  submit: vi.fn(),
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => {
      if (fetcherMode === 'delete') {
        return deleteFetcherState;
      }
      useFetcherCallCount += 1;
      return [purchaseFetcherState, imageFetcherState, deleteFetcherState][
        (useFetcherCallCount - 1) % 3
      ]!;
    },
  };
});

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/utils/request-info.ts', () => ({
  useOptionalRequestInfo: () => requestInfoSnapshot,
}));

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

  return {
    ...actual,
    useIsPending: () => false,
  };
});

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef(
    ({ trigger }: { trigger?: React.ReactNode }, ref: React.ForwardedRef<unknown>) => {
      React.useImperativeHandle(
        ref,
        () => ({
          close: vi.fn(),
          open: vi.fn(),
          openCreate: vi.fn(),
          openEdit: mockOpenEdit,
          openView: mockOpenView,
          toggle: vi.fn(),
        }),
        [],
      );

      return trigger ?? null;
    },
  );

  return { WishlistItemEditor };
});

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

beforeEach(() => {
  mockOpenView.mockReset();
  mockOpenEdit.mockReset();
  track.mockReset();
  mockUser = { id: 'owner-id', roles: [] };
  requestInfoSnapshot = { requestId: 'fallback-request' };
  fetcherMode = 'wishlist';
  useFetcherCallCount = 0;
  purchaseFetcherState.submit.mockReset();
  imageFetcherState.submit.mockReset();
  deleteFetcherState.submit.mockReset();
  deleteFetcherState.data = undefined;
});

describe('wishlist item behavior', () => {
  it('swaps a broken image for a placeholder icon on the row', () => {
    // Previously the row rendered an inline "Image failed to load" state
    // with Retry + Remove buttons. In the unified row the thumbnail slot
    // just swaps the <img> for a placeholder icon when it errors — image
    // management (retry/remove) moved into the editor modal, which is
    // covered by __wishlist-item-editor.test.tsx instead.
    render(
      <WishlistItem
        categories={[]}
        isOwner
        wishlistItem={{
          categoryId: null,
          hasImage: true,
          id: 'item-1',
          imageSource: 'MANUAL_UPLOAD',
          note: 'A note',
          ownerId: 'owner-id',
          status: 'ACTIVE',
          title: 'Item one',
          type: 'text',
          updatedAt: new Date('2026-03-31T12:00:00.000Z'),
          url: null,
        }}
      />,
    );

    const image = screen.getAllByRole('img', { name: 'Item one' })[0];
    if (!(image instanceof HTMLImageElement)) {
      throw new Error('Expected wishlist image');
    }
    fireEvent.error(image);

    // The image should have been replaced by the placeholder — no more
    // <img role="img" name="Item one"> in the DOM.
    expect(screen.queryByRole('img', { name: 'Item one' })).toBeNull();
  });

  it('opens the archived item viewer instead of edit mode', async () => {
    render(
      <WishlistItem
        categories={[]}
        isOwner
        wishlistItem={{
          categoryId: null,
          id: 'item-1',
          note: 'Old idea',
          ownerId: 'owner-id',
          status: 'ARCHIVED',
          title: 'Archived item',
          type: 'text',
          updatedAt: new Date('2026-03-31T12:00:00.000Z'),
          url: null,
        }}
      />,
    );

    await userEvent.click(screen.getByText('Archived item'));

    expect(mockOpenView).toHaveBeenCalledWith();
    expect(mockOpenEdit).not.toHaveBeenCalled();
  });

  it('attaches a client mutation id on delete submit and tracks the archive analytics event', async () => {
    deleteFetcherState.data = {
      analyticsEventId: 'archive-1',
      success: true,
    };
    fetcherMode = 'delete';

    render(
      <DeleteWishlistItem
        id="item-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('wishlist_item_archived', undefined, {
        eventId: 'archive-1',
        requestId: 'fallback-request',
      });
    });

    const form = screen.getByRole('button', { name: 'Delete' }).closest('form');
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Expected delete form');
    }

    fireEvent.submit(form);

    const mutationIdInput = form.elements.namedItem(
      'clientMutationId',
    ) as HTMLInputElement | null;
    expect(mutationIdInput?.value).toBeTruthy();
  });
});
