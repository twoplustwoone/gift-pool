import { LuTriangleAlert, LuUsers } from 'react-icons/lu';
import { Link } from 'react-router';
import { cn } from '#app/utils/misc.tsx';
import { type ClaimDisclosure } from '#app/utils/wishlist-claim-disclosure.ts';

/**
 * One renderer for the claim privacy ladder, on all three surfaces. The
 * disclosure decision itself lives in resolveClaimDisclosure — this only
 * paints it, so a leak cannot hide on the surface nobody re-audited.
 */
export const ClaimDescriptor = ({
  disclosure,
  variant,
  className,
}: {
  disclosure: ClaimDisclosure;
  variant: 'badge' | 'row' | 'label';
  className?: string;
}) => {
  if (!disclosure.show) return null;

  const isWarning = disclosure.tone === 'warning';
  const Icon = isWarning ? LuTriangleAlert : LuUsers;

  const body = (
    <span
      role="status"
      aria-label={disclosure.text}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        isWarning
          ? 'border border-warning/30 bg-warning-muted text-warning'
          : 'border border-pool/30 bg-pool/15 text-pool',
        variant === 'row' && 'px-2 py-0',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {disclosure.text}
    </span>
  );

  if (variant === 'label' && disclosure.poolLink) {
    return (
      <Link to={disclosure.poolLink} className="inline-flex">
        {body}
      </Link>
    );
  }
  return body;
};
