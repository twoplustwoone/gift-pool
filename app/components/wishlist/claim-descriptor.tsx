import { LuTriangleAlert, LuUsers } from 'react-icons/lu';
import { Link } from 'react-router';
import { cn } from '#app/utils/misc.tsx';
import {
  type ClaimDisclosure,
  type ClaimDisclosureTone,
} from '#app/utils/wishlist-claim-disclosure.ts';

type ToneStyle = { icon: typeof LuUsers; className: string };

// Exhaustive over ClaimDisclosureTone: adding a tone without adding an entry
// here is a compile error, not a silent fallback to pool styling.
const TONE_STYLES: Record<ClaimDisclosureTone, ToneStyle | null> = {
  none: null,
  warning: {
    icon: LuTriangleAlert,
    className: 'border border-warning/30 bg-warning-muted text-warning',
  },
  pool: {
    icon: LuUsers,
    className: 'border border-pool/30 bg-pool/15 text-pool',
  },
};

/**
 * One renderer for the claim privacy ladder, on all three surfaces. The
 * disclosure decision itself lives in resolveClaimDisclosure — this only
 * paints it, so a leak cannot hide on the surface nobody re-audited.
 *
 * `disclosure.canJoinPool` is deliberately never read here: the join
 * affordance is a separate call-to-action owned by the calling surface, not
 * part of this badge.
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

  const style = TONE_STYLES[disclosure.tone];
  if (style === null) return null;

  const Icon = style.icon;

  const body = (
    <span
      role="status"
      aria-label={disclosure.text}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        style.className,
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
