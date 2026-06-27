import { type ElementType, type ReactNode } from 'react';

import { Card } from '#app/components/ui/card.tsx';
import { cn } from '#app/utils/misc.tsx';

export interface SectionProps {
  /**
   * The section's title. Per design rule R1.3 a *section* title belongs to its
   * container — render it here, not loose on the page backdrop. (Only the
   * page-level H1 may sit on the backdrop.)
   */
  title?: ReactNode;
  description?: ReactNode;
  /** Optional trailing control aligned to the title row (e.g. an Edit button). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Heading element for the title. Defaults to `h2`. */
  as?: ElementType;
  /** Id for the heading, for `aria-labelledby` wiring. */
  titleId?: string;
}

/**
 * A card-bounded section: the single containment primitive for content blocks
 * (R1.2). Content lives in a `Section`/`Card`; the page background is the space
 * *between* sections, never the surface content sits on.
 */
export const Section = ({
  title,
  description,
  action,
  children,
  className,
  as: Heading = 'h2',
  titleId,
}: SectionProps) => (
  <Card className={cn('border-border/60 bg-card p-4 shadow-sm', className)}>
    {title || description || action ? (
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title ? (
            <Heading
              id={titleId}
              className="text-lg font-semibold leading-tight"
            >
              {title}
            </Heading>
          ) : null}
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    ) : null}
    {children}
  </Card>
);
