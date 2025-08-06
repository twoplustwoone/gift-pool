import clsx from 'clsx';
import React, { forwardRef, type HTMLAttributes } from 'react';

export type ResponsiveCols = Partial<
  Record<'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', number>
>;

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of columns, either a single number or a responsive map */
  columns?: number | ResponsiveCols;
  /** Tailwind gap utility (number maps to gap-{n}) */
  gap?: number;
  /** Additional class names */
  className?: string;
  /** If true, switch to an auto-fit grid (as many columns as items) */
  autoFit?: boolean;
}

const Grid = forwardRef<HTMLDivElement, GridProps>(
  (
    { columns = 1, gap = 4, className, children, autoFit = false, ...rest },
    ref,
  ) => {
    let colsClass: string;
    if (autoFit) {
      colsClass = 'grid-cols-[repeat(auto-fit,minmax(0,1fr))]';
    } else if (typeof columns === 'number') {
      colsClass = `grid-cols-${columns}`;
    } else {
      colsClass = Object.entries(columns)
        .map(([bp, val]) =>
          bp === 'base' ? `grid-cols-${val}` : `${bp}:grid-cols-${val}`,
        )
        .join(' ');
    }

    return (
      <div
        ref={ref}
        className={clsx('grid', colsClass, `gap-${gap}`, className)}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Grid.displayName = 'Grid';
export { Grid };
