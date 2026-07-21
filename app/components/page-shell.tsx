import { type HTMLAttributes } from 'react';
import { cn } from '#app/utils/misc.tsx';

/**
 * Single source of truth for the app's horizontal content width.
 *
 * Resolves the "three width systems" drift audited during the page-shell
 * rework (Tailwind's `container` utility on Home/auth/marketing, a
 * hand-rolled `mx-auto max-w-6xl px-4 sm:px-6` copy-pasted across
 * Wishlist/Groups/Pools/Friends/Admin, and bespoke `max-w-3xl` wrappers on
 * Profile/Settings) down to two deliberate widths, matching
 * docs/product/giftpool-ui-rework-foundation-tokens.md §6: standard pages
 * (`max-w-6xl`, 1152px) and narrow/form pages (`max-w-3xl`, 768px).
 *
 * `PageHeader` delegates its own width to this component so a route's
 * header and body can't drift apart from each other again.
 */
export type PageShellWidth = 'standard' | 'narrow';

const WIDTH_CLASSES: Record<PageShellWidth, string> = {
  standard: 'max-w-6xl',
  narrow: 'max-w-3xl',
};

type PageShellProps = HTMLAttributes<HTMLDivElement> & {
  width?: PageShellWidth;
};

export const PageShell = ({
  width = 'standard',
  className,
  children,
  ...rest
}: PageShellProps) => (
  <div
    className={cn(
      'mx-auto w-full px-4 sm:px-6',
      WIDTH_CLASSES[width],
      className,
    )}
    {...rest}
  >
    {children}
  </div>
);
