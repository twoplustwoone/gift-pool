import { PageShell } from '#app/components/page-shell.tsx';
import { Skeleton } from '#app/components/ui/skeleton.tsx';

// Width matches the real Friends page (PageShell "standard", max-w-6xl) so
// the skeleton doesn't visibly jump wider once real content lands.
export function FriendsRouteSkeleton() {
  return (
    <PageShell
      className="flex flex-col gap-3 py-4"
      role="status"
      aria-live="polite"
      aria-label="Loading friends"
    >
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </PageShell>
  );
}
