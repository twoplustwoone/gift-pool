import { useState } from 'react';
import { LuX } from 'react-icons/lu';
import { Button } from '#app/components/ui/button.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '#app/components/ui/responsive-dialog.tsx';
import { SwitchRow } from '#app/components/ui/switch.tsx';
import {
  DEFAULT_LOOKBACK,
  REVEAL_MODE,
  SPENDING_GUIDELINE_MAX_LENGTH,
  type RevealMode,
} from '#app/utils/exchange-constants.ts';
import { type ExchangePerson } from '#app/utils/exchanges.server.ts';
import { cn } from '#app/utils/misc.tsx';
import {
  OCCASION_TYPE,
  OCCASION_TYPE_LABELS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import { displayName, formatExchangeDate } from './exchange-copy.ts';

export type ExclusionPair = {
  id?: string;
  userA: ExchangePerson;
  userB: ExchangePerson;
};

export type ExchangeSettingsDefaults = {
  title?: string;
  occasionType?: OccasionType;
  // yyyy-mm-dd for the native date input
  eventDate?: string;
  spendingGuideline?: string;
  revealMode?: RevealMode;
  autoReveal?: boolean;
  autoRevealDate?: string;
  avoidRepeats?: boolean;
};

export type ExchangeSettingsErrors = Partial<
  Record<
    'title' | 'eventDate' | 'spendingGuideline' | 'autoRevealDate' | 'form',
    string
  >
>;

// The setup form's fields, as plain named inputs so the route's Zod schema is
// the single validator. Switches post hidden values. Rendered by both
// `/exchanges/new` and the settings page (`locked` after the draw leaves only
// the auto-reveal controls live).
export function ExchangeSettingsFields({
  mode,
  isGroup,
  groupName,
  members,
  defaults = {},
  errors = {},
  locked = false,
  initialExclusions = [],
}: Readonly<{
  mode: 'create' | 'edit';
  isGroup: boolean;
  groupName?: string | null;
  members: ExchangePerson[];
  defaults?: ExchangeSettingsDefaults;
  errors?: ExchangeSettingsErrors;
  locked?: boolean;
  initialExclusions?: ExclusionPair[];
}>) {
  const [revealMode, setRevealMode] = useState<RevealMode>(
    defaults.revealMode ?? REVEAL_MODE.ORGANIZER,
  );
  const [autoReveal, setAutoReveal] = useState(defaults.autoReveal ?? true);
  const [avoidRepeats, setAvoidRepeats] = useState(
    defaults.avoidRepeats ?? true,
  );
  const [eventDate, setEventDate] = useState(defaults.eventDate ?? '');
  const [autoRevealDate, setAutoRevealDate] = useState(
    defaults.autoRevealDate ?? '',
  );
  const [exclusions, setExclusions] =
    useState<ExclusionPair[]>(initialExclusions);

  const secretForever = revealMode === REVEAL_MODE.SECRET_FOREVER;

  return (
    <div className="space-y-6">
      <fieldset disabled={locked} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="exchange-title">Name</Label>
          <Input
            id="exchange-title"
            name="title"
            required
            maxLength={100}
            defaultValue={defaults.title}
            placeholder={
              groupName
                ? `${groupName} ${new Date().getFullYear()}`
                : 'Studio Christmas'
            }
            aria-invalid={errors.title ? true : undefined}
          />
          {errors.title ? <FieldError>{errors.title}</FieldError> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="exchange-occasion">Occasion</Label>
            <select
              id="exchange-occasion"
              name="occasionType"
              defaultValue={defaults.occasionType ?? OCCASION_TYPE.HOLIDAY}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(OCCASION_TYPE) as OccasionType[]).map((key) => (
                <option key={key} value={key}>
                  {OCCASION_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="exchange-date">Exchange date</Label>
            <Input
              id="exchange-date"
              name="eventDate"
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              aria-invalid={errors.eventDate ? true : undefined}
            />
            {errors.eventDate ? (
              <FieldError>{errors.eventDate}</FieldError>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exchange-guideline">
            Spending guideline{' '}
            <span className="font-normal text-muted-foreground">
              · optional
            </span>
          </Label>
          <Input
            id="exchange-guideline"
            name="spendingGuideline"
            maxLength={SPENDING_GUIDELINE_MAX_LENGTH}
            defaultValue={defaults.spendingGuideline}
            placeholder="Around $50"
          />
          <p className="text-xs text-muted-foreground">
            Just a note to each other. Gift Pool never handles money.
          </p>
        </div>
      </fieldset>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Settings</h3>
        {isGroup ? (
          <fieldset disabled={locked}>
            <SwitchRow
              id="avoid-repeats"
              title="Give everyone someone new"
              description={`Avoids anyone you drew in the last ${DEFAULT_LOOKBACK === 2 ? 'two' : DEFAULT_LOOKBACK} draws${groupName ? ` in ${groupName}` : ''}.`}
              checked={avoidRepeats}
              disabled={locked}
              onCheckedChange={setAvoidRepeats}
            />
            <input
              type="hidden"
              name="avoidRepeats"
              value={avoidRepeats ? 'on' : 'off'}
            />
          </fieldset>
        ) : null}

        <fieldset disabled={locked} className="space-y-2 pt-2">
          <legend className="text-sm font-medium">
            When the pairings are shown
          </legend>
          <RadioRow
            name="revealMode"
            value={REVEAL_MODE.ORGANIZER}
            checked={!secretForever}
            onChange={() => setRevealMode(REVEAL_MODE.ORGANIZER)}
            title="I'll reveal them"
            description="You press the button when the group is together."
            disabled={locked}
          />
          <RadioRow
            name="revealMode"
            value={REVEAL_MODE.SECRET_FOREVER}
            checked={secretForever}
            onChange={() => setRevealMode(REVEAL_MODE.SECRET_FOREVER)}
            title="Keep it secret forever"
            description="Guesses are scored, pairings never shown."
            disabled={locked}
          />
        </fieldset>

        {!secretForever ? (
          <div className="space-y-2 pt-2">
            <SwitchRow
              id="auto-reveal"
              title="Reveal for me if I forget"
              description="So the group isn't left waiting on you."
              checked={autoReveal}
              onCheckedChange={setAutoReveal}
            />
            <input
              type="hidden"
              name="autoReveal"
              value={autoReveal ? 'on' : 'off'}
            />
            {autoReveal ? (
              <div className="space-y-1.5 pl-1">
                <Label htmlFor="auto-reveal-date">On</Label>
                <Input
                  id="auto-reveal-date"
                  name="autoRevealDate"
                  type="date"
                  min={eventDate || undefined}
                  value={autoRevealDate}
                  onChange={(e) => setAutoRevealDate(e.target.value)}
                  aria-invalid={errors.autoRevealDate ? true : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  {autoRevealDate
                    ? ''
                    : 'Leave blank for three days after the exchange. '}
                  {eventDate
                    ? `Any date from ${formatExchangeDate(eventDate)} onwards works.`
                    : ''}
                </p>
                {errors.autoRevealDate ? (
                  <FieldError>{errors.autoRevealDate}</FieldError>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === 'create' && !locked ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Don't pair these people</h3>
            <ExclusionPicker
              members={members}
              existing={exclusions}
              onAdd={(pair) => setExclusions((prev) => [...prev, pair])}
            />
          </div>
          <input
            type="hidden"
            name="exclusions"
            value={JSON.stringify(
              exclusions.map((e) => [e.userA.id, e.userB.id]),
            )}
          />
          {exclusions.length > 0 ? (
            <ul className="space-y-2">
              {exclusions.map((pair, i) => (
                <li
                  key={`${pair.userA.id}-${pair.userB.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {displayName(pair.userA)}{' '}
                    <span className="text-muted-foreground">and</span>{' '}
                    {displayName(pair.userB)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove exclusion ${displayName(pair.userA)} and ${displayName(pair.userB)}`}
                    onClick={() =>
                      setExclusions((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <LuX aria-hidden className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Useful for couples and housemates who shop together.
          </p>
        </div>
      ) : null}

      {errors.form ? <FieldError>{errors.form}</FieldError> : null}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-foreground-destructive" role="alert">
      {children}
    </p>
  );
}

function RadioRow({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
        checked ? 'border-primary bg-primary/5' : 'border-border',
        disabled && 'cursor-default opacity-70',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

// "Add an exclusion" — a bottom sheet below 640px, a centered dialog above.
function ExclusionPicker({
  members,
  existing,
  onAdd,
}: {
  members: ExchangePerson[];
  existing: ExclusionPair[];
  onAdd: (pair: ExclusionPair) => void;
}) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const byId = new Map(members.map((m) => [m.id, m]));
  const duplicate = existing.some(
    (e) =>
      (e.userA.id === a && e.userB.id === b) ||
      (e.userA.id === b && e.userB.id === a),
  );
  const valid = a && b && a !== b && !duplicate;

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={members.length < 2}
        >
          Add
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Don't pair these people</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Neither of them will draw the other.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="grid gap-3">
          <PersonSelect
            id="exclusion-a"
            label="First person"
            members={members}
            value={a}
            onChange={setA}
          />
          <PersonSelect
            id="exclusion-b"
            label="Second person"
            members={members}
            value={b}
            onChange={setB}
            exclude={a}
          />
          {duplicate ? (
            <p className="text-xs text-muted-foreground">
              That pair is already excluded.
            </p>
          ) : null}
        </div>
        <ResponsiveDialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid}
            onClick={() => {
              const userA = byId.get(a);
              const userB = byId.get(b);
              if (!userA || !userB) return;
              onAdd({ userA, userB });
              setA('');
              setB('');
              setOpen(false);
            }}
          >
            Add exclusion
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function PersonSelect({
  id,
  label,
  members,
  value,
  onChange,
  exclude,
}: {
  id: string;
  label: string;
  members: ExchangePerson[];
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Choose someone</option>
        {members
          .filter((m) => m.id !== exclude)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
      </select>
    </div>
  );
}
