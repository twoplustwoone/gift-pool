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
    const classes = clsx(
      p !== undefined && `p-${p}`,
      px !== undefined && `px-${px}`,
      py !== undefined && `py-${py}`,
      pt !== undefined && `pt-${pt}`,
      pr !== undefined && `pr-${pr}`,
      pb !== undefined && `pb-${pb}`,
      pl !== undefined && `pl-${pl}`,
      m !== undefined && `m-${m}`,
      mx !== undefined && `mx-${mx}`,
      my !== undefined && `my-${my}`,
      mt !== undefined && `mt-${mt}`,
      mr !== undefined && `mr-${mr}`,
      mb !== undefined && `mb-${mb}`,
      ml !== undefined && `ml-${ml}`,
      bg && (bg.startsWith('#') ? `bg-[${bg}]` : `bg-${bg}`),
      w !== undefined && (typeof w === 'number' ? `w-${w}` : `w-[${w}]`),
      h !== undefined && (typeof h === 'number' ? `h-${h}` : `h-[${h}]`),
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
