// Gift Pool components — window.GiftPool. Types condensed from app/components/ui (documentation only).
import type * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'wide' | 'xs' | 'sm' | 'lg' | 'pill' | 'icon';
  asChild?: boolean;
}
export declare const Button: React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<HTMLButtonElement>
>;

export interface StatusButtonProps extends ButtonProps {
  status: 'pending' | 'success' | 'error' | 'idle';
  message?: string | null;
  spinDelay?: { delay?: number; minDuration?: number; ssr?: boolean };
}
export declare const StatusButton: React.ForwardRefExoticComponent<
  StatusButtonProps & React.RefAttributes<HTMLButtonElement>
>;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  asChild?: boolean;
}
export declare const Card: React.ForwardRefExoticComponent<
  CardProps & React.RefAttributes<HTMLDivElement>
>;
export declare const CardContent: React.ForwardRefExoticComponent<
  React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
>;

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  titleId?: string;
  'data-testid'?: string;
}
export declare const Section: (props: SectionProps) => React.JSX.Element;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'pool';
}
export declare const Badge: React.ForwardRefExoticComponent<
  BadgeProps & React.RefAttributes<HTMLSpanElement>
>;

export type PoolStatus =
  'OPEN' | 'VOTING' | 'DECIDED' | 'PURCHASED' | 'DELIVERED' | 'CANCELLED';
export interface PoolStatusBadgeProps {
  status: PoolStatus;
  className?: string;
}
export declare const PoolStatusBadge: (
  props: PoolStatusBadgeProps,
) => React.JSX.Element;

export interface SystemLabelProps {
  children: React.ReactNode;
  className?: string;
}
export declare function SystemLabel(props: SystemLabelProps): React.JSX.Element;

export interface SecrecyNoteProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}
export declare function SecrecyNote(props: SecrecyNoteProps): React.JSX.Element;

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export declare function EmptyState(props: EmptyStateProps): React.JSX.Element;

export interface SkeletonProps {
  className?: string;
}
export declare function Skeleton(props: SkeletonProps): React.JSX.Element;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export declare const Input: React.ForwardRefExoticComponent<
  InputProps & React.RefAttributes<HTMLInputElement>
>;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export declare const Textarea: React.ForwardRefExoticComponent<
  TextareaProps & React.RefAttributes<HTMLTextAreaElement>
>;

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
export declare const Label: React.ForwardRefExoticComponent<
  LabelProps & React.RefAttributes<HTMLLabelElement>
>;

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}
export declare const Checkbox: React.ForwardRefExoticComponent<
  CheckboxProps & React.RefAttributes<HTMLButtonElement>
>;

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}
export declare function Switch(props: SwitchProps): React.JSX.Element;

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  defaultOpen?: boolean;
  disabled?: boolean;
  name?: string;
  children: React.ReactNode;
}
export declare const Select: (props: SelectProps) => React.JSX.Element;
export declare const SelectTrigger: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
>;
export declare const SelectValue: React.FC<{ placeholder?: React.ReactNode }>;
export declare const SelectContent: React.FC<{
  children: React.ReactNode;
  position?: 'popper' | 'item-aligned';
  className?: string;
}>;
export declare const SelectItem: React.FC<{
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
}>;
export declare const SelectGroup: React.FC<{ children: React.ReactNode }>;
export declare const SelectLabel: React.FC<{ children: React.ReactNode }>;
export declare const SelectSeparator: React.FC<{ className?: string }>;

export declare const TooltipProvider: React.FC<{
  delayDuration?: number;
  children: React.ReactNode;
}>;
export declare const Tooltip: React.FC<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (o: boolean) => void;
  children: React.ReactNode;
}>;
export declare const TooltipTrigger: React.FC<{
  asChild?: boolean;
  children: React.ReactNode;
}>;
export declare const TooltipContent: React.FC<{
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  children: React.ReactNode;
}>;

export declare const DropdownMenu: React.FC<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (o: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}>;
export declare const DropdownMenuTrigger: React.FC<{
  asChild?: boolean;
  children: React.ReactNode;
}>;
export declare const DropdownMenuContent: React.FC<{
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  children: React.ReactNode;
}>;
export declare const DropdownMenuItem: React.FC<{
  onSelect?: (e: Event) => void;
  disabled?: boolean;
  inset?: boolean;
  className?: string;
  children: React.ReactNode;
}>;
export declare const DropdownMenuCheckboxItem: React.FC<{
  checked?: boolean;
  onCheckedChange?: (c: boolean) => void;
  children: React.ReactNode;
}>;
export declare const DropdownMenuLabel: React.FC<{
  inset?: boolean;
  children: React.ReactNode;
}>;
export declare const DropdownMenuSeparator: React.FC<{ className?: string }>;
export declare const DropdownMenuGroup: React.FC<{ children: React.ReactNode }>;

export declare function ResponsiveDialog(props: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (o: boolean) => void;
  children: React.ReactNode;
}): React.JSX.Element;
export declare const ResponsiveDialogTrigger: React.ForwardRefExoticComponent<
  {
    asChild?: boolean;
    children: React.ReactNode;
  } & React.RefAttributes<HTMLButtonElement>
>;
export declare function ResponsiveDialogContent(props: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element;
export declare function ResponsiveDialogHeader(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element;
export declare function ResponsiveDialogFooter(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element;
export declare function ResponsiveDialogTitle(props: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element;
export declare function ResponsiveDialogDescription(props: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element;
export declare function ResponsiveDialogClose(props: {
  asChild?: boolean;
  children: React.ReactNode;
}): React.JSX.Element;
