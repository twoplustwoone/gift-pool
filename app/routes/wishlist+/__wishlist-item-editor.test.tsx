/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// Capture the real URL class before any beforeEach can stub it. Tests that
// need looksLikeWishlistUrl to work (which uses new URL()) must restore this.
const NativeURL = URL;

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

describe('WishlistItemEditor — Phase 2: list link behaviour', () => {
  beforeEach(() => {
    // Restore the real URL constructor so looksLikeWishlistUrl (which calls
    // new URL()) works correctly inside these tests. The outer beforeEach
    // replaces URL with a plain object that has no constructor.
    vi.stubGlobal('URL', NativeURL);
  });

  it('hides the image section when type is switched to list link', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    // Image section visible initially (gift idea)
    expect(screen.getByLabelText('Image')).toBeInTheDocument();

    // Switch to List link
    await user.click(screen.getByRole('button', { name: /list link/i }));

    // Image section container should have the Tailwind 'hidden' class
    // (jsdom doesn't compute CSS so we check the class directly)
    const imageSection = screen.getByLabelText('Image').closest('.space-y-3');
    expect(imageSection).toHaveClass('hidden');
  });

  it('shows "Description" label in gift-idea mode', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, type: 'text', status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
  });

  it('shows "Note for friends" label in list-link mode', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, type: 'wishlist', status: 'ACTIVE', url: 'https://www.amazon.com/hz/wishlist/ls/abc' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    expect(screen.getByRole('textbox', { name: /note for friends/i })).toBeInTheDocument();
  });

  it('shows the list-link suggestion when a wishlist URL is entered', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, type: 'text', status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    const urlInput = screen.getByRole('textbox', { name: /link/i });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://www.amazon.com/hz/wishlist/ls/ABC123');

    expect(
      screen.getByText(/looks like an external wishlist/i),
    ).toBeInTheDocument();
  });

  it('dismisses the suggestion when the X button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, type: 'text', status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    const urlInput = screen.getByRole('textbox', { name: /link/i });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://www.amazon.com/hz/wishlist/ls/ABC123');

    await user.click(screen.getByRole('button', { name: /dismiss suggestion/i }));

    expect(
      screen.queryByText(/looks like an external wishlist/i),
    ).not.toBeInTheDocument();
  });

  it('switches to list link when the suggestion is accepted', async () => {
    const user = userEvent.setup();
    render(
      <WishlistItemEditor
        wishlistItem={{ ...baseItem, type: 'text', status: 'ACTIVE' }}
        canEdit
        initialMode="edit"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));

    const urlInput = screen.getByRole('textbox', { name: /link/i });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://www.amazon.com/hz/wishlist/ls/ABC123');

    // Click the "List link" button inside the suggestion banner (not the segment control)
    const suggestionBanner = screen.getByText(/looks like an external wishlist/i).closest('div');
    await user.click(within(suggestionBanner!).getByRole('button', { name: /list link/i }));

    // After accepting, the suggestion should disappear and label should flip
    expect(
      screen.queryByText(/looks like an external wishlist/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /note for friends/i })).toBeInTheDocument();
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
    expect(screen.getByLabelText('Image')).toHaveAttribute('type', 'file');
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

