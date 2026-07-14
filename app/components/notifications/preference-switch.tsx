import { cn } from '#app/utils/misc.tsx';

export function PreferenceSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none ring-ring focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-10 rounded-full border transition-colors',
          checked
            ? 'border-primary bg-primary'
            : 'border-input bg-muted-foreground/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
