// Re-export so React Router routes form submissions to the right action.
// The loader is on _layout.tsx; the action must also be here since forms
// in a child route submit to that child's action, not the parent's.
export { action } from './__route.server';

import { useEffect, useState } from 'react';
import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod';
import {
  LuCheck,
  LuLink,
  LuPackage,
  LuThumbsUp,
  LuTruck,
  LuX,
} from 'react-icons/lu';
import {
  Form,
  useFetcher,
  useNavigation,
  useRouteLoaderData,
} from 'react-router';
import { z } from 'zod';
import { OrganizerReminderAction } from '#app/components/pools/organizer-reminder-action.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Badge } from '#app/components/ui/badge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { formatCents } from '#app/utils/pool-contributions.ts';
import {
  DECISION_MODE,
  POOL_STATUS,
  type PoolStatus,
} from '#app/utils/pool-constants.ts';
import { type loader as routeLoader } from './__route.server';

type LoaderData = Awaited<ReturnType<typeof routeLoader>>;
type Pool = LoaderData['pool'];
type Idea = Pool['ideas'][number];
type Contributor = Pool['contributors'][number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const getUserDisplayName = (u: {
  name: string | null;
  username: string;
}) => (u.name && u.name.length > 0 ? u.name : `@${u.username}`);

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Text weight="semibold" className="text-sm text-muted-foreground">
    {children}
  </Text>
);

// Inline form for updating your own contribution amount.
// The Save button only appears once the value has changed from the current one.
const ContributionEditor = ({
  poolId,
  currentCents,
}: {
  poolId: string;
  currentCents: number | null;
}) => {
  const fetcher = useFetcher();
  // User enters dollars (e.g. "30.00"); server converts to cents.
  const defaultValue =
    currentCents !== null ? (currentCents / 100).toFixed(2) : '';
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const parsedValue = value === '' ? null : Number.parseFloat(value);
  const parsedDefaultValue =
    defaultValue === '' ? null : Number.parseFloat(defaultValue);
  // Compare parsed floats so "30" and "30.00" are treated as equal (no false dirty).
  const isDirty = parsedValue !== parsedDefaultValue;

  const [form, fields] = useForm({
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: z.object({
          intent: z.literal('update-contribution'),
          poolId: z.string(),
          // User types dollars; validation just checks it's a non-negative number.
          contributionCents: z.coerce.number().min(0),
        }),
      });
    },
  });

  return (
    <fetcher.Form
      method="post"
      {...getFormProps(form)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="intent" value="update-contribution" />
      <input type="hidden" name="poolId" value={poolId} />
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          {...getInputProps(fields.contributionCents, { type: 'text' })}
          data-testid="contribution-input"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]{0,2}"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.00"
          className="w-24 pl-6 [appearance:textfield]"
        />
      </div>
      {isDirty && (
        <Button type="submit" size="sm" variant="default" className="shrink-0">
          Save
        </Button>
      )}
    </fetcher.Form>
  );
};

// A single idea card
const IdeaCard = ({
  idea,
  poolId,
  isVoting,
  myVoteIdeaId,
  canManage,
  canDelete,
  canChoose,
}: {
  idea: Idea;
  poolId: string;
  isVoting: boolean;
  myVoteIdeaId: string | null;
  canManage: boolean;
  canDelete: boolean;
  canChoose: boolean;
}) => {
  const voteFetcher = useFetcher();
  const chooseFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const hasMyVote = myVoteIdeaId === idea.id;
  const isChoosingThis =
    chooseFetcher.state !== 'idle' &&
    (chooseFetcher.formData?.get('ideaId') as string) === idea.id;

  return (
    <Card className="overflow-hidden" data-testid="idea-card">
      {/* Body */}
      <div className="p-4">
        {/* Title — no delete button here */}
        <p className="text-sm font-semibold leading-snug">{idea.name}</p>
        {idea.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {idea.description}
          </p>
        )}

        {/* Badges + link */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {idea.estimatedPriceCents !== null && (
            <span
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              data-testid="idea-price-badge"
            >
              ≈ {formatCents(idea.estimatedPriceCents)}
            </span>
          )}
          {idea.url && (
            <a
              href={`/out?idea=${idea.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <LuLink size={11} /> View link
            </a>
          )}
          {idea.wishlistItem && (
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
              From wishlist
            </span>
          )}
        </div>
      </div>

      {/* Footer: attribution left, actions right */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2.5">
        {/* Who proposed it */}
        <span className="text-xs text-muted-foreground">
          by{' '}
          <span className="font-medium text-foreground">
            {getUserDisplayName(idea.proposedBy)}
          </span>
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Vote count (non-voting state) */}
          {!isVoting && idea._count.votes > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LuThumbsUp size={11} />
              {idea._count.votes}
            </span>
          )}

          {/* Vote button (VOTING state) */}
          {isVoting && (
            <voteFetcher.Form method="post">
              <input type="hidden" name="intent" value="cast-vote" />
              <input type="hidden" name="poolId" value={poolId} />
              <input type="hidden" name="ideaId" value={idea.id} />
              <Button
                type="submit"
                size="sm"
                variant={hasMyVote ? 'default' : 'outline'}
                className="h-7 gap-1.5 text-xs"
                disabled={voteFetcher.state !== 'idle'}
              >
                <LuThumbsUp size={12} />
                {hasMyVote ? 'Voted' : 'Vote'}
                {idea._count.votes > 0 && (
                  <span className="rounded-full bg-background/40 px-1.5">
                    {idea._count.votes}
                  </span>
                )}
              </Button>
            </voteFetcher.Form>
          )}

          {/* Choose this — outline so it doesn't shout on every card */}
          {canChoose && (
            <chooseFetcher.Form method="post">
              <input type="hidden" name="intent" value="choose-idea" />
              <input type="hidden" name="poolId" value={poolId} />
              <input type="hidden" name="ideaId" value={idea.id} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={isChoosingThis}
              >
                <LuCheck size={12} />
                {isChoosingThis ? 'Choosing…' : 'Choose'}
              </Button>
            </chooseFetcher.Form>
          )}

          {/* Remove — in the footer, separated from title */}
          {deleteFetcher.state === 'idle' && canDelete && (
            <deleteFetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-idea" />
              <input type="hidden" name="poolId" value={poolId} />
              <input type="hidden" name="ideaId" value={idea.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/70 hover:text-destructive"
                aria-label="Remove idea"
              >
                <LuX size={13} />
              </Button>
            </deleteFetcher.Form>
          )}
        </div>
      </div>
    </Card>
  );
};

// Propose idea form
type RecipientWishlistItem = LoaderData['recipientWishlistItems'][number];

const ProposeIdeaForm = ({
  poolId,
  recipientWishlistItems = [],
}: {
  poolId: string;
  recipientWishlistItems?: RecipientWishlistItem[];
}) => {
  const fetcher = useFetcher();
  const [selectedItemId, setSelectedItemId] = useState('');
  const [form, fields] = useForm({
    lastResult: fetcher.data as any,
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: z.object({
          intent: z.literal('propose-idea'),
          poolId: z.string(),
          name: z.string().min(1, 'Give the idea a name').max(200),
          description: z.string().max(500).optional(),
          url: z
            .string()
            .url('Must be a valid URL')
            .optional()
            .or(z.literal('')),
          // User enters dollars; server converts to cents.
          estimatedPriceCents: z.coerce
            .number()
            .min(0)
            .optional()
            .or(z.literal('')),
          wishlistItemId: z.string().optional(),
        }),
      });
    },
  });

  const isSubmitting = fetcher.state !== 'idle';

  // Prefill name/url/price from a picked wishlist item. Clearing the picker
  // only unlinks the item — prefilled text stays, it's the user's now.
  const handlePickItem = (itemId: string) => {
    setSelectedItemId(itemId);
    if (!itemId) return;
    const item = recipientWishlistItems.find((i) => i.id === itemId);
    if (!item) return;
    form.update({ name: fields.name.name, value: item.title });
    form.update({ name: fields.url.name, value: item.url ?? '' });
    form.update({
      name: fields.estimatedPriceCents.name,
      value: item.priceCents == null ? '' : (item.priceCents / 100).toFixed(2),
    });
  };

  return (
    <fetcher.Form method="post" {...getFormProps(form)}>
      <input type="hidden" name="intent" value="propose-idea" />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="wishlistItemId" value={selectedItemId} />
      <Card className="p-4">
        <Stack gap={3}>
          <Text weight="medium" size="sm">
            Propose an idea
          </Text>
          {recipientWishlistItems.length > 0 && (
            <select
              value={selectedItemId}
              onChange={(e) => handlePickItem(e.target.value)}
              data-testid="wishlist-item-picker"
              aria-label="Pick from their wishlist"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
            >
              <option value="">From their wishlist… (optional)</option>
              {recipientWishlistItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.priceCents == null
                    ? ''
                    : ` — ${formatCents(item.priceCents, item.currency ?? 'USD')}`}
                </option>
              ))}
            </select>
          )}
          <Stack gap={2}>
            <Input
              {...getInputProps(fields.name, { type: 'text' })}
              placeholder="What should we get them?"
              autoComplete="off"
            />
            {fields.name.errors && (
              <Text size="xs" className="text-destructive">
                {fields.name.errors[0]}
              </Text>
            )}
          </Stack>
          <Flex gap={2}>
            <Input
              {...getInputProps(fields.url, { type: 'text' })}
              placeholder="Link (optional)"
              className="flex-1"
            />
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                {...getInputProps(fields.estimatedPriceCents, { type: 'text' })}
                data-testid="idea-price-input"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]{0,2}"
                placeholder="0.00"
                className="w-24 pl-6 [appearance:textfield]"
              />
            </div>
          </Flex>
          <Textarea
            {...getInputProps(fields.description, { type: 'text' })}
            placeholder="Notes (optional)"
            rows={2}
          />
          <Flex justify="end">
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add idea'}
            </Button>
          </Flex>
        </Stack>
      </Card>
    </fetcher.Form>
  );
};

// Chosen gift banner (shown when DECIDED+)
const ChosenGiftBanner = ({
  idea,
  finalPriceCents,
  poolId,
  canManage,
}: {
  idea: Idea;
  finalPriceCents: number | null;
  poolId: string;
  canManage: boolean;
}) => {
  const fetcher = useFetcher();

  return (
    <Card className="border-primary/20 bg-primary/5 p-5">
      <Stack gap={3}>
        <Flex gap={2} align="center">
          <LuCheck className="text-primary" size={18} />
          <Text weight="semibold">Chosen gift</Text>
        </Flex>
        <Stack gap={1}>
          <Text weight="semibold" size="lg">
            {idea.name}
          </Text>
          {idea.description && (
            <Text size="sm" className="text-muted-foreground">
              {idea.description}
            </Text>
          )}
          {idea.url && (
            <a
              href={`/out?idea=${idea.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <LuLink size={13} /> View link
            </a>
          )}
        </Stack>
        {/* Final price: display + optional inline editor for managers */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Final price</p>
            <p
              className="text-lg font-semibold"
              data-testid="final-price-display"
            >
              {finalPriceCents !== null
                ? formatCents(finalPriceCents)
                : idea.estimatedPriceCents !== null
                  ? `≈ ${formatCents(idea.estimatedPriceCents)}`
                  : 'Not set'}
            </p>
          </div>
          {canManage && (
            <fetcher.Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="update-final-price" />
              <input type="hidden" name="poolId" value={poolId} />
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  name="finalPriceCents"
                  type="text"
                  data-testid="final-price-input"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]{0,2}"
                  defaultValue={
                    finalPriceCents !== null
                      ? (finalPriceCents / 100).toFixed(2)
                      : idea.estimatedPriceCents !== null
                        ? (idea.estimatedPriceCents / 100).toFixed(2)
                        : ''
                  }
                  placeholder="0.00"
                  className="w-24 pl-6 text-sm"
                  min={0}
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                Update
              </Button>
            </fetcher.Form>
          )}
        </div>
      </Stack>
    </Card>
  );
};

// Flat settlement check (viewer-scoped breakdown from the loader).
function hasPendingSettlement(
  breakdown: LoaderData['contributionBreakdown'],
): boolean {
  if (!breakdown) return false;
  if (breakdown.kind === 'purchaser') {
    return breakdown.breakdown.some((b) => !b.hasPaid);
  }
  return breakdown.viewerShare?.hasPaid === false;
}

// Buy stage (§6.5): Available Budget compared against the gift's price — the
// price is the denominator, never a pool goal. Single teal fill.
const BuyBudgetComparison = ({
  availableBudgetCents,
  finalPriceCents,
}: {
  availableBudgetCents: number;
  finalPriceCents: number | null;
}) => {
  if (finalPriceCents === null || availableBudgetCents <= 0) return null;
  return (
    <Card className="p-4" data-testid="budget-vs-price">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Available together</span>
        <span className="font-semibold">
          {formatCents(availableBudgetCents)} of {formatCents(finalPriceCents)}{' '}
          gift price
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-pool"
          style={{
            width: `${Math.min(100, Math.round((availableBudgetCents / finalPriceCents) * 100))}%`,
          }}
        />
      </div>
    </Card>
  );
};

// Complete stage (§6.5): factual memory — gift, recipient, price, headcount.
// Never invented recipient sentiment.
const GiftMemorySummary = ({
  giftName,
  recipientLabel,
  finalPriceCents,
  contributorCount,
}: {
  giftName: string;
  recipientLabel: string | null;
  finalPriceCents: number | null;
  contributorCount: number;
}) => (
  <Card className="p-5" data-testid="gift-memory-summary">
    <Stack gap={2}>
      <SectionHeading>Gift memory</SectionHeading>
      <p className="text-base font-semibold">{giftName}</p>
      <p className="text-sm text-muted-foreground">
        {recipientLabel ? `Given to ${recipientLabel}` : 'Given'}
        {finalPriceCents !== null ? ` · ${formatCents(finalPriceCents)}` : ''}
        {' · '}
        {contributorCount === 1
          ? 'a solo gift'
          : `${contributorCount} gave together`}
      </p>
    </Stack>
  </Card>
);

// Contribution breakdown (shown when DECIDED+). The purchaser sees every
// share and Received status owed to them; every other contributor sees only
// their own share (ADR 0001 — payment coordination is private between
// purchaser and contributor). Money always moves directly, outside Gift Pool.
const ContributionBreakdown = ({
  breakdown,
  poolId,
  purchaserName,
}: {
  breakdown: NonNullable<LoaderData['contributionBreakdown']>;
  poolId: string;
  purchaserName: string | null;
}) => {
  const fetcher = useFetcher();

  if (breakdown.kind === 'contributor') {
    if (!breakdown.viewerShare) return null;
    return (
      <Card className="p-4" data-testid="viewer-share-card">
        <Stack gap={2}>
          <SectionHeading>Your share</SectionHeading>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-semibold">
              {formatCents(breakdown.viewerShare.owedCents)}
            </span>
            {breakdown.viewerShare.hasPaid ? (
              <span className="rounded-full bg-success-muted px-2 py-0.5 text-xs text-success">
                Received
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Not yet received
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pay {purchaserName ?? 'the buyer'} directly — money never moves
            through Gift Pool. They&rsquo;ll confirm once it arrives.
          </p>
          {breakdown.shortfallCents > 0 && (
            <p className="text-xs text-muted-foreground">
              The buyer covers the remaining{' '}
              {formatCents(breakdown.shortfallCents)}.
            </p>
          )}
        </Stack>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <Stack gap={3}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <SectionHeading>What everyone owes you</SectionHeading>
          {breakdown.shortfallCents > 0 && (
            <Badge className="shrink-0 bg-muted text-xs text-muted-foreground">
              You cover {formatCents(breakdown.shortfallCents)}
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {breakdown.breakdown.map((b) => (
            <div
              key={b.userId}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              data-testid="contribution-breakdown-row"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar size={7} image={b.user.image} user={b.user} />
                <span className="truncate text-sm">
                  {getUserDisplayName(b.user)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatCents(b.owedCents)}
                </span>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="mark-paid" />
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="targetUserId" value={b.userId} />
                  <input
                    type="hidden"
                    name="hasPaid"
                    value={b.hasPaid ? 'false' : 'true'}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant={b.hasPaid ? 'default' : 'outline'}
                    className="h-7 gap-1 text-xs"
                  >
                    {b.hasPaid ? (
                      <>
                        <LuCheck size={12} /> Received
                      </>
                    ) : (
                      'Mark received'
                    )}
                  </Button>
                </fetcher.Form>
              </div>
            </div>
          ))}
        </div>
      </Stack>
    </Card>
  );
};

// Clean contributor row — name + role badges on the left, amount on the right.
// Role assignment is handled separately in AssignRolesSection.
const ContributorsList = ({
  contributors,
  poolId,
  viewerUserId,
  viewerContributionCents,
  availableBudgetCents,
  organizerId,
  purchaserId,
  delivererId,
  canManage,
  isDecided,
  reminderAction,
}: {
  contributors: Contributor[];
  poolId: string;
  viewerUserId: string;
  viewerContributionCents: number | null;
  availableBudgetCents: number;
  organizerId: string;
  purchaserId: string | null;
  delivererId: string | null;
  canManage: boolean;
  isDecided: boolean;
  reminderAction?: React.ReactNode;
}) => {
  return (
    <Card className="p-4">
      <Stack gap={3}>
        <div className="flex items-center justify-between gap-3">
          <SectionHeading>Contributors ({contributors.length})</SectionHeading>
          {reminderAction}
        </div>
        <p className="text-xs text-muted-foreground">
          Set what you&rsquo;re comfortable contributing — your limit stays
          private to you.
        </p>
        {availableBudgetCents > 0 && (
          <p className="text-sm" data-testid="available-budget">
            <span className="font-semibold">
              {formatCents(availableBudgetCents)}
            </span>{' '}
            <span className="text-muted-foreground">
              available together so far
            </span>
          </p>
        )}
        <Stack gap={2}>
          {contributors.map((c) => {
            const isMe = c.userId === viewerUserId;
            const isOrganizer = c.userId === organizerId;
            const isPurchaser = c.userId === purchaserId;
            const isDeliverer = c.userId === delivererId;

            return (
              <div
                key={c.userId}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                {/* Left: avatar + name + badges */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar size="s" image={c.user.image} user={c.user} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className={isMe ? 'font-semibold' : ''}>
                        {getUserDisplayName(c.user)}
                      </span>
                      {isMe && <SystemLabel>you</SystemLabel>}
                    </div>
                    {(isOrganizer || isPurchaser || isDeliverer) && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {isOrganizer && (
                          <Badge className="h-4 px-1.5 text-[10px]">
                            Organizer
                          </Badge>
                        )}
                        {isPurchaser && (
                          <Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            Buyer
                          </Badge>
                        )}
                        {isDeliverer && (
                          <Badge className="h-4 bg-blue-100 px-1.5 text-[10px] text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Delivery
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: own editable limit; peers see nothing (limits are
								    private). Managers see only whether a limit is missing. */}
                <div className="shrink-0">
                  {isMe ? (
                    !isDecided ? (
                      <ContributionEditor
                        poolId={poolId}
                        currentCents={viewerContributionCents}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {viewerContributionCents !== null
                          ? formatCents(viewerContributionCents)
                          : '—'}
                      </span>
                    )
                  ) : c.hasSetLimit !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {c.hasSetLimit ? 'Limit set' : 'No limit yet'}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
};

// Separate card for assigning buyer / deliverer roles — only shown to organizer
// in DECIDED+ state. Keeps the contributor list rows clean.
const AssignRolesSection = ({
  contributors,
  poolId,
  purchaserId,
  delivererId,
}: {
  contributors: Contributor[];
  poolId: string;
  purchaserId: string | null;
  delivererId: string | null;
}) => {
  const buyerFetcher = useFetcher();
  const delivererFetcher = useFetcher();

  return (
    <Card className="p-4">
      <Stack gap={4}>
        <SectionHeading>Assign roles</SectionHeading>

        {/* Who's buying */}
        <Stack gap={2}>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <LuPackage size={14} className="text-amber-600" />
            Who's buying the gift?
          </div>
          <div className="flex flex-col gap-1.5">
            {contributors.map((c) => {
              const isCurrentBuyer = c.userId === purchaserId;
              return (
                <buyerFetcher.Form key={c.userId} method="post">
                  <input type="hidden" name="intent" value="assign-purchaser" />
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="userId" value={c.userId} />
                  <button
                    type="submit"
                    disabled={isCurrentBuyer}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isCurrentBuyer
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <Avatar size={7} image={c.user.image} user={c.user} />
                    <span className="flex-1">{getUserDisplayName(c.user)}</span>
                    {isCurrentBuyer && (
                      <LuCheck size={14} className="text-amber-600" />
                    )}
                  </button>
                </buyerFetcher.Form>
              );
            })}
          </div>
        </Stack>

        {/* Who's delivering */}
        <Stack gap={2}>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <LuTruck size={14} className="text-blue-600" />
            Who's delivering?
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {contributors.map((c) => {
              const isCurrentDeliverer = c.userId === delivererId;
              return (
                <delivererFetcher.Form key={c.userId} method="post">
                  <input type="hidden" name="intent" value="assign-deliverer" />
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="userId" value={c.userId} />
                  <button
                    type="submit"
                    disabled={isCurrentDeliverer}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isCurrentDeliverer
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <Avatar size={7} image={c.user.image} user={c.user} />
                    <span className="flex-1">{getUserDisplayName(c.user)}</span>
                    {isCurrentDeliverer && (
                      <LuCheck size={14} className="text-blue-600" />
                    )}
                  </button>
                </delivererFetcher.Form>
              );
            })}
          </div>
        </Stack>
      </Stack>
    </Card>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const PoolIndex = () => {
  const {
    pool,
    viewer,
    canManage,
    availableBudgetCents,
    myVoteIdeaId,
    contributionBreakdown,
    recipientWishlistItems,
    organizerReminderStates,
  } = useRouteLoaderData<typeof routeLoader>('routes/pools+/$poolId+/_layout')!;

  const status = pool.status as PoolStatus;
  const isOpen = status === POOL_STATUS.OPEN;
  const isVoting = status === POOL_STATUS.VOTING;
  const isDecided = status === POOL_STATUS.DECIDED;
  const isPurchased = status === POOL_STATUS.PURCHASED;
  const isDelivered = status === POOL_STATUS.DELIVERED;
  const isActive = isOpen || isVoting;

  const chosenIdea = pool.ideas.find((i) => i.id === pool.chosenIdeaId) ?? null;
  const isPurchaser = viewer?.userId === pool.purchaserId;
  const isDeliverer = viewer?.userId === pool.delivererId;
  const senderDisplayName =
    viewer?.user.name ?? viewer?.user.username ?? 'A pool manager';

  const navigation = useNavigation();

  // ── Stage-adaptive composition (§6.5): the shell is stable, the main
  // column changes by stage. In Complete, factual memory dominates and the
  // operational sections collapse into history.
  const chosenBanner = chosenIdea ? (
    <ChosenGiftBanner
      idea={chosenIdea}
      finalPriceCents={pool.finalPriceCents}
      poolId={pool.id}
      canManage={canManage}
    />
  ) : null;

  const settlementPending = hasPendingSettlement(contributionBreakdown);

  const settlement = contributionBreakdown ? (
    <ContributionBreakdown
      breakdown={contributionBreakdown}
      poolId={pool.id}
      purchaserName={
        pool.purchaser ? (pool.purchaser.name ?? pool.purchaser.username) : null
      }
    />
  ) : null;

  const ideasRecap =
    !isActive && pool.ideas.length > 1 ? (
      <Card className="overflow-hidden p-0">
        <div className="px-4 pb-2 pt-4">
          <SectionHeading>Other ideas that were proposed</SectionHeading>
        </div>
        <div className="divide-y">
          {pool.ideas
            .filter((i) => i.id !== pool.chosenIdeaId)
            .map((idea) => (
              <div
                key={idea.id}
                className="flex items-center justify-between px-4 py-2.5 opacity-60"
              >
                <Text size="sm">{idea.name}</Text>
                {idea.estimatedPriceCents !== null && (
                  <Text
                    size="xs"
                    className="shrink-0 pl-3 text-muted-foreground"
                  >
                    {formatCents(idea.estimatedPriceCents)}
                  </Text>
                )}
              </div>
            ))}
        </div>
      </Card>
    ) : null;

  const contributorsSection = (
    <ContributorsList
      contributors={pool.contributors}
      poolId={pool.id}
      viewerUserId={viewer?.userId ?? ''}
      viewerContributionCents={viewer?.contributionCents ?? null}
      availableBudgetCents={availableBudgetCents}
      organizerId={pool.organizerId}
      purchaserId={pool.purchaserId}
      delivererId={pool.delivererId}
      canManage={canManage}
      isDecided={isDecided || isPurchased || isDelivered}
      reminderAction={
        canManage && isActive && organizerReminderStates.CONTRIBUTION ? (
          <OrganizerReminderAction
            availability={organizerReminderStates.CONTRIBUTION}
            kind="CONTRIBUTION"
            poolId={pool.id}
            poolTitle={pool.title}
            senderDisplayName={senderDisplayName}
            className="items-end"
          />
        ) : undefined
      }
    />
  );

  const recipientLabel =
    pool.recipientName ??
    pool.recipientUser?.name ??
    pool.recipientUser?.username ??
    null;

  return (
    <Stack gap={6}>
      {/* ── Organizer controls — only shown when there's a voting action to take ── */}
      {canManage &&
        isActive &&
        (isVoting || (isOpen && pool.decisionMode === DECISION_MODE.VOTE)) && (
          <Card className="border-dashed p-4">
            <Stack gap={3}>
              <SectionHeading>Organizer controls</SectionHeading>
              <Flex gap={2} wrap="wrap">
                {isOpen && pool.decisionMode === DECISION_MODE.VOTE && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="call-vote" />
                    <input type="hidden" name="poolId" value={pool.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Call a vote
                    </Button>
                  </Form>
                )}
                {isVoting && (
                  <>
                    <Form method="post">
                      <input type="hidden" name="intent" value="close-vote" />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Close vote
                      </Button>
                    </Form>
                    {organizerReminderStates.VOTE && (
                      <OrganizerReminderAction
                        availability={organizerReminderStates.VOTE}
                        kind="VOTE"
                        poolId={pool.id}
                        poolTitle={pool.title}
                        senderDisplayName={senderDisplayName}
                      />
                    )}
                  </>
                )}
              </Flex>
            </Stack>
          </Card>
        )}

      {/* ── Chosen gift (Buy/Deliver stages) ── */}
      {!isDelivered && chosenBanner}

      {/* ── Buy stage: Available Budget vs the gift's price (§6.5) ── */}
      {isDecided && (
        <BuyBudgetComparison
          availableBudgetCents={availableBudgetCents}
          finalPriceCents={pool.finalPriceCents}
        />
      )}

      {/* ── Complete: factual Gift Memory leads (§6.5) ── */}
      {isDelivered && (
        <GiftMemorySummary
          giftName={chosenIdea?.name ?? pool.title}
          recipientLabel={recipientLabel}
          finalPriceCents={pool.finalPriceCents}
          contributorCount={pool.contributors.length}
        />
      )}

      {/* ── Purchaser CTA — right after the chosen gift so it's the next action ── */}
      {isDecided && isPurchaser && (
        <Form method="post">
          <input type="hidden" name="intent" value="mark-purchased" />
          <input type="hidden" name="poolId" value={pool.id} />
          <Button type="submit" className="w-full gap-2">
            <LuPackage size={16} />I bought it
          </Button>
        </Form>
      )}

      {isDecided &&
        canManage &&
        !isPurchaser &&
        pool.purchaser &&
        organizerReminderStates.PURCHASE && (
          <Card className="border-dashed bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <LuPackage className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium">Waiting for the buyer</p>
                  <p className="text-xs text-muted-foreground">
                    {getUserDisplayName(pool.purchaser)} is assigned to buy the
                    gift.
                  </p>
                </div>
              </div>
              <OrganizerReminderAction
                availability={organizerReminderStates.PURCHASE}
                kind="PURCHASE"
                poolId={pool.id}
                poolTitle={pool.title}
                senderDisplayName={senderDisplayName}
                className="sm:items-end"
              />
            </div>
          </Card>
        )}

      {/* ── Settlement — inline until Complete; after delivery it stays
            visible only while operationally necessary (something unpaid). ── */}
      {(!isDelivered || settlementPending) && settlement}

      {/* ── Deliverer CTA — shown after purchase is confirmed ── */}
      {isPurchased && isDeliverer && (
        <Form method="post">
          <input type="hidden" name="intent" value="mark-delivered" />
          <input type="hidden" name="poolId" value={pool.id} />
          <Button type="submit" className="w-full gap-2">
            <LuTruck size={16} />
            Mark as delivered
          </Button>
        </Form>
      )}

      {isPurchased &&
        canManage &&
        !isDeliverer &&
        pool.deliverer &&
        organizerReminderStates.DELIVERY && (
          <Card className="border-dashed bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <LuTruck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Waiting for delivery</p>
                  <p className="text-xs text-muted-foreground">
                    {getUserDisplayName(pool.deliverer)} is assigned to deliver
                    the gift.
                  </p>
                </div>
              </div>
              <OrganizerReminderAction
                availability={organizerReminderStates.DELIVERY}
                kind="DELIVERY"
                poolId={pool.id}
                poolTitle={pool.title}
                senderDisplayName={senderDisplayName}
                className="sm:items-end"
              />
            </div>
          </Card>
        )}

      {/* ── Ideas section (OPEN + VOTING) ── */}
      {isActive && (
        <Stack gap={3}>
          <Flex justify="between" align="center">
            <SectionHeading>
              Ideas{pool.ideas.length > 0 && ` (${pool.ideas.length})`}
            </SectionHeading>
            {isVoting && (
              <Badge className="bg-violet-100 text-xs text-violet-800">
                Voting open
              </Badge>
            )}
          </Flex>

          {/* Ideas list — browsing is primary, form comes after */}
          {pool.ideas.length > 0 ? (
            <Stack gap={2}>
              {pool.ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  poolId={pool.id}
                  isVoting={isVoting}
                  myVoteIdeaId={myVoteIdeaId}
                  canManage={canManage}
                  canDelete={canManage || idea.proposedById === viewer?.userId}
                  canChoose={
                    canManage && (isOpen || isVoting) && !pool.chosenIdeaId
                  }
                />
              ))}
            </Stack>
          ) : (
            <Text size="sm" className="py-2 text-center text-muted-foreground">
              No ideas yet — be the first to suggest something!
            </Text>
          )}

          {/* Propose form — anchored at the bottom */}
          <ProposeIdeaForm
            poolId={pool.id}
            recipientWishlistItems={recipientWishlistItems}
          />
          <p className="text-center text-xs text-muted-foreground/70">
            Some product links are affiliate links — GiftPool may earn a small
            commission, at no cost to you.{' '}
            <a
              href="/support#affiliate"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
              Learn more
            </a>
          </p>
        </Stack>
      )}

      {/* ── Operational sections — inline until Complete ── */}
      {!isDelivered && ideasRecap}
      {!isDelivered && contributorsSection}

      {/* ── Complete: prior work collapses into history (§6.5) ── */}
      {isDelivered && (
        <details
          className="rounded-xl border border-border/60"
          data-testid="pool-history"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-muted-foreground">
            How it came together
          </summary>
          <Stack gap={4} className="px-4 pb-4 pt-1">
            {chosenBanner}
            {!settlementPending && settlement}
            {ideasRecap}
            {contributorsSection}
          </Stack>
        </details>
      )}

      {/* ── Assign roles (organizer, DECIDED+, while roles still need setting) ── */}
      {canManage && (isDecided || isPurchased) && (
        <AssignRolesSection
          contributors={pool.contributors}
          poolId={pool.id}
          purchaserId={pool.purchaserId}
          delivererId={pool.delivererId}
        />
      )}

      {/* Inviting contributors and the danger zone (cancel / delete) now
			    live on the pool settings page, reached from the header. */}
    </Stack>
  );
};

export default PoolIndex;
