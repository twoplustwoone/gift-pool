import { Skeleton } from '#app/components/ui/skeleton.tsx';

export function FriendsRouteSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading friends"
    >
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
