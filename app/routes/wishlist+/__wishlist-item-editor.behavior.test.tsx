/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistItemEditor } from './__wishlist-item-editor';

const track = vi.fn();
const actionDataSnapshot: {
  value:
    | undefined
    | {
        analyticsEventId?: string | null;
        imageAction?: 'none' | 'upload' | 'url' | 'auto-detect' | 'remove';
        imageError?: string | null;
        intent?: 'save' | 'save-add-another';
        requestId?: string;
        result?: { status?: string };
      };
} = {
  value: undefined,
};

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: true,
    media: '(min-width: 640px)',
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

vi.mock('#app/components/toaster.tsx', () => ({
  useToast: () => {},
}));

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/utils/request-info.ts', () => ({
  useOptionalRequestInfo: () => ({ requestId: 'fallback-request' }),
}));

// Shared snapshot backing every useFetcher() in the editor. Only the
// enrichment test populates `data`; the status fetcher tolerates it because
// it only reads `data.ok`/`data.status`, which stay undefined.
const fetcherSnapshot: {
  data: unknown;
  state: 'idle' | 'submitting' | 'loading';
  submit: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  state: 'idle',
  submit: vi.fn(),
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  const Form = React.forwardRef<HTMLFormElement, React.ComponentProps<'form'>>(
    (props, ref) => <form ref={ref} {...props} />,
  );

  return {
    ...actual,
    Form,
    useActionData: () => actionDataSnapshot.value,
    useFetcher: () => ({
      Form,
      get data() {
        return fetcherSnapshot.data;
      },
      get state() {
        return fetcherSnapshot.state;
      },
      submit: (...args: Array<unknown>) => fetcherSnapshot.submit(...args),
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
  categoryId: null as string | null,
  hasImage: false,
  id: 'item-1',
  imageSource: null,
  note: null,
  status: 'ACTIVE' as const,
  title: 'My Item',
  type: 'text' as const,
  updatedAt: new Date(),
  url: null,
};

beforeEach(() => {
  actionDataSnapshot.value = undefined;
  track.mockReset();
  fetcherSnapshot.data = undefined;
  fetcherSnapshot.state = 'idle';
  fetcherSnapshot.submit.mockReset();
  // Keep URL constructible (the enrichment hook calls `new URL(...)`) while
  // stubbing the object-URL statics jsdom doesn't implement.
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    }),
  );
});

describe('wishlist item editor behavior', () => {
  it('unfurls on link blur and prefills only fields the user has not touched', async () => {
    const user = userEvent.setup();

    const view = render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const linkField = screen.getByLabelText('Link');
    await user.type(linkField, 'https://shop.example.com/widget');
    fireEvent.blur(linkField);

    expect(fetcherSnapshot.submit).toHaveBeenCalledWith(
      { url: 'https://shop.example.com/widget' },
      { method: 'POST', action: '/api/wishlist/unfurl' },
    );

    // Deliver the unfurl result and re-render so the prefill effect runs.
    fetcherSnapshot.data = {
      result: {
        title: 'Acme Widget',
        imageUrl: null,
        priceCents: 4999,
        currency: 'USD',
        source: 'structured',
      },
    };
    view.rerender(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Title for your item')).toHaveValue(
        'Acme Widget',
      );
      expect(screen.getByLabelText('Price (optional)')).toHaveValue('49.99');
    });
    expect(
      document.querySelector<HTMLInputElement>('input[name="currency"]')?.value,
    ).toBe('USD');
    expect(
      document.querySelector<HTMLInputElement>('input[name="enrichedFields"]')
        ?.value,
    ).toBe('title,price');
    expect(
      screen.getByText('Filled from link — edit anything that looks off.'),
    ).toBeInTheDocument();
  });

  it('never overwrites a title the user already typed', async () => {
    const user = userEvent.setup();

    const view = render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    await user.type(
      screen.getByPlaceholderText('Title for your item'),
      'My own title',
    );
    const linkField = screen.getByLabelText('Link');
    await user.type(linkField, 'https://shop.example.com/widget');
    fireEvent.blur(linkField);

    fetcherSnapshot.data = {
      result: {
        title: 'Scraped Title',
        imageUrl: null,
        priceCents: 1000,
        currency: null,
        source: 'structured',
      },
    };
    view.rerender(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Price (optional)')).toHaveValue('10.00');
    });
    expect(screen.getByPlaceholderText('Title for your item')).toHaveValue(
      'My own title',
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="enrichedFields"]')
        ?.value,
    ).toBe('price');
  });

  // Regression for GIFTPOOL-UI-1T. useUrlEnrichment lives in the outer editor,
  // so its fetcher outlives the <form>, which only exists while the dialog is
  // open and in edit mode. When the unfurl lands after the form has gone,
  // readFieldValue reads through a null formRef and returns '' — which looks
  // exactly like "the field is empty" — so the prefill ran and Conform's
  // form.update threw out of requestSubmit. Closing after a save is the real
  // path: useSubmissionImageSync closes the dialog on a successful save, which
  // can easily beat an in-flight unfurl.
  it('does not crash when the unfurl lands after the dialog has closed', async () => {
    const user = userEvent.setup();

    const view = render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const linkField = screen.getByLabelText('Link');
    await user.type(linkField, 'https://shop.example.com/widget');
    fireEvent.blur(linkField);
    expect(fetcherSnapshot.submit).toHaveBeenCalled();

    // Close the dialog while the unfurl is still in flight.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
    });

    // The response arrives with no form mounted to receive it.
    fetcherSnapshot.data = {
      result: {
        title: 'Acme Widget',
        imageUrl: null,
        priceCents: 4999,
        currency: 'USD',
        source: 'structured',
      },
    };
    expect(() =>
      view.rerender(
        <WishlistItemEditor
          canEdit
          initialMode="create"
          trigger={<button type="button">Open</button>}
        />,
      ),
    ).not.toThrow();

    // And the editor still works afterwards.
    await user.click(screen.getByText('Open'));
    expect(await screen.findByLabelText('Link')).toBeInTheDocument();
  });

  it('shows a validation message when the image URL preview is not http(s)', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const imageUrlField = screen.getByPlaceholderText(
      'Paste an image URL or paste an image directly',
    );

    await user.type(imageUrlField, 'ftp://example.com/image.png');
    fireEvent.blur(imageUrlField);

    expect(
      await screen.findByText('Enter a valid http(s) image URL'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /wishlist item image/i }),
    ).not.toBeInTheDocument();
  });

  it('surfaces server image warnings when no existing image is available', async () => {
    actionDataSnapshot.value = {
      imageAction: 'none',
      imageError: 'Unable to process image automatically',
      result: { status: 'error' },
    };

    render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await userEvent.click(screen.getByText('Open'));

    expect(
      await screen.findByText('Unable to process image automatically'),
    ).toBeInTheDocument();
  });

  it('tracks wishlist item creation analytics once after a successful save', async () => {
    actionDataSnapshot.value = {
      analyticsEventId: 'analytics-1',
      intent: 'save',
      requestId: 'request-1',
      result: { status: 'success' },
    };

    const { rerender } = render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('wishlist_item_added', undefined, {
        eventId: 'analytics-1',
        requestId: 'request-1',
      });
    });

    rerender(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    expect(track).toHaveBeenCalledTimes(1);
  });

  // Regression for #562. Conform's update intent runs through a synchronous
  // requestSubmit that re-snapshots the live form, so two form.update calls in
  // one tick made the second read the first field before React had flushed its
  // DOM write: Title reverted to empty in Conform's state and re-validated as
  // "Required" while the input still showed the fetched text. Only reproduces
  // once Title has been validated (a submit attempt) AND the unfurl returns
  // both a title and a price — one prefilled field alone was always fine.
  it('clears the Required error when the unfurl prefills title and price together', async () => {
    const user = userEvent.setup();

    const view = render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    // Submitting the empty form marks Title touched and shows "Required".
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const title = screen.getByPlaceholderText('Title for your item');
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'));

    const linkField = screen.getByLabelText('Link');
    await user.type(linkField, 'https://store.example.com/wolverine');
    fireEvent.blur(linkField);

    fetcherSnapshot.data = {
      result: {
        title: 'Marvel Wolverine',
        imageUrl: null,
        priceCents: 6999,
        currency: 'USD',
        source: 'structured',
      },
    };
    view.rerender(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Title for your item')).toHaveValue(
        'Marvel Wolverine',
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Price (optional)')).toHaveValue('69.99');
    });
    // The prefilled value must count as valid, not sit under a stale error.
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Title for your item'),
      ).not.toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('autofocuses the link field on desktop when adding a new item', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    await waitFor(() => expect(screen.getByLabelText('Link')).toHaveFocus());
  });

  // Autofocus exists to invite the paste that starts a NEW item. Editing an
  // existing one is a different flow — the fields are already populated — so
  // focus stays on the dialog rather than being stolen into the link field or
  // falling through to the first tabbable control ("Remove from wishlist").
  it('does not autofocus the link field when editing an existing item', async () => {
    const user = userEvent.setup();

    render(
      <WishlistItemEditor
        canEdit
        initialMode="edit"
        wishlistItem={baseItem}
        trigger={<button type="button">Open</button>}
      />,
    );

    await user.click(screen.getByText('Open'));
    const link = await screen.findByLabelText('Link');
    expect(link).not.toHaveFocus();
    expect(document.activeElement).toHaveAttribute('role', 'dialog');
  });
});

describe('wishlist item editor on mobile', () => {
  const renderAsMobileSheet = () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: '(min-width: 640px)',
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    return render(
      <WishlistItemEditor
        canEdit
        initialMode="create"
        trigger={<button type="button">Open</button>}
      />,
    );
  };

  // The autofocused link field is the paste-first fast path on desktop, but on
  // a phone it springs the on-screen keyboard over the sheet before the user
  // has chosen to type. Radix's FocusScope is a separate mechanism, so the
  // editor also has to stop the fallback from landing on the first tabbable
  // control ("Remove from wishlist" in edit mode) — see the onOpenAutoFocus
  // handler on the sheet content.
  it('does not autofocus the link field', async () => {
    const user = userEvent.setup();

    renderAsMobileSheet();

    await user.click(screen.getByText('Open'));
    const link = await screen.findByLabelText('Link');
    expect(link).not.toHaveFocus();
    // Nor may focus fall through to the first tabbable control; it stays on
    // the sheet itself so the title is announced first.
    expect(document.activeElement).toHaveAttribute('role', 'dialog');
  });
});
