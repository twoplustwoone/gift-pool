import { Skeleton } from '#app/components/ui/skeleton.tsx';

export function WishlistRouteSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading wishlist"
    >
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
