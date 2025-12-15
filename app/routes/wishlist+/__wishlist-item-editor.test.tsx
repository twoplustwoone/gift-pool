/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistItemEditor, type WishlistItemEditorHandle } from './__wishlist-item-editor';

const fetcherSubmit = vi.fn();

vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
  return {
    ...actual,
    Form: React.forwardRef<HTMLFormElement, any>((props, ref) => (
      <form ref={ref} {...props} />
    )),
    useActionData: () => undefined,
    useFetcher: () => ({
      submit: fetcherSubmit,
      state: 'idle',
      data: undefined,
    }),
  };
});

vi.mock('#app/components/toaster.tsx', () => ({ useToast: () => undefined }));

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return {
    ...actual,
    useIsPending: () => false,
    getWishlistItemImgSrc: () => '',
  };
});

vi.mock('#app/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <>{children}</>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogClose: ({ children }: any) => <>{children}</>,
}));

vi.mock('#app/components/ui/mobile-bottom-sheet', () => ({
  MobileBottomSheet: ({ children }: any) => <div>{children}</div>,
  MobileBottomSheetTrigger: ({ children }: any) => <>{children}</>,
  MobileBottomSheetContent: ({ children }: any) => <div>{children}</div>,
  MobileBottomSheetHeader: ({ children }: any) => <div>{children}</div>,
  MobileBottomSheetTitle: ({ children }: any) => <div>{children}</div>,
  MobileBottomSheetFooter: ({ children }: any) => <div>{children}</div>,
  MobileBottomSheetClose: ({ children }: any) => <>{children}</>,
  MobileBottomSheetDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#app/components/ui/button', () => ({
  Button: React.forwardRef<HTMLButtonElement, any>(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  )),
}));

vi.mock('#app/components/ui/status-button.tsx', () => ({
  StatusButton: React.forwardRef<HTMLButtonElement, any>(
    ({ children, ...props }, ref) => (
      <button ref={ref} {...props}>
        {children}
      </button>
    ),
  ),
}));

vi.mock('#app/components/ui/icon', () => ({
  Icon: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('#app/components/ui/input', () => ({
  Input: React.forwardRef<HTMLInputElement, any>(({ children, ...props }, ref) => (
    <input ref={ref} {...props}>
      {children}
    </input>
  )),
}));

vi.mock('#app/components/forms.tsx', () => ({
  Field: ({ labelProps, inputProps }: any) => (
    <div>
      <label {...labelProps} />
      <input {...inputProps} />
    </div>
  ),
  TextareaField: ({ labelProps, textareaProps }: any) => (
    <div>
      <label {...labelProps} />
      <textarea {...textareaProps} />
    </div>
  ),
}));

vi.mock('#app/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <>{children}</>,
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
}));

vi.mock('#app/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

describe('WishlistItemEditor mark as gifted', () => {
  beforeEach(() => {
    fetcherSubmit.mockReset();
    // default to desktop
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('submits an archive status when mark as gifted is clicked', () => {
    const ref = React.createRef<WishlistItemEditorHandle>();

    render(
      <WishlistItemEditor
        ref={ref}
        wishlistItem={{
          id: 'item-123',
          title: 'Snowboard',
          url: 'https://example.com/item',
          note: 'A cool board',
          type: 'text',
          categoryId: null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        }}
        canEdit
        categories={[]}
      />,
    );

    const button = screen.getByRole('button', { name: /mark as gifted/i });
    fireEvent.click(button);

    expect(fetcherSubmit).toHaveBeenCalled();
    const [formData] = fetcherSubmit.mock.calls[0];
    expect(formData.get('status')).toBe('ARCHIVED');
    expect(formData.get('title')).toBe('Snowboard');
    expect(formData.get('intent')).toBe('save');
  });
});
