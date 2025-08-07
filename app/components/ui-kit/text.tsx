import clsx from 'clsx';
import React, { forwardRef, type ReactNode, type ElementType } from 'react';

export type TextSize =
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl';
export type TextWeight =
  | 'thin'
  | 'extralight'
  | 'light'
  | 'normal'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'extrabold'
  | 'black';
export type TextColor =
  | 'inherit'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'accent'
  | string;
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextProps {
  /** Content to render */
  children: ReactNode;
  /** HTML element or component to render as */
  as?: ElementType;
  /** Font size */
  size?: TextSize;
  /** Font weight */
  weight?: TextWeight;
  /** Text color (Tailwind class without the 'text-' prefix, or custom string) */
  color?: TextColor;
  /** Text alignment */
  align?: TextAlign;
  /** Additional class names */
  className?: string;
}

/**
 * A simple Text primitive for consistent typography.
 * Supports custom element, size, weight, color, and alignment.
 */
const Text = forwardRef<HTMLElement, TextProps>(
  (
    {
      as: Component = 'span',
      size = 'base',
      weight = 'normal',
      color = 'inherit',
      align,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    // derive color class; if custom (contains non-alphanumeric), inject directly
    const colorClass =
      color === 'inherit'
        ? 'text-inherit'
        : ['primary', 'secondary', 'muted', 'accent'].includes(color)
          ? `text-${color}`
          : `text-[${color}]`;

    return (
      <Component
        ref={ref as any}
        className={clsx(
          `text-${size}`,
          `font-${weight}`,
          colorClass,
          align && `text-${align}`,
          className,
        )}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);

Text.displayName = 'Text';
export { Text };
