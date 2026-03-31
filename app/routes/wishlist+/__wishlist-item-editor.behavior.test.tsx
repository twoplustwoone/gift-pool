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
      data: undefined,
      state: 'idle',
      submit: vi.fn(),
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
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
  });
});

describe('wishlist item editor behavior', () => {
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
});
