import clsx from 'clsx';
import React, {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
} from 'react';

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  /** Element type to render (div, section, etc.) */
  as?: ElementType;
  /** Padding shorthand: maps to p-{n} */
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pr?: number;
  pb?: number;
  pl?: number;
  /** Margin shorthand: maps to m-{n} */
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
  /** Background color utility (Tailwind color or arbitrary) */
  bg?: string;
  /** Width utility: maps to w-{n} or w-[value] */
  w?: string | number;
  /** Height utility: maps to h-{n} or h-[value] */
  h?: string | number;
  /** Border radius: maps to rounded-{size} */
  rounded?: string | number;
  /** Additional class names */
  className?: string;
}

function buildSpaceClasses(prefix: string, values: Array<[string, number | undefined]>) {
  return values.map(([key, value]) =>
    value !== undefined ? `${prefix}${key}-${value}` : null,
  );
}

function buildSizeClass(prefix: string, value: string | number | undefined) {
  if (value === undefined) return null;
  return typeof value === 'number' ? `${prefix}-${value}` : `${prefix}-[${value}]`;
}

function buildBackgroundClass(bg: string | undefined) {
  if (!bg) return null;
  return bg.startsWith('#') ? `bg-[${bg}]` : `bg-${bg}`;
}

/**
 * A generic Box primitive for layout and styling. Supports spacing,
 * background, size, border-radius, and custom element type.
 */
const Box = forwardRef<HTMLElement, BoxProps>(
  (
    {
      as: Component = 'div',
      p,
      px,
      py,
      pt,
      pr,
      pb,
      pl,
      m,
      mx,
      my,
      mt,
      mr,
      mb,
      ml,
      bg,
      w,
      h,
      rounded,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const paddingClasses = buildSpaceClasses('', [
      ['p', p],
      ['px', px],
      ['py', py],
      ['pt', pt],
      ['pr', pr],
      ['pb', pb],
      ['pl', pl],
    ]);
    const marginClasses = buildSpaceClasses('', [
      ['m', m],
      ['mx', mx],
      ['my', my],
      ['mt', mt],
      ['mr', mr],
      ['mb', mb],
      ['ml', ml],
    ]);
    const classes = clsx(
      paddingClasses,
      marginClasses,
      buildBackgroundClass(bg),
      buildSizeClass('w', w),
      buildSizeClass('h', h),
      rounded !== undefined && `rounded-${rounded}`,
      className,
    );

    return (
      <Component ref={ref as any} className={classes} {...rest}>
        {children}
      </Component>
    );
  },
);

Box.displayName = 'Box';
export { Box };
