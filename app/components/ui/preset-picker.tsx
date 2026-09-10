import { useId, useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { cn } from '#app/utils/misc.tsx';

export type PresetOption = {
  key: string;
  /** The exact words the recipient will read. Never a paraphrase. */
  label: string;
  /** What this choice costs or gives away, e.g. "Narrows it to 3 people". */
  subtitle?: string;
  /** Shown in the destructive colour. For a clue that gives the sender away. */
  caution?: boolean;
  disabled?: boolean;
};

export type PresetPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One sentence, at the point of choosing — not buried in settings. */
  description?: string;
  options: PresetOption[];
  /** Grouping label above a subset, e.g. "From what Gift Pool knows". */
  sections?: Array<{ label: string; keys: string[] }>;
  sendLabel: (selected: PresetOption) => string;
  onSend: (key: string) => void;
  pending?: boolean;
  /** Shown as remaining, never as consumed, and only in here. */
  allowance?: { remaining: number; total: number; exhaustedLabel: string };
  /** Small print under the send button. */
  footnote?: string;
  emptyLabel?: string;
};

// The board's highest-value component decision: notes, clues, guesses and
// thank-yous are all "a titled list of single-tap options, an optional
// subtitle each, an optional allowance meter, and one send button". Anything
// that needs a free-text box is not this component.
export function PresetPicker({
  open,
  onOpenChange,
  title,
  description,
  options,
  sections,
  sendLabel,
  onSend,
  pending = false,
  allowance,
  footnote,
  emptyLabel = 'Nothing to send just yet.',
}: PresetPickerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const groupId = useId();
  const exhausted = allowance ? allowance.remaining <= 0 : false;
  const selected = options.find((o) => o.key === selectedKey) ?? null;

  const renderOption = (option: PresetOption) => {
    const isSelected = option.key === selectedKey;
    const disabled = option.disabled || exhausted || pending;
    return (
      <li key={option.key}>
        <button
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={disabled}
          onClick={() => setSelectedKey(option.key)}
          className={cn(
            'flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition',
            'min-h-11 disabled:cursor-not-allowed disabled:opacity-60',
            isSelected
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted/40',
          )}
        >
          <span className="text-sm font-medium text-foreground">
            {option.label}
          </span>
          {option.subtitle ? (
            <span
              className={cn(
                'text-xs',
                option.caution ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {option.subtitle}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const ungrouped = sections
    ? options.filter((o) => !sections.some((s) => s.keys.includes(o.key)))
    : options;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
          {description ? (
            <ResponsiveDialogDescription>
              {description}
            </ResponsiveDialogDescription>
          ) : null}
        </ResponsiveDialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div
            role="radiogroup"
            aria-label={title}
            id={groupId}
            className="space-y-4"
          >
            {sections?.map((section) => {
              const inSection = options.filter((o) =>
                section.keys.includes(o.key),
              );
              if (inSection.length === 0) return null;
              return (
                <div key={section.label} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </p>
                  <ul className="space-y-2">{inSection.map(renderOption)}</ul>
                </div>
              );
            })}
            {ungrouped.length > 0 ? (
              <ul className="space-y-2">{ungrouped.map(renderOption)}</ul>
            ) : null}
          </div>
        )}

        {allowance ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="preset-allowance"
          >
            {exhausted
              ? allowance.exhaustedLabel
              : `${allowance.remaining} of ${allowance.total} notes left today`}
          </p>
        ) : null}

        <ResponsiveDialogFooter className="gap-2">
          <ResponsiveDialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </ResponsiveDialogClose>
          <Button
            type="button"
            disabled={!selected || exhausted || pending}
            onClick={() => selected && onSend(selected.key)}
          >
            {pending
              ? 'Sending…'
              : selected
                ? sendLabel(selected)
                : 'Pick one first'}
          </Button>
        </ResponsiveDialogFooter>

        {footnote ? (
          <p className="text-center text-xs text-muted-foreground">
            {footnote}
          </p>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
