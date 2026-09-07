import { LuEyeOff } from 'react-icons/lu';
import { cn } from '#app/utils/misc.tsx';

// States a secrecy boundary IN the product: what this viewer cannot see, and
// why. Dashed teal so it reads as a deliberate line rather than an error. Use
// it wherever a page hides something on purpose — the organizer's totals-only
// panel, a non-participant's roster, the pool recipient boundary.
export function SecrecyNote({
  title,
  children,
  className,
}: Readonly<{
  title?: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <aside
      aria-label={title ?? 'What stays private'}
      className={cn(
        'flex gap-3 rounded-lg border border-dashed border-pool/50 bg-pool/5 px-3 py-2.5 text-sm text-foreground',
        className,
      )}
    >
      <LuEyeOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-pool" />
      <div className="min-w-0">
        {title ? <div className="font-semibold text-pool">{title}</div> : null}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </aside>
  );
}
