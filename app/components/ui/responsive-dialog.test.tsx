/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let isDesktop = true;

vi.mock('#app/components/wishlist/hooks/use-is-desktop.ts', () => ({
  useIsDesktop: () => isDesktop,
}));

vi.mock('./dialog.tsx', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-root">{children}</div>
  ),
  DialogClose: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="desktop-close">
      {children}
    </button>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p data-testid="desktop-description">{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <footer data-testid="desktop-footer">{children}</footer>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header data-testid="desktop-header">{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => (
    <h2 data-testid="desktop-title">{children}</h2>
  ),
  DialogTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="desktop-trigger">
      {children}
    </button>
  ),
}));

vi.mock('./mobile-bottom-sheet.tsx', () => ({
  MobileBottomSheet: ({ children }: { children: ReactNode }) => (
    <div data-testid="mobile-root">{children}</div>
  ),
  MobileBottomSheetClose: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="mobile-close">
      {children}
    </button>
  ),
  MobileBottomSheetContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="mobile-content">{children}</div>
  ),
  MobileBottomSheetDescription: ({ children }: { children: ReactNode }) => (
    <p data-testid="mobile-description">{children}</p>
  ),
  MobileBottomSheetFooter: ({ children }: { children: ReactNode }) => (
    <footer data-testid="mobile-footer">{children}</footer>
  ),
  MobileBottomSheetHeader: ({ children }: { children: ReactNode }) => (
    <header data-testid="mobile-header">{children}</header>
  ),
  MobileBottomSheetTitle: ({ children }: { children: ReactNode }) => (
    <h2 data-testid="mobile-title">{children}</h2>
  ),
  MobileBottomSheetTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="mobile-trigger">
      {children}
    </button>
  ),
}));

import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from './responsive-dialog.tsx';

function renderDialog() {
  render(
    <ResponsiveDialog open onOpenChange={vi.fn()}>
      <ResponsiveDialogTrigger>Open</ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Gift details</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Pick the right surface.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose>Close</ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>,
  );
}

describe('ResponsiveDialog', () => {
  it('uses dialog primitives on desktop', () => {
    isDesktop = true;
    renderDialog();

    expect(screen.getByTestId('desktop-root')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-trigger')).toHaveTextContent('Open');
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-header')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-title')).toHaveTextContent(
      'Gift details',
    );
    expect(screen.getByTestId('desktop-description')).toHaveTextContent(
      'Pick the right surface.',
    );
    expect(screen.getByTestId('desktop-footer')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-close')).toHaveTextContent('Close');
  });

  it('uses bottom-sheet primitives on mobile', () => {
    isDesktop = false;
    renderDialog();

    expect(screen.getByTestId('mobile-root')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-trigger')).toHaveTextContent('Open');
    expect(screen.getByTestId('mobile-content')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-header')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-title')).toHaveTextContent(
      'Gift details',
    );
    expect(screen.getByTestId('mobile-description')).toHaveTextContent(
      'Pick the right surface.',
    );
    expect(screen.getByTestId('mobile-footer')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-close')).toHaveTextContent('Close');
  });
});
