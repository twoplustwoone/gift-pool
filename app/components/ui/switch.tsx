import { cn } from '#app/utils/misc.tsx';

// The one toggle. A `role="switch"` button with a 44px hit area so it is
// comfortable on a phone, labelled either by `label` (visually hidden — the
// caller renders the visible text) or by an external element via
// `aria-labelledby`. Grew out of the notification-settings toggle.
export function Switch({
  checked,
  disabled,
  label,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  onCheckedChange,
  className,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  label?: string;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}>) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabelledBy ? undefined : label}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none ring-ring focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
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
            'absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}

// A labelled row: visible title, optional description, switch on the right.
// This is the shape every settings surface draws; keeping it here means the
// label/description/control association is done once, correctly.
export function SwitchRow({
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  className,
}: Readonly<{
  id: string;
  title: string;
  description?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}>) {
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div
      className={cn('flex items-start justify-between gap-3 py-2', className)}
    >
      <div className="min-w-0 flex-1">
        <div id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </div>
        {description ? (
          <div
            id={descriptionId}
            className="mt-0.5 text-sm text-muted-foreground"
          >
            {description}
          </div>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
        className="-my-2.5 -mr-2.5"
      />
    </div>
  );
}
