import { isValidElement, type ReactNode, useState } from 'react';
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
        {renderDialogDescription(description)}
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
