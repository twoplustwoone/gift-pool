import { isValidElement, useId, type ReactNode, useState } from 'react';
import { Button } from './button';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogClose as DialogClose,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from './responsive-dialog';

function renderDialogDescription(description?: ReactNode) {
  if (!description) {
    return null;
  }

  if (isValidElement(description)) {
    return <DialogDescription asChild>{description}</DialogDescription>;
  }

  return <DialogDescription>{description}</DialogDescription>;
}

// The irreversible-action confirmation. One component, several
// configurations: cancel-pool, draw names, reveal pairings. The body reads in
// a fixed order — description, ordered consequences, computed outcome preview,
// caution — because the order is what makes the consequences legible: who is
// affected, what cannot be undone, what the result will be.
export function ConfirmDialog({
  title = 'Confirm',
  description,
  consequences,
  outcomePreview,
  caution,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  children,
  requireText,
  pending = false,
  pendingLabel,
  pendingHint,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  confirmVariant = 'default',
}: {
  title?: string;
  description?: ReactNode;
  // Ordered bullet list under the description ("Nobody can join afterwards").
  consequences?: ReactNode[];
  // A server-computed sentence about the result ("Everyone gets someone new").
  outcomePreview?: ReactNode;
  // A stated caution that does not block ("One person hasn't said they got it").
  caution?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  children?: ReactNode;
  requireText?: string; // if provided, user must type this
  // While true both buttons disable, the confirm label swaps to `pendingLabel`,
  // a polite live region announces it, and the dialog does NOT auto-close —
  // the caller closes it (or lets it stay open with an error) once the action
  // settles. Draws and reveals are never optimistic.
  pending?: boolean;
  pendingLabel?: string;
  pendingHint?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  confirmVariant?: 'default' | 'destructive';
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    controlledOnOpenChange?.(next);
  };
  const [typed, setTyped] = useState('');
  const canConfirm = (requireText ? typed === requireText : true) && !pending;
  const handleOpenChange = (nextOpen: boolean) => {
    // Escape/scrim cannot dismiss a pending irreversible action.
    if (!nextOpen && pending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setTyped('');
    }
  };
  const statusId = useId();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent aria-describedby={pending ? statusId : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {renderDialogDescription(description)}
        {consequences && consequences.length > 0 ? (
          <ul className="space-y-2 text-sm text-foreground">
            {consequences.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden className="select-none text-muted-foreground">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {outcomePreview ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground">
            {outcomePreview}
          </p>
        ) : null}
        {caution ? (
          <p className="text-sm text-warning" role="note">
            {caution}
          </p>
        ) : null}
        {requireText ? (
          <input
            className="mt-2 w-full rounded border p-2"
            placeholder={`Type "${requireText}" to confirm`}
            value={typed}
            disabled={pending}
            onChange={(e) => setTyped(e.target.value)}
          />
        ) : null}
        <p id={statusId} role="status" aria-live="polite" className="sr-only">
          {pending ? (pendingLabel ?? 'Working…') : ''}
        </p>
        {pending && pendingHint ? (
          <p className="text-center text-sm text-muted-foreground">
            {pendingHint}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={pending}>
              {cancelText}
            </Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            disabled={!canConfirm}
            onClick={() => {
              onConfirm();
              // Fire-and-forget callers close immediately; pending callers keep
              // the dialog open until the action settles.
              if (!pending) setOpen(false);
            }}
          >
            {pending ? (pendingLabel ?? confirmText) : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
