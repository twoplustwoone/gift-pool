import { createContext, useContext } from 'react';
import { useIsDesktop } from '#app/components/wishlist/hooks/use-is-desktop.ts';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx';
import {
  MobileBottomSheet,
  MobileBottomSheetClose,
  MobileBottomSheetContent,
  MobileBottomSheetDescription,
  MobileBottomSheetFooter,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetTrigger,
} from './mobile-bottom-sheet.tsx';

/**
 * The one modal primitive to use for dialogs.
 *
 * HARD RULE (see CLAUDE.md → "Modals are sheets on mobile"): every modal in the
 * app renders as a bottom sheet on mobile (< 640px) and a centered dialog on
 * desktop. Do NOT reach for the raw `Dialog` primitive for a modal — use this.
 * The sub-components mirror the `Dialog` API exactly, so they are drop-in
 * (`ResponsiveDialog` ⇒ `Dialog`, `ResponsiveDialogContent` ⇒ `DialogContent`,
 * etc.), and swap to the `MobileBottomSheet` family below the breakpoint.
 */

const IsDesktopContext = createContext(true);

export function ResponsiveDialog(props: React.ComponentProps<typeof Dialog>) {
  const isDesktop = useIsDesktop();
  const Root = isDesktop ? Dialog : MobileBottomSheet;
  return (
    <IsDesktopContext.Provider value={isDesktop}>
      <Root {...props} />
    </IsDesktopContext.Provider>
  );
}

export function ResponsiveDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogTrigger
    : MobileBottomSheetTrigger;
  return <Cmp {...props} />;
}

export function ResponsiveDialogContent(
  props: React.ComponentProps<typeof DialogContent>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogContent
    : MobileBottomSheetContent;
  return <Cmp {...props} />;
}

export function ResponsiveDialogHeader(
  props: React.ComponentProps<typeof DialogHeader>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogHeader
    : MobileBottomSheetHeader;
  return <Cmp {...props} />;
}

export function ResponsiveDialogFooter(
  props: React.ComponentProps<typeof DialogFooter>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogFooter
    : MobileBottomSheetFooter;
  return <Cmp {...props} />;
}

export function ResponsiveDialogTitle(
  props: React.ComponentProps<typeof DialogTitle>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogTitle
    : MobileBottomSheetTitle;
  return <Cmp {...props} />;
}

export function ResponsiveDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogDescription
    : MobileBottomSheetDescription;
  return <Cmp {...props} />;
}

export function ResponsiveDialogClose(
  props: React.ComponentProps<typeof DialogClose>,
) {
  const Cmp = useContext(IsDesktopContext)
    ? DialogClose
    : MobileBottomSheetClose;
  return <Cmp {...props} />;
}
