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
      {/* Trigger sits bottom-LEFT on mobile: the bottom-right thumb corner
          belongs to page-level primary actions (the wishlist add-item FAB
          rendered at the same spot and this widget covered it — June 2026
          audit P0). */}
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Give feedback"
          className="fixed bottom-20 left-4 z-50 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:left-auto sm:right-6"
        >
          <LuMessageSquarePlus className="h-5 w-5" aria-hidden />
          <span className="hidden text-sm font-medium sm:inline">Feedback</span>
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
