import clsx from 'clsx';
import React, { forwardRef, type HTMLAttributes } from 'react';

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';
export type JustifyContent =
  | 'start'
  | 'center'
  | 'end'
  | 'between'
  | 'around'
  | 'evenly';
export type AlignItems = 'start' | 'center' | 'end' | 'baseline' | 'stretch';

export interface FlexProps extends HTMLAttributes<HTMLDivElement> {
  /** Flex direction */
  direction?: FlexDirection;
  /** Allow wrapping */
  wrap?: FlexWrap;
  /** Horizontal alignment */
  justify?: JustifyContent;
  /** Vertical alignment */
  align?: AlignItems;
  /** Gap between items (maps to gap-{n}) */
  gap?: number;
  /** If true, use inline-flex instead of block flex */
  inline?: boolean;
  /** Additional classes */
  className?: string;
}

/**
 * A wrapper for CSS flexbox with quick props for direction, wrap,
 * justify, align, and consistent spacing between children.
 */
const Flex = forwardRef<HTMLDivElement, FlexProps>(
  (
    {
      direction = 'row',
      wrap = 'nowrap',
      justify = 'start',
      align = 'center',
      gap = 0,
      inline = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const base = inline ? 'inline-flex' : 'flex';
    const dirClass = `flex-${direction}`;
    const wrapClass = `flex-${wrap}`;
    const justifyClass = `justify-${justify}`;
    const alignClass = `items-${align}`;
    const gapClass = gap ? `gap-${gap}` : '';

    return (
      <div
        ref={ref}
        className={clsx(
          base,
          dirClass,
          wrapClass,
          justifyClass,
          alignClass,
          gapClass,
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Flex.displayName = 'Flex';
export { Flex };
