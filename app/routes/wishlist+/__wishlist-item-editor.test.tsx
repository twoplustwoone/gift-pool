/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistItemEditor } from './__wishlist-item-editor';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    media: '(min-width: 640px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

vi.mock('#app/components/toaster.tsx', () => ({
  useToast: () => {},
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  const Form = React.forwardRef<HTMLFormElement, React.ComponentProps<'form'>>(
    (props, ref) => <form ref={ref} {...props} />,
  );
  return {
    ...actual,
    Form,
    useActionData: () => undefined,
    useFetcher: () => ({
      Form,
      submit: vi.fn(),
      state: 'idle',
      data: undefined,
    }),
    useRevalidator: () => ({ revalidate: vi.fn() }),
  };
});

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return {
    ...actual,
    useIsPending: () => false,
  };
});

const baseItem = {
  id: 'item-1',
  title: 'My Item',
  url: null,
  note: null,
  type: 'text' as const,
  categoryId: null as string | null,
  hasImage: false,
  imageSource: null,
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
  });
});

describe('WishlistItemEditor status section', () => {
  it('renders active state with remove action and no dropdown', async () => {
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, status: 'ACTIVE' }}
        canEdit
        initialMode="view"
        trigger={<button type="button">Open</button>}
      />,
    );

    await userEvent.click(screen.getByText('Open'));

    expect(screen.getAllByRole('button', { name: /edit item/i })).toHaveLength(
      1,
    );
    expect(screen.queryByRole('combobox', { name: /item status/i })).toBeNull();
    expect(screen.getByText('Item status')).toBeInTheDocument();
    expect(screen.getAllByText('On wishlist')).toHaveLength(2);
    expect(screen.getByText('Visible to friends')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove from wishlist/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This moves the item to Past items. You can restore it anytime.',
      ),
    ).toBeInTheDocument();
  });

  it('renders past state with restore action and no dropdown', async () => {
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, status: 'ARCHIVED' }}
        canEdit
        initialMode="view"
        trigger={<button type="button">Open</button>}
      />,
    );

    await userEvent.click(screen.getByText('Open'));

    expect(screen.queryByRole('combobox', { name: /item status/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /edit item/i })).toHaveLength(
      1,
    );
    expect(screen.getByText('Item status')).toBeInTheDocument();
    expect(screen.getAllByText('Past item')).toHaveLength(2);
    expect(screen.getByText('Not shown on your wishlist')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /restore to wishlist/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Restoring will add this item back to your wishlist.'),
    ).toBeInTheDocument();
  });
});

describe('WishlistItemEditor image reset', () => {
  it('restores the persisted image after resetting a local image preview', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, hasImage: true, status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error('Expected image file input');
    }
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['preview'], 'preview.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /my item/i })).toHaveAttribute('src', 'blob:preview');
    });

    await user.click(
      screen.getByRole('button', { name: /reset image changes/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /my item/i })).toHaveAttribute(
        'src',
        expect.stringContaining('/resources/wishlist-images/item-1'),
      );
    });
  });

  it('restores the persisted image after removing it locally', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, hasImage: true, status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    await user.click(screen.getByRole('button', { name: /remove image/i }));

    expect(screen.queryByRole('img', { name: /my item/i })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /reset image changes/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /my item/i })).toHaveAttribute(
        'src',
        expect.stringContaining('/resources/wishlist-images/item-1'),
      );
    });
  });

  it('clears transient image state when resetting in create mode', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error('Expected image file input');
    }
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['preview'], 'preview.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(document.querySelector('img')).toHaveAttribute('src', 'blob:preview');
    });

    await user.click(
      screen.getByRole('button', { name: /reset image changes/i }),
    );

    await waitFor(() => {
      expect(document.querySelector('img')).toBeNull();
    });
    expect(
      screen.getByText(/upload an image here or paste a url\/image below/i),
    ).toBeInTheDocument();
  });
});
