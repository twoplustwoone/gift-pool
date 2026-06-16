import { useState } from 'react';
import { LuMessageSquarePlus } from 'react-icons/lu';
import { useLocation } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#app/components/ui/dialog.tsx';
import { FeedbackForm } from './feedback-form.tsx';

// Routes where a floating "give feedback" button would be redundant or get in
// the way: the support page already embeds the form, and auth/onboarding flows
// shouldn't have a button covering their primary action.
const SUPPRESSED_PREFIXES = [
  '/support',
  '/login',
  '/signup',
  '/onboarding',
  '/verify',
  '/reset-password',
  '/forgot-password',
];

export const FeedbackWidget = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const suppressed = SUPPRESSED_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );
  if (suppressed) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Lives in the top-bar cluster next to the bell/theme/avatar — a
          secondary-weight icon, not a floating FAB. A floating button at the
          bottom collided with the wishlist add-item FAB and overlapped the
          bottom nav on iOS (June 2026 audit). Styling mirrors NotificationBell
          so the cluster icons sit uniformly. */}
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Give feedback"
          className="bg-surface-muted relative inline-flex size-10 items-center justify-center rounded-full border border-transparent text-foreground shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LuMessageSquarePlus className="h-5 w-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send us feedback</DialogTitle>
          <DialogDescription>
            Found a bug, have an idea, or a question? We&apos;d love to hear it.
          </DialogDescription>
        </DialogHeader>
        {/* Remount the form per-open so each session starts clean. */}
        {open ? <FeedbackForm /> : null}
      </DialogContent>
    </Dialog>
  );
};
