/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from '@remix-run/testing';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Wishlist } from './index';

vi.mock('#app/utils/user.ts', async () => {
  const actual = await vi.importActual('#app/utils/user.ts');
  return {
    ...actual,
    useOptionalUser: () => ({ id: 'user1', roles: [] }),
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

vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: () => ({ Form: (props: any) => <form {...props} /> }),
  };
});

vi.mock('#app/routes/wishlist+/__wishlist-item-editor', () => {
  const React = require('react');
  const WishlistItemEditor = React.forwardRef((_props: any, ref: any) => {
    // support trigger passthrough like the real component
    const { trigger } = _props ?? {};

    // provide a stub handle so calls like editorRef.current?.openView() don't blow up
    React.useImperativeHandle(
      ref,
      () => ({
        open: () => {},
        close: () => {},
        toggle: () => {},
        openView: () => {},
        openEdit: () => {},
        openCreate: () => {},
      }),
      [],
    );

    return trigger ?? React.createElement('div', null, 'editor');
  });

  return { WishlistItemEditor };
});

describe('Wishlist components', () => {
  it('renders wishlist with items', async () => {
    const App = createRemixStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              username: 'jane',
              name: 'Jane',
              image: { id: 'img1' },
              wishlistItems: [
                {
                  id: '1',
                  title: 'Item one',
                  ownerId: 'user1',
                  note: null,
                  url: null,
                  type: 'text',
                },
              ],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText("Jane's Wishlist");
    // 2 items: one for the desktop view, one for the mobile view
    expect(await screen.findAllByText('Item one')).toHaveLength(2);
  });

  it('shows empty message for others', async () => {
    const App = createRemixStub([
      {
        path: '/',
        Component: () => (
          <Wishlist
            isOwner={false}
            user={{
              username: 'jim',
              name: 'Jim',
              image: { id: 'img1' },
              wishlistItems: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText(
      "Jim doesn't have any items in their wishlist yet!",
    );
  });
});
