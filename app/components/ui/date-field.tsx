import * as React from 'react';
import { LuCalendar, LuChevronLeft, LuChevronRight, LuX } from 'react-icons/lu';
import { Label } from '#app/components/ui/label.tsx';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#app/components/ui/popover.tsx';
import {
  formatDateInput,
  parseFlexibleDateInput,
  toDateInput,
} from '#app/utils/date-input.ts';
import { cn } from '#app/utils/misc.tsx';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthOf(value: string): string {
  return value.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function todayDateInput(): string {
  return toDateInput(new Date());
}

export type DateFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  rangeNote?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
};

// Replaces the native <input type="date"> everywhere in the app. On real
// iOS Safari, the native control's own rendered box does not reliably
// respect CSS width, which pushed an entire page into horizontal scroll —
// a failure mode no available browser or emulator can reproduce to verify.
// This field is plain author-controlled markup (text input + button), so it
// has no OS-dependent intrinsic sizing and cannot reintroduce that bug.
//
// Purely visual/value control — it does not submit itself. A plain form
// renders its own `<input type="hidden" name="..." value={value} />`
// alongside it (same convention as SwitchRow's hidden inputs); a
// Conform-bound form drives it through `useInputControl`, which manages its
// own hidden input, so this component must not render a second one under
// the same name.
export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  rangeNote,
  hint,
  error,
  disabled,
  required,
}: DateFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const [text, setText] = React.useState(() => formatDateInput(value, true));
  const [open, setOpen] = React.useState(false);
  const [typingHint, setTypingHint] = React.useState('');
  const [commitError, setCommitError] = React.useState('');
  const [month, setMonth] = React.useState(() =>
    monthOf(value || min || todayDateInput()),
  );
  const [yearPicking, setYearPicking] = React.useState(false);

  const lastValue = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(formatDateInput(value, true));
      setCommitError('');
      setTypingHint('');
      setMonth(monthOf(value || min || todayDateInput()));
    }
  }, [value, min]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      lastValue.current = '';
      onChange('');
      setCommitError('');
      setTypingHint('');
      return;
    }
    const referenceYear = Number(month.slice(0, 4));
    const iso = parseFlexibleDateInput(trimmed, referenceYear);
    if (!iso) {
      setCommitError('Use a format like 24 Dec 2026');
      setTypingHint('');
      return;
    }
    if ((min && iso < min) || (max && iso > max)) {
      setText(formatDateInput(iso, true));
      setCommitError(
        min && iso < min
          ? `Pick a date on or after ${formatDateInput(min, true)}`
          : `Pick a date on or before ${formatDateInput(max!, true)}`,
      );
      setTypingHint('');
      setMonth(monthOf(iso));
      return;
    }
    lastValue.current = iso;
    onChange(iso);
    setText(formatDateInput(iso, true));
    setCommitError('');
    setTypingHint('');
    setMonth(monthOf(iso));
  };

  const pick = (iso: string) => {
    lastValue.current = iso;
    onChange(iso);
    setText(formatDateInput(iso, true));
    setCommitError('');
    setTypingHint('');
    setMonth(monthOf(iso));
    setOpen(false);
    rootRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const clear = () => {
    lastValue.current = '';
    onChange('');
    setText('');
    setCommitError('');
    setTypingHint('');
    rootRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const moveFocus = (delta: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const cells = Array.from(grid.querySelectorAll('button'));
    const current = cells.indexOf(document.activeElement as HTMLButtonElement);
    let next =
      current < 0 ? cells.findIndex((c) => !c.disabled) : current + delta;
    const step = delta > 0 ? 1 : -1;
    while (next >= 0 && next < cells.length && cells[next]!.disabled)
      next += step;
    if (next >= 0 && next < cells.length) cells[next]!.focus();
  };

  const errorText = error || commitError;
  const hintText = errorText ? '' : hint || typingHint;

  const [y, m] = month.split('-').map(Number);
  const leading = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const outOfRange = (iso: string) =>
    (min && iso < min) || (max && iso > max) || false;
  const today = todayDateInput();

  // The back/forward arrows disable once the ENTIRE adjacent month falls
  // outside the range, not just its first/last day.
  const backDisabled = !!(min && shiftMonth(month, -1) < monthOf(min));
  const nextDisabled = !!(max && shiftMonth(month, 1) > monthOf(max));
  const todayDisabled = outOfRange(today);

  return (
    <div
      ref={rootRef}
      className={cn(
        'min-w-0 space-y-1.5',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Label htmlFor={fieldId}>{label}</Label>
      <div
        className={cn(
          'flex h-10 w-full min-w-0 items-center gap-1 rounded-md border border-input bg-input-bg pl-3 pr-1',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-transparent',
          errorText && 'border-input-invalid',
        )}
      >
        <input
          id={fieldId}
          type="text"
          inputMode="text"
          autoComplete="off"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
          value={text}
          placeholder="mm/dd/yyyy"
          disabled={disabled}
          required={required}
          aria-invalid={errorText ? true : undefined}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            setCommitError('');
            const referenceYear = Number(month.slice(0, 4));
            const iso = parseFlexibleDateInput(t, referenceYear);
            setTypingHint(
              !iso && t.trim()
                ? 'Keep going — 24 Dec 2026, 12/24/2026 and 2026-12-24 all work'
                : '',
            );
            if (iso) setMonth(monthOf(iso));
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            } else if (e.key === 'Escape' && open) {
              setOpen(false);
            }
          }}
        />
        {value && !disabled ? (
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={clear}
            aria-label={`Clear ${label}`}
          >
            <LuX aria-hidden className="size-3.5" />
          </button>
        ) : null}
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setMonth(monthOf(value || min || today));
            if (!next) setYearPicking(false);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                open && 'bg-accent text-gift',
              )}
              disabled={disabled}
              aria-label="Open calendar"
              aria-expanded={open}
            >
              <LuCalendar aria-hidden className="size-[17px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-3"
            align="start"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                rootRef.current
                  ?.querySelector<HTMLInputElement>('input')
                  ?.focus();
                return;
              }
              const deltas: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: 7,
                ArrowUp: -7,
              };
              if (e.key in deltas) {
                e.preventDefault();
                moveFocus(deltas[e.key]!);
              } else if (e.key === 'PageDown') {
                e.preventDefault();
                setMonth((mo) => shiftMonth(mo, 1));
              } else if (e.key === 'PageUp') {
                e.preventDefault();
                setMonth((mo) => shiftMonth(mo, -1));
              }
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                type="button"
                className="flex size-[30px] items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
                disabled={backDisabled}
                aria-label="Previous month"
              >
                <LuChevronLeft aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                className="rounded px-1 text-sm font-bold hover:bg-accent"
                onClick={() => setYearPicking((v) => !v)}
              >
                {MONTH_NAMES[m! - 1]} {y}
              </button>
              <button
                type="button"
                className="flex size-[30px] items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
                disabled={nextDisabled}
                aria-label="Next month"
              >
                <LuChevronRight aria-hidden className="size-4" />
              </button>
            </div>
            {yearPicking ? (
              <div className="grid max-h-52 grid-cols-4 gap-1 overflow-y-auto">
                {Array.from(
                  { length: 121 },
                  (_, i) => Number(today.slice(0, 4)) - 100 + i,
                ).map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    className={cn(
                      'rounded-md px-2 py-1 text-sm hover:bg-accent',
                      yr === y && 'bg-gift font-bold text-gift-foreground',
                    )}
                    onClick={() => {
                      setMonth(`${yr}-${String(m).padStart(2, '0')}`);
                      setYearPicking(false);
                    }}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                  {WEEKDAY_LABELS.map((w, i) => (
                    <span
                      key={i}
                      className="text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {w}
                    </span>
                  ))}
                </div>
                <div ref={gridRef} className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: leading }, (_, i) => (
                    <span key={`b${i}`} className="invisible size-9" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = i + 1;
                    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dis = outOfRange(iso);
                    const selected = iso === value;
                    const isToday = iso === today;
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={dis}
                        tabIndex={
                          !dis && (selected || (!value && isToday)) ? 0 : -1
                        }
                        aria-label={formatDateInput(iso, true)}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => pick(iso)}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-full border border-transparent text-[13px] font-medium hover:bg-accent',
                          isToday && 'border-gift font-bold text-gift',
                          selected &&
                            'border-gift bg-gift font-bold text-gift-foreground shadow-sm hover:bg-gift',
                          dis &&
                            'cursor-not-allowed border-transparent bg-transparent text-muted-foreground opacity-30 hover:bg-transparent',
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                {rangeNote ? (
                  <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    {rangeNote}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="h-[30px] rounded-full border border-border px-3.5 text-[13px] font-bold text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => pick(today)}
                    disabled={todayDisabled}
                  >
                    Today
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Today · {formatDateInput(today, true)}
                  </span>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {hintText ? (
        <p className="text-xs text-muted-foreground">{hintText}</p>
      ) : null}
      {errorText ? (
        <p className="text-xs text-foreground-destructive" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
