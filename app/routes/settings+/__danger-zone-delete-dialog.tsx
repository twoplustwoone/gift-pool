import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';

type DangerZoneDeleteDialogProps = Readonly<{
  username: string;
  intent: string;
}>;

// Typed-confirmation dialog for the "delete all your data" action. Replaces
// the old double-click button — a single tap is too easy for an irreversible
// `prisma.user.delete`. The delete button only enables when the user types
// their exact username. Submits to the hub's action with the provided intent
// string.
export function DangerZoneDeleteDialog({
  username,
  intent,
}: DangerZoneDeleteDialogProps) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const isPending = fetcher.state !== 'idle';
  const refusal =
    fetcher.state === 'idle'
      ? ((fetcher.data as { error?: string } | undefined)?.error ?? null)
      : null;
  const matches = typed.trim() === username;

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <Icon name="trash">Delete all your data</Icon>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your profile, wishlist, friends, and
              every group you own. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {refusal ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
            >
              {refusal}
            </p>
          ) : null}

          <fetcher.Form method="POST" className="flex flex-col gap-3">
            <Label htmlFor="danger-zone-confirm" className="text-sm">
              Type{' '}
              <span className="font-mono font-semibold text-foreground">
                {username}
              </span>{' '}
              to confirm.
            </Label>
            <Input
              id="danger-zone-confirm"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={username}
            />

            <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <StatusButton
                type="submit"
                name="intent"
                value={intent}
                variant="destructive"
                disabled={!matches || isPending}
                status={isPending ? 'pending' : 'idle'}
              >
                <Icon name="trash">Delete my account</Icon>
              </StatusButton>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
