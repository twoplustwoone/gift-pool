/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WishlistItemEditor } from './__wishlist-item-editor';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
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

vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
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
