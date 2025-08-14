import { cn } from '#app/utils/misc';

type StackProps = {
  children: React.ReactNode;
  className?: string | undefined;
  gap?: number;
};

export const Stack = ({ children, gap = 2, className }: StackProps) => {
  return (
    <div className={cn(`flex flex-col gap-${gap}`, className)}>{children}</div>
  );
};
