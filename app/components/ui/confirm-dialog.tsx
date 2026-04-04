import { isValidElement, type ReactNode, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

export function ConfirmDialog({
  title = 'Confirm',
  description,
  confirmText = 'Confirm',
  onConfirm,
  children,
  requireText,
}: {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  onConfirm: () => void;
  children: ReactNode;
  requireText?: string; // if provided, user must type this
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const canConfirm = requireText ? typed === requireText : true;
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTyped('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          isValidElement(description) ? (
            <DialogDescription asChild>{description}</DialogDescription>
          ) : (
            <DialogDescription>{description}</DialogDescription>
          )
        ) : null}
        {requireText ? (
          <input
            className="mt-2 w-full rounded border p-2"
            placeholder={`Type "${requireText}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
