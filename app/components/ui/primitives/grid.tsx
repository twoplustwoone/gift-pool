import clsx from 'clsx';
import React, { forwardRef, type HTMLAttributes } from 'react';

export type ResponsiveCols = Partial<
  Record<'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', number>
>;

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Number of columns, either a single number or a responsive map
   * e.g. 5 or { base: 1, md: 3, xl: 5 }
   */
  columns?: number | ResponsiveCols;
  /**
   * Tailwind gap utility (number maps to gap-{n})
   */
  gap?: number;
  /**
   * Additional class names to merge
   */
  className?: string;
  /**
   * If true, switch to an auto-fit grid (as many columns as items)
   */
  autoFit?: boolean;
}

/**
 * A thin wrapper around CSS Grid that exposes a `columns` prop,
 * enforces each direct child to span exactly one column,
 * and handles responsive breakpoints + gap sizing.
 */
const Grid = forwardRef<HTMLDivElement, GridProps>(
  (
    { columns = 1, gap = 4, className, children, autoFit = false, ...rest },
    ref,
  ) => {
    // build the grid-cols classes
    let colsClass: string;
    if (autoFit) {
      // as many 1fr columns as items
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
        className={clsx(
          'grid', // turn on CSS Grid
          colsClass,
          `gap-${gap}`, // gap utility
          '[&>*]:col-span-1', // force each direct child to span exactly one column
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Grid.displayName = 'Grid';
export default Grid;

/*
Usage examples:

// 5-columns always, children always occupy one slot
<Grid columns={5} gap={6}>
  {items.map(item => <Card key={item.id} {...item} />)}
</Grid>

// responsive: 1 col mobile, 2 sm, 3 md, 4 lg, 5 xl
<Grid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} gap={4}>
  {items.map(item => <Tile key={item.id} {...item} />)}
</Grid>

// auto-fit: as many columns as items
<Grid autoFit gap={4}>
  {items.map(item => <Tile key={item.id} {...item} />)}
</Grid>
*/
