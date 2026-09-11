import { useId, useRef, useState } from 'react';
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
  /**
   * What a screen reader hears when an option is picked. The board asks the
   * guess picker for "Your guess is now X", which only the caller can word.
   */
  announceSelection?: (option: PresetOption) => string;
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
  announceSelection,
}: PresetPickerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const statusId = useId();
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const exhausted = allowance ? allowance.remaining <= 0 : false;
  const selected = options.find((o) => o.key === selectedKey) ?? null;

  const isDisabled = (option: PresetOption) =>
    Boolean(option.disabled) || exhausted || pending;

  // Sections render first and the ungrouped list trails them, so arrow keys
  // have to walk THAT order rather than the order of `options` — otherwise
  // focus jumps around a sectioned clue picker.
  const ungrouped = sections
    ? options.filter((o) => !sections.some((s) => s.keys.includes(o.key)))
    : options;
  const visualOrder = sections
    ? [
        ...sections.flatMap((section) =>
          options.filter((o) => section.keys.includes(o.key)),
        ),
        ...ungrouped,
      ]
    : options;
  const focusable = visualOrder.filter((o) => !isDisabled(o));

  // Exactly one option is ever in the tab order. `disabled` on a real button
  // makes it unfocusable, so the roving index must land on an enabled one —
  // and when everything is disabled, on nothing at all.
  const rovingKey = focusable.some((o) => o.key === selectedKey)
    ? selectedKey
    : (focusable[0]?.key ?? null);

  const choose = (option: PresetOption) => {
    setSelectedKey(option.key);
    setAnnouncement(announceSelection?.(option) ?? `${option.label} selected`);
  };

  const moveFocus = (from: PresetOption, delta: number | 'first' | 'last') => {
    if (focusable.length === 0) return;
    const current = focusable.findIndex((o) => o.key === from.key);
    const next =
      delta === 'first'
        ? focusable[0]!
        : delta === 'last'
          ? focusable[focusable.length - 1]!
          : focusable[(current + delta + focusable.length) % focusable.length]!;
    // Moving focus selects, as a radio group does.
    choose(next);
    optionRefs.current.get(next.key)?.focus();
  };

  const onOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    option: PresetOption,
  ) => {
    const handled: Record<string, () => void> = {
      ArrowDown: () => moveFocus(option, 1),
      ArrowRight: () => moveFocus(option, 1),
      ArrowUp: () => moveFocus(option, -1),
      ArrowLeft: () => moveFocus(option, -1),
      Home: () => moveFocus(option, 'first'),
      End: () => moveFocus(option, 'last'),
    };
    const run = handled[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  const renderOption = (option: PresetOption) => {
    const isSelected = option.key === selectedKey;
    const disabled = isDisabled(option);
    return (
      <li key={option.key}>
        <button
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={disabled}
          tabIndex={option.key === rovingKey ? 0 : -1}
          ref={(node) => {
            if (node) optionRefs.current.set(option.key, node);
            else optionRefs.current.delete(option.key);
          }}
          onKeyDown={(event) => onOptionKeyDown(event, option)}
          onClick={() => choose(option)}
          className={cn(
            'flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition',
            'min-h-11 outline-none ring-ring focus-visible:ring-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
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
          <div role="radiogroup" aria-label={title} className="space-y-4">
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

        <p id={statusId} role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

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
