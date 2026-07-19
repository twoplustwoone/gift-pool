import { useEffect, useRef, useState } from 'react';
import {
  LuAlarmClock,
  LuTriangleAlert,
  LuCake,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuGift,
  LuHand,
  LuLightbulb,
  LuPackage,
  LuStar,
  LuTruck,
  LuVote,
  LuWallet,
} from 'react-icons/lu';
import {
  type LoaderFunctionArgs,
  Link,
  useFetcher,
  useLoaderData,
  useRouteLoaderData,
} from 'react-router';
import {
  MembersList,
  type MemberListEntry,
} from '#app/components/groups/members-list.tsx';
import { PoolStatusBadge } from '#app/components/pools/pool-status-badge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { track } from '#app/utils/analytics.client.ts';
import { formatMonthDay } from '#app/utils/dates.ts';
import {
  ACTION_TYPE,
  type ActionItem,
  type ActionType,
  type PastGift,
  type PoolSummary,
  type UpcomingOccasion,
} from '#app/utils/group-overview.ts';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn, getUserImgSrc } from '#app/utils/misc.tsx';
import {
  OCCASION_TYPE_LABELS,
  type PoolStatus,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import {
  type loader as routeLoader,
  type action as routeAction,
} from './__route.server';
import { type action as settingsAction } from './settings';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const { requireUserIdInGroup } = await import('#app/utils/groups.server.ts');
  const { getGroupOverviewData } =
    await import('#app/utils/group-overview.server.ts');
  const viewerId = await requireUserIdInGroup(request, groupId);
  return getGroupOverviewData(groupId, viewerId);
}

// ─── Action queue icon map ───────────────────────────────────────────────────

const actionIcons: Record<ActionType, React.ReactNode> = {
  [ACTION_TYPE.CAST_VOTE]: <LuVote className="text-violet-500" />,
  [ACTION_TYPE.CLOSE_VOTE]: <LuHand className="text-violet-500" />,
  [ACTION_TYPE.CALL_VOTE]: <LuVote className="text-violet-500" />,
  [ACTION_TYPE.CHOOSE_GIFT]: <LuGift className="text-blue-500" />,
  [ACTION_TYPE.MARK_PAID]: <LuWallet className="text-emerald-500" />,
  [ACTION_TYPE.MARK_PURCHASED]: <LuPackage className="text-amber-500" />,
  [ACTION_TYPE.MARK_DELIVERED]: <LuTruck className="text-amber-500" />,
  [ACTION_TYPE.SET_CONTRIBUTION]: (
    <LuWallet className="text-muted-foreground" />
  ),
  [ACTION_TYPE.PROPOSE_IDEA]: <LuLightbulb className="text-yellow-500" />,
  [ACTION_TYPE.IDEA_CHOSEN]: <LuStar className="text-blue-500" />,
  [ACTION_TYPE.UPCOMING_OCCASION]: <LuCake className="text-pink-500" />,
  [ACTION_TYPE.POOL_STUCK]: <LuTriangleAlert className="text-orange-500" />,
};

// ─── Page component ──────────────────────────────────────────────────────────

const GiftGroupOverview = () => {
  const data = useLoaderData<typeof loader>();
  const { giftGroup, inviteLink, viewer, canInvite } = useRouteLoaderData<
    typeof routeLoader
  >('routes/groups+/$giftGroupId_+/_layout')!;

  const essentials = (
    <GroupEssentialsCard
      giftGroupId={giftGroup.id}
      description={giftGroup.description}
      contributionCents={viewer.contributionCents ?? 0}
      inviteLink={inviteLink}
      canInvite={canInvite}
    />
  );

  return (
    // Desktop collapses the tabs into one dashboard: a wide action feed on
    // the left, a context rail (Members / Group info) on the right. Stays
    // inside the existing max-w-6xl container — the page scrolls naturally,
    // no independent-scroll columns. On mobile the rail simply flows under
    // the feed and shows Group info only (Members remains its own tab).
    <>
      {/* Mobile-only per-gift cap strip: a slim row directly under the tab bar
          and above "For you". Desktop keeps the cap in the Group info rail card
          (below), so this is hidden at lg+. */}
      <Flex
        justify="between"
        align="center"
        className="lg:hidden"
        data-testid="mobile-cap-strip"
      >
        <Text size="xs" className="text-muted-foreground">
          Your per-gift cap
        </Text>
        <InlineBudgetEditor
          giftGroupId={giftGroup.id}
          initialCents={viewer.contributionCents ?? 0}
          editLabel="Edit your per-gift cap"
          amountTestId=""
        />
      </Flex>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <Stack gap={6}>
          <ForYouSection
            items={data.actionQueue}
            nextOccasion={data.upcomingOccasions[0] ?? null}
          />
          <ActivePoolsSection pools={data.activePools} groupId={giftGroup.id} />
          <UpcomingOccasionsSection occasions={data.upcomingOccasions} />
          <PastGiftsSection gifts={data.pastGifts} />
        </Stack>

        {/* Context rail — desktop only. On mobile the cap moves to the strip
            above, invite moves to the header, and the description lives on the
            settings screen, so the whole rail is hidden. */}
        <div className="hidden lg:block">
          <Stack gap={6}>
            <MembersRailCard
              giftGroupId={giftGroup.id}
              members={giftGroup.groupMembers}
              viewerId={viewer.userId}
              viewerRole={viewer.role as GroupRole}
            />
            {essentials}
          </Stack>
        </div>
      </div>
    </>
  );
};
export default GiftGroupOverview;

// ─── Desktop rail ────────────────────────────────────────────────────────────

const MembersRailCard = ({
  giftGroupId,
  members,
  viewerId,
  viewerRole,
}: {
  giftGroupId: string;
  members: ReadonlyArray<MemberListEntry>;
  viewerId: string;
  viewerRole: GroupRole;
}) => (
  <Card padding="lg">
    <SectionHeader
      title={`Members (${members.length})`}
      trailing={
        <Link
          to={`/groups/${giftGroupId}/members`}
          className="text-xs text-primary hover:underline"
        >
          {viewerRole === 'MEMBER' ? 'View all' : 'Manage'}
        </Link>
      }
    />
    {/* Renders all members — no fixed-height scroll container. */}
    <MembersList
      giftGroupId={giftGroupId}
      viewerRole={viewerRole}
      viewerId={viewerId}
      members={members}
    />
  </Card>
);

// ─── For You ─────────────────────────────────────────────────────────────────

const ForYouSection = ({
  items,
  nextOccasion,
}: {
  items: ActionItem[];
  nextOccasion: UpcomingOccasion | null;
}) => (
  <section>
    <SectionHeader title="For you" />
    {items.length > 0 ? (
      <Stack gap={2}>
        {items.map((item, i) => (
          <ActionQueueItem
            key={`${item.type}-${item.poolId ?? item.memberId}-${i}`}
            item={item}
          />
        ))}
      </Stack>
    ) : (
      <Card padding="md">
        <Flex gap={3} align="center">
          <LuCheck className="shrink-0 text-emerald-500" size={20} />
          <Text size="sm" className="text-muted-foreground">
            {nextOccasion
              ? `All caught up. Next: ${nextOccasion.name}'s birthday in ${nextOccasion.daysUntil} days.`
              : 'All caught up. No upcoming actions right now.'}
          </Text>
        </Flex>
      </Card>
    )}
  </section>
);

const ActionQueueItem = ({ item }: { item: ActionItem }) => {
  const isUrgent = item.priority === 0;
  const isPrimary = item.priority <= 1;

  const description = buildActionDescription(item);

  return (
    <Link to={item.ctaUrl} className="block">
      <Card
        padding="md"
        className={cn(
          'transition-shadow hover:shadow-md',
          isUrgent && 'border-amber-300 dark:border-amber-700',
        )}
      >
        <Flex justify="between" align="center" gap={3}>
          <Flex gap={3} align="center" className="min-w-0 flex-1">
            <span className="shrink-0 text-lg">{actionIcons[item.type]}</span>
            <Stack gap={0} className="min-w-0 flex-1">
              <Text size="sm" weight="medium" className="truncate">
                {description}
              </Text>
              {isUrgent && item.daysUntilEvent !== null && (
                <Flex gap={1} align="center">
                  <LuAlarmClock className="text-amber-500" size={12} />
                  <Text
                    size="xs"
                    className="text-amber-600 dark:text-amber-400"
                  >
                    in {item.daysUntilEvent}{' '}
                    {item.daysUntilEvent === 1 ? 'day' : 'days'}
                  </Text>
                </Flex>
              )}
            </Stack>
          </Flex>
          <Button
            variant={isPrimary ? 'default' : 'secondary'}
            size="sm"
            className="shrink-0"
            tabIndex={-1}
          >
            {item.ctaLabel}
          </Button>
        </Flex>
      </Card>
    </Link>
  );
};

function buildActionDescription(item: ActionItem): string {
  // Server-provided description wins (used for POOL_STUCK where copy depends
  // on runtime state like idea count / vote counts).
  if (item.description) return item.description;

  switch (item.type) {
    case ACTION_TYPE.PROPOSE_IDEA:
      return `No ideas yet for ${item.recipientName}'s gift`;
    case ACTION_TYPE.CALL_VOTE:
      return `Ideas are in for ${item.recipientName} — call the vote?`;
    case ACTION_TYPE.CHOOSE_GIFT:
      return `Ideas are in — pick ${item.recipientName}'s gift`;
    case ACTION_TYPE.CAST_VOTE:
      return `Vote on ${item.recipientName}'s gift`;
    case ACTION_TYPE.CLOSE_VOTE:
      return `Voting open for ${item.recipientName} — close it?`;
    case ACTION_TYPE.SET_CONTRIBUTION:
      return `Set how much you'll chip in for ${item.recipientName}`;
    case ACTION_TYPE.MARK_PAID:
      return `You owe $${((item.amountCents ?? 0) / 100).toFixed(2)} for ${item.recipientName}'s gift`;
    case ACTION_TYPE.MARK_PURCHASED:
      return `${item.recipientName}'s gift decided — time to buy`;
    case ACTION_TYPE.MARK_DELIVERED:
      return `${item.recipientName}'s gift purchased — mark delivered`;
    case ACTION_TYPE.IDEA_CHOSEN:
      return `Your idea was picked for ${item.recipientName}!`;
    case ACTION_TYPE.UPCOMING_OCCASION:
      return `${item.recipientName}'s birthday in ${item.daysUntilEvent} days — no pool yet`;
    default:
      return '';
  }
}

// ─── Active Pools ────────────────────────────────────────────────────────────

const ACTIVE_POOLS_LIMIT = 5;

const ActivePoolsSection = ({
  pools,
  groupId,
}: {
  pools: PoolSummary[];
  groupId: string;
}) => {
  if (pools.length === 0) return null;

  const visible = pools.slice(0, ACTIVE_POOLS_LIMIT);
  const hasMore = pools.length > ACTIVE_POOLS_LIMIT;

  return (
    <section>
      <SectionHeader
        title="Active pools"
        trailing={
          <Text size="xs" className="text-muted-foreground">
            {pools.length}
          </Text>
        }
      />
      <Stack gap={2}>
        {visible.map((pool) => (
          <PoolRow key={pool.id} pool={pool} />
        ))}
      </Stack>
      {hasMore && (
        <Link
          to={`/groups/${groupId}/pools`}
          className="mt-2 block text-center text-sm text-primary hover:underline"
        >
          See all active pools →
        </Link>
      )}
    </section>
  );
};

function buildProgressLabel(pool: PoolSummary): string {
  if (pool.status === 'DECIDED' || pool.status === 'PURCHASED') {
    return `${pool.paidCount} of ${pool.contributorCount} paid`;
  }
  if (pool.ideaCount > 0) {
    const noun = pool.ideaCount === 1 ? 'idea' : 'ideas';
    return `${pool.ideaCount} ${noun}`;
  }
  const noun = pool.contributorCount === 1 ? 'contributor' : 'contributors';
  return `${pool.contributorCount} ${noun}`;
}

function buildViewerLabel(pool: PoolSummary): string | null {
  if (pool.viewerRole === 'organizing') return 'Organizing';
  if (pool.viewerContributionCents) {
    return `$${(pool.viewerContributionCents / 100).toFixed(0)}`;
  }
  if (pool.viewerRole === 'contributing') return 'Contributing';
  return null;
}

const PoolRow = ({ pool }: { pool: PoolSummary }) => {
  const status = pool.status as PoolStatus;
  const occasion = pool.occasionType as OccasionType;
  const progressLabel = buildProgressLabel(pool);
  const viewerLabel = buildViewerLabel(pool);

  return (
    <Link to={`/pools/${pool.id}`} className="block">
      <Card padding="md" className="transition-shadow hover:shadow-md">
        <Flex justify="between" align="start" gap={3}>
          <Stack gap={1} className="min-w-0 flex-1">
            <Text weight="semibold" className="truncate">
              {pool.title}
            </Text>
            <Text size="sm" className="truncate text-muted-foreground">
              {OCCASION_TYPE_LABELS[occasion]} for{' '}
              <span className="font-medium text-foreground">
                {pool.recipientName}
              </span>
            </Text>
            <Flex gap={2} align="center" wrap="wrap" className="mt-0.5 min-w-0">
              <Text size="xs" className="text-muted-foreground">
                {progressLabel}
              </Text>
              {viewerLabel && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <Text size="xs" className="font-medium text-foreground">
                    {viewerLabel}
                  </Text>
                </>
              )}
              {pool.eventDate && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <Text size="xs" className="text-muted-foreground">
                    {formatMonthDay(pool.eventDate)}
                  </Text>
                </>
              )}
            </Flex>
          </Stack>
          <PoolStatusBadge status={status} />
        </Flex>
      </Card>
    </Link>
  );
};

// ─── Upcoming Occasions ──────────────────────────────────────────────────────

const OCCASIONS_LIMIT = 5;

const UpcomingOccasionsSection = ({
  occasions,
}: {
  occasions: UpcomingOccasion[];
}) => {
  if (occasions.length === 0) return null;

  const visible = occasions.slice(0, OCCASIONS_LIMIT);

  return (
    <section>
      <SectionHeader title="Coming up" />
      <Stack gap={2}>
        {visible.map((o) => (
          <OccasionRow key={o.userId} occasion={o} />
        ))}
      </Stack>
    </section>
  );
};

const OccasionRow = ({ occasion }: { occasion: UpcomingOccasion }) => (
  <Card padding="md">
    <Flex justify="between" align="center" gap={3}>
      <Flex gap={3} align="center" className="min-w-0 flex-1">
        <img
          src={getUserImgSrc(occasion.imageId, { size: 64 })}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
        <Stack gap={0} className="min-w-0 flex-1">
          <Text size="sm" weight="medium" className="truncate">
            {occasion.name}
          </Text>
          <Text size="xs" className="text-muted-foreground">
            Birthday in {occasion.daysUntil}{' '}
            {occasion.daysUntil === 1 ? 'day' : 'days'}
          </Text>
        </Stack>
      </Flex>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link
          to={`/pools/new?groupId=${occasion.groupId}&recipientId=${occasion.userId}`}
        >
          Start a pool
        </Link>
      </Button>
    </Flex>
  </Card>
);

// ─── Past Gifts ──────────────────────────────────────────────────────────────

const PAST_GIFTS_LIMIT = 3;

const PastGiftsSection = ({ gifts }: { gifts: PastGift[] }) => {
  const [open, setOpen] = useState(false);

  if (gifts.length === 0) return null;

  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center gap-1 text-left"
      >
        <Text size="sm" weight="semibold" className="text-muted-foreground">
          Past gifts
        </Text>
        <Text size="xs" className="text-muted-foreground">
          ({gifts.length})
        </Text>
        {open ? (
          <LuChevronDown className="text-muted-foreground" size={14} />
        ) : (
          <LuChevronRight className="text-muted-foreground" size={14} />
        )}
      </button>
      {open && (
        <Stack gap={2}>
          {gifts.slice(0, PAST_GIFTS_LIMIT).map((gift) => (
            <PastGiftRow key={gift.id} gift={gift} />
          ))}
        </Stack>
      )}
    </section>
  );
};

const PastGiftRow = ({ gift }: { gift: PastGift }) => {
  const isCancelled = gift.status === 'CANCELLED';

  return (
    <Link to={`/pools/${gift.id}`} className="block">
      <Card padding="sm" className="transition-shadow hover:shadow-md">
        <Flex justify="between" align="center" gap={3}>
          <Stack gap={0} className="min-w-0 flex-1">
            <Flex gap={2} align="center" className="min-w-0">
              <Text
                size="sm"
                weight="medium"
                className="min-w-0 flex-1 truncate"
              >
                {gift.recipientName}
              </Text>
              <Text size="xs" className="shrink-0 text-muted-foreground">
                · {OCCASION_TYPE_LABELS[gift.occasionType as OccasionType]}
              </Text>
            </Flex>
            <Text size="xs" className="truncate text-muted-foreground">
              {isCancelled
                ? 'Cancelled'
                : (gift.chosenIdeaName ?? 'No gift chosen')}
            </Text>
          </Stack>
          {!isCancelled && gift.totalCents > 0 && (
            <Text
              size="xs"
              weight="medium"
              className="shrink-0 text-muted-foreground"
            >
              ${(gift.totalCents / 100).toFixed(0)}
            </Text>
          )}
        </Flex>
      </Card>
    </Link>
  );
};

// ─── Group Essentials ────────────────────────────────────────────────────────

const GroupEssentialsCard = ({
  giftGroupId,
  description,
  contributionCents,
  inviteLink,
  canInvite,
}: {
  giftGroupId: string;
  description: string | null;
  contributionCents: number;
  inviteLink: string | null;
  canInvite: boolean;
}) => {
  const createFetcher = useFetcher<typeof routeAction>();
  const [localInviteLink, setLocalInviteLink] = useState<string | null>(
    inviteLink,
  );
  const createInvitePending =
    createFetcher.state !== 'idle' &&
    createFetcher.formData?.get('intent') === 'create-invite-link';
  const resolvedInviteLink = localInviteLink ?? inviteLink;

  useEffect(() => {
    setLocalInviteLink(inviteLink);
  }, [inviteLink]);

  useEffect(() => {
    const url = (createFetcher.data as any)?.inviteUrl as string | undefined;
    if (createFetcher.state === 'idle' && url) {
      setLocalInviteLink(url);
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [createFetcher.state, createFetcher.data]);

  return (
    <Card padding="md">
      <Text size="sm" weight="semibold" className="text-muted-foreground">
        Group info
      </Text>
      <Stack gap={3} className="mt-3">
        {description && (
          <Text size="sm" className="break-words text-muted-foreground">
            {description}
          </Text>
        )}
        <Flex justify="between" align="center">
          <Stack gap={0}>
            <Text size="xs" className="text-muted-foreground">
              Your per-gift cap
            </Text>
            <InlineBudgetEditor
              giftGroupId={giftGroupId}
              initialCents={contributionCents}
            />
          </Stack>
        </Flex>
        <div>
          <Text as="div" size="xs" className="mb-1.5 text-muted-foreground">
            Invite link
          </Text>
          {resolvedInviteLink ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(resolvedInviteLink);
              }}
            >
              <Icon name="copy" className="mr-1.5" /> Copy invite link
            </Button>
          ) : canInvite ? (
            <createFetcher.Form method="post" action={`/groups/${giftGroupId}`}>
              <input type="hidden" name="giftGroupId" value={giftGroupId} />
              <input type="hidden" name="intent" value="create-invite-link" />
              <input type="hidden" name="expiresInDays" value="7" />
              <Button
                variant="outline"
                size="sm"
                disabled={createFetcher.state !== 'idle'}
              >
                <Icon name="link-2" className="mr-1.5" />
                {createInvitePending ? 'Creating...' : 'Create invite link'}
              </Button>
            </createFetcher.Form>
          ) : (
            <Text size="xs" className="text-muted-foreground">
              No active invite link. Ask an admin to create one.
            </Text>
          )}
        </div>
      </Stack>
    </Card>
  );
};

// ─── Shared ──────────────────────────────────────────────────────────────────

const SectionHeader = ({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) => (
  <Flex justify="between" align="center" className="mb-2">
    <Text size="sm" weight="semibold">
      {title}
    </Text>
    {trailing}
  </Flex>
);

// ─── Inline Budget Editor ────────────────────────────────────────────────────

const InlineBudgetEditor = ({
  giftGroupId,
  initialCents,
  editLabel = 'Edit your budget',
  amountTestId = 'budget-amount',
}: {
  giftGroupId: string;
  initialCents: number;
  editLabel?: string;
  amountTestId?: string;
}) => {
  const fetcher = useFetcher<typeof settingsAction>();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(initialCents);
  const pendingChangeRef = useRef<{ previous: number } | null>(null);
  const wasPendingRef = useRef(false);
  const dollars = (value / 100).toFixed(2);
  const pending = fetcher.state !== 'idle';

  useEffect(() => {
    if (!pendingChangeRef.current) {
      setValue(initialCents);
    }
  }, [initialCents]);

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      wasPendingRef.current = true;
      return;
    }
    if (!wasPendingRef.current) return;
    wasPendingRef.current = false;

    const status = (fetcher.data as { status?: string } | undefined)?.status;
    if (status === 'success') {
      pendingChangeRef.current = null;
      return;
    }

    if (pendingChangeRef.current) {
      setValue(pendingChangeRef.current.previous);
      pendingChangeRef.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  const submit = (next: number) => {
    const cents = Math.max(0, Math.round(next));
    pendingChangeRef.current = { previous: value };
    setValue(cents);
    const fd = new FormData();
    fd.set('intent', 'member-update-self');
    fd.set('giftGroupId', giftGroupId);
    fd.set('contributionCents', String(cents));
    Promise.resolve(
      fetcher.submit(fd, {
        method: 'post',
        action: `/groups/${giftGroupId}/settings`,
      }),
    ).catch(() => {});
    track('group_budget_saved', { groupId: giftGroupId });
  };

  const selectOnceRef = useRef(false);
  const handleFocusSelectAll = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!selectOnceRef.current) {
      e.currentTarget.select();
      selectOnceRef.current = true;
    }
  };
  const handleMouseUpPreserve = (e: React.MouseEvent<HTMLInputElement>) => {
    if (selectOnceRef.current) return;
    e.preventDefault();
  };

  if (!editing) {
    // Read mode — a single inline affordance on all sizes (no modal for a
    // single number; matches the PR 3 read→edit pattern).
    return (
      <div className="flex items-center gap-2">
        {value > 0 ? (
          <>
            <span
              className="text-base font-bold text-foreground"
              data-testid={amountTestId || undefined}
            >
              ${dollars}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={editLabel}
              onClick={() => setEditing(true)}
            >
              <Icon name="pencil-1" />
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setEditing(true)}>
            Set your budget
          </Button>
        )}
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action={`/groups/${giftGroupId}/settings`}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector(
          'input[name="dollars"]',
        ) as HTMLInputElement;
        const next = Math.max(
          0,
          Math.round(Number.parseFloat(input.value || '0') * 100),
        );
        submit(next);
        setEditing(false);
      }}
    >
      <input type="hidden" name="intent" value="member-update-self" />
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          name="dollars"
          defaultValue={dollars}
          inputMode="decimal"
          className="w-28 border-input bg-input-bg pl-5 text-foreground"
          aria-label="Your budget"
          onFocus={handleFocusSelectAll}
          onMouseUp={handleMouseUpPreserve}
          onBlur={(e) => {
            const v = Math.max(
              0,
              Number.parseFloat(e.currentTarget.value || '0'),
            );
            e.currentTarget.value = v.toFixed(2);
          }}
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setEditing(false)}
      >
        Cancel
      </Button>
    </fetcher.Form>
  );
};
