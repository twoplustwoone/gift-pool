import { PageShell } from '#app/components/page-shell.tsx';
import { Skeleton } from '#app/components/ui/skeleton.tsx';

// Width matches the real Wishlist page (PageShell "standard", max-w-6xl) so
// the skeleton doesn't visibly jump wider once real content lands.
export function WishlistRouteSkeleton() {
  return (
    <PageShell
      className="flex flex-col gap-4 py-4"
      role="status"
      aria-live="polite"
      aria-label="Loading wishlist"
    >
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </PageShell>
  );
}
