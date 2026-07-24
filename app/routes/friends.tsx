import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuChevronDown,
  LuCopy,
  LuLink,
  LuPlus,
  LuQrCode,
  LuUsers,
} from 'react-icons/lu';
import {
  Outlet,
  useLoaderData,
  useSearchParams,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { toast } from 'sonner';
import { ComingUpSection } from '#app/components/friends/coming-up-section.tsx';
import {
  FriendActionButton,
  type RelationshipSnapshot,
} from '#app/components/friends/friend-action-button.tsx';
import { FriendRow as FriendRowCard } from '#app/components/friends/friend-row.tsx';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { PageShell } from '#app/components/page-shell.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { EmptyState } from '#app/components/ui/empty-state.tsx';
import { Input } from '#app/components/ui/input.tsx';
import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetDescription,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
} from '#app/components/ui/mobile-bottom-sheet.tsx';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { Skeleton } from '#app/components/ui/skeleton.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
import { useFriendWishlistPrefetch } from '#app/hooks/use-background-route-prefetch.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  COMING_UP_WINDOW_DAYS,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { loadFriendsPageData } from '#app/utils/friends-page.server.ts';
import {
  FRIENDSHIP_UPDATED_EVENT,
  type FriendshipEventDetail,
} from '#app/utils/friendship-events.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';
import { takePrefetchCache } from '#app/utils/prefetch-cache.client.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  return loadFriendsPageData(userId);
}

export async function clientLoader({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs) {
  const cached = takePrefetchCache<Awaited<ReturnType<typeof serverLoader>>>(
    request.url,
  );

  if (cached) return cached;

  return serverLoader();
}
export const meta: MetaFunction<typeof loader> = () => {
  return [
    {
      title: 'Friends | GiftPool',
    },
  ];
};

type FriendsLoaderData = Awaited<ReturnType<typeof loader>>;
type FriendEntry = FriendsLoaderData['friends'][number];
type IncomingEntry = FriendsLoaderData['incoming'][number];
type OutgoingEntry = FriendsLoaderData['outgoing'][number];
type SearchResult = {
  user: FriendEntry['user'];
  relationship: RelationshipSnapshot;
};
type RequestMutationAction = 'accept' | 'reject' | 'cancel';
type RequestMutationResponse = {
  ok: boolean;
  unreadCount: number | null;
};
type RequestListEntryUser = IncomingEntry['fromUser'] | OutgoingEntry['toUser'];
type FriendRequestRowProps = Readonly<{
  onStateChange: (snapshot: RelationshipSnapshot) => void;
  onToggleSelected: (requestId: string, selected: boolean) => void;
  relationship: RelationshipSnapshot;
  requestId: string;
  selected: boolean;
  selectMode: boolean;
  user: RequestListEntryUser;
}>;
type SearchResultRowProps = Readonly<{
  onOutgoingCreated?: (requestId: string, user: FriendEntry['user']) => void;
  result: SearchResult;
}>;
type SearchResultsPanelProps = Readonly<{
  hasResults: boolean;
  isLoading: boolean;
  onOutgoingCreated?: (requestId: string, user: FriendEntry['user']) => void;
  query: string;
  results: SearchResult[];
  showEmpty: boolean;
}>;
type InviteLinkPanelProps = Readonly<{
  inviteUrl: string | null;
  onCopy: () => void;
  onCreate: () => void;
  onOpenQr: () => void;
}>;
type InviteQrDialogProps = Readonly<{
  inviteUrl: string | null;
  onClose: () => void;
  onCopy: () => void;
  open: boolean;
  qrDataUrl: string | null;
}>;
type FriendsTab = 'add' | 'requests' | 'friends';
type FriendsListSectionProps = Readonly<{
  activeTab: FriendsTab;
  filteredFriends: FriendEntry[];
  friendsState: FriendEntry[];
  onRenderFriendRow: (friend: FriendEntry) => React.ReactNode;
  t: TranslateFn;
}>;
type UseFriendsRouteStateOptions = Readonly<{
  data: FriendsLoaderData;
  setUnreadCount: (count: number) => void;
}>;
type FriendsRouteState = ReturnType<typeof useFriendsRouteState>;

export function getActiveTab(searchParams: URLSearchParams): FriendsTab {
  const activeTabParam = (searchParams.get('tab') ?? 'friends').toLowerCase();
  return activeTabParam === 'add' || activeTabParam === 'requests'
    ? activeTabParam
    : 'friends';
}

export function addFriendIfMissing(friends: FriendEntry[], entry: FriendEntry) {
  if (friends.some((item) => item.user.id === entry.user.id)) {
    return friends;
  }
  return [...friends, entry];
}

export function buildFriendEntry(
  requestId: string,
  user: FriendEntry['user'],
  friendshipId?: string | null,
): FriendEntry {
  return {
    friendshipId: friendshipId ?? requestId,
    createdAt: new Date(),
    user: {
      ...user,
      // Optimistic entries come from a just-accepted friend request, so the
      // viewer is now a direct friend — NOBODY is the only visibility gate
      // that still applies. The pending-request payload carries
      // birthdayVisibility but not the server-computed birthdayVisible, so
      // derive it here (falling back to the legacy field) to stop a NOBODY
      // friend's birthday flashing in the list before the loader recomputes it.
      birthdayVisible:
        user.birthdayVisible ?? user.birthdayVisibility !== 'NOBODY',
    },
    // Optimistic entries (just-accepted friend requests) start without
    // mutual-groups data. The next loader run will fill them in.
    mutualGroups: [],
  };
}

export async function submitRequestMutation(
  id: string,
  action: RequestMutationAction,
): Promise<RequestMutationResponse> {
  const response = await fetch(`/api/friends/requests/${id}/${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    ...(action === 'cancel'
      ? {}
      : {
          headers: {
            Accept: 'application/json',
          },
        }),
  });

  if (!response.ok) {
    return { ok: false, unreadCount: null };
  }

  if (action === 'cancel') {
    return { ok: true, unreadCount: null };
  }

  const payload = (await response.json()) as { unreadCount?: number };
  return {
    ok: true,
    unreadCount:
      typeof payload.unreadCount === 'number' ? payload.unreadCount : null,
  };
}

export async function runBatchRequestMutation(
  ids: string[],
  action: RequestMutationAction,
) {
  const results = await Promise.allSettled(
    ids.map((id) => submitRequestMutation(id, action)),
  );
  let unreadCount: number | null = null;
  const failedIds: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      if (result.value.unreadCount != null) {
        unreadCount = result.value.unreadCount;
      }
      return;
    }

    failedIds.push(ids[index] ?? '');
  });

  return { failedIds, unreadCount };
}

export async function runOptimisticRequestBatch<
  TRequest extends { id: string },
>(
  ids: string[],
  action: RequestMutationAction,
  requests: TRequest[],
  setRequests: React.Dispatch<React.SetStateAction<TRequest[]>>,
  setUnreadCount?: (count: number) => void,
) {
  const snapshot = requests.filter((request) => ids.includes(request.id));
  setRequests((prev) => prev.filter((request) => !ids.includes(request.id)));

  const { failedIds, unreadCount } = await runBatchRequestMutation(ids, action);
  const messages = getRequestMutationMessages(action, ids.length);

  if (unreadCount != null) {
    setUnreadCount?.(unreadCount);
  }

  if (failedIds.length > 0) {
    const failed = snapshot.filter((request) => failedIds.includes(request.id));
    setRequests((prev) => [...failed, ...prev]);
    toast.error(messages.error);
    return;
  }

  toast.success(messages.success);
}

export function getRequestMutationMessages(
  action: RequestMutationAction,
  count: number,
) {
  if (action === 'accept') {
    return {
      error: 'Some requests could not be accepted.',
      success: `Accepted ${count} request${count > 1 ? 's' : ''}.`,
    };
  }

  if (action === 'reject') {
    return {
      error: 'Some requests could not be declined.',
      success: `Declined ${count} request${count > 1 ? 's' : ''}.`,
    };
  }

  return {
    error: 'Some requests could not be cancelled.',
    success: `Cancelled ${count} request${count > 1 ? 's' : ''}.`,
  };
}

export function filterFriends(friends: FriendEntry[], term: string) {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return friends;

  return friends.filter((friend) => {
    const user = friend.user;
    return (
      (user.name ?? '').toLowerCase().includes(normalizedTerm) ||
      user.username.toLowerCase().includes(normalizedTerm)
    );
  });
}

// Sort friends so the people you most need to think about gifting come
// first: anyone whose birthday is within COMING_UP_WINDOW_DAYS, ordered by
// soonest first; everyone else falls back to alphabetical by display
// name. Stable enough to look ordered, useful enough that the list
// surfaces something actionable above the fold.
//
// Proximity comes from the shared `getUpcomingBirthday`, which reads the
// stored date's UTC month/day. Birthdays are persisted at noon UTC so the
// calendar date is timezone-invariant; a local-time reading here would let
// this sort disagree by a day with the badge `friend-row.tsx` renders from
// the same helper.
export function sortFriendsByUpcomingBirthday(
  friends: FriendEntry[],
): FriendEntry[] {
  const withMeta = friends.map((friend) => ({
    friend,
    // Friends who hid their birthday sort as if they had none — the viewer
    // must not be able to infer a hidden date from list position.
    days:
      friend.user.birthdayVisible === false
        ? Number.POSITIVE_INFINITY
        : (getUpcomingBirthday(friend.user.birthday)?.daysUntil ??
          Number.POSITIVE_INFINITY),
    name: (friend.user.name ?? friend.user.username).toLowerCase(),
  }));
  withMeta.sort((a, b) => {
    const aSoon = a.days <= COMING_UP_WINDOW_DAYS;
    const bSoon = b.days <= COMING_UP_WINDOW_DAYS;
    if (aSoon && bSoon) return a.days - b.days || a.name.localeCompare(b.name);
    if (aSoon) return -1;
    if (bSoon) return 1;
    return a.name.localeCompare(b.name);
  });
  return withMeta.map((entry) => entry.friend);
}

// Alphabetical by display name, for the "A–Z" sort toggle.
export function sortFriendsByName(friends: FriendEntry[]): FriendEntry[] {
  return [...friends].sort((a, b) =>
    (a.user.name ?? a.user.username)
      .toLowerCase()
      .localeCompare((b.user.name ?? b.user.username).toLowerCase()),
  );
}

export function toggleSelection(
  set: Set<string>,
  id: string,
  selected: boolean,
) {
  const next = new Set(set);
  if (selected) next.add(id);
  else next.delete(id);
  return next;
}

export function applyIncomingRelationshipTransition(
  incoming: IncomingEntry[],
  requestId: string,
  snapshot: RelationshipSnapshot,
) {
  if (snapshot.state === 'FRIENDS' || snapshot.state === 'NONE') {
    return incoming.filter((request) => request.id !== requestId);
  }
  return incoming;
}

export function applyOutgoingRelationshipTransition(
  outgoing: OutgoingEntry[],
  requestId: string,
  snapshot: RelationshipSnapshot,
) {
  if (snapshot.state === 'FRIENDS' || snapshot.state === 'NONE') {
    return outgoing.filter((request) => request.id !== requestId);
  }
  return outgoing;
}

export function extractInviteUser(detail: FriendshipEventDetail) {
  return (detail as FriendshipEventDetail & { user?: FriendEntry['user'] })
    .user;
}

export function toRelationshipSnapshot(
  detail: Pick<
    FriendshipEventDetail,
    'state' | 'friendshipId' | 'incomingRequestId' | 'outgoingRequestId'
  >,
): RelationshipSnapshot {
  return {
    state: detail.state,
    friendshipId: detail.friendshipId ?? null,
    incomingRequestId: detail.incomingRequestId ?? null,
    outgoingRequestId: detail.outgoingRequestId ?? null,
  };
}

export function getMutualGroupChips(
  mutuals: Record<
    string,
    {
      groups: Array<{
        id: string;
        name: string;
      }>;
      more: number;
    }
  >,
  userId: string,
) {
  const mutualEntry = mutuals[userId];
  return {
    extraGroupCount: mutualEntry?.more ?? 0,
    mutualGroups: mutualEntry ? mutualEntry.groups.slice(0, 2) : [],
  };
}

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export type FriendsSort = 'birthday' | 'az';

// Segmented control for list order. Local state rather than a search param:
// `useFriendsSearchParams` owns the `tab`/`q` contract that the add-friend
// search shares with /api/users/search, and sort order isn't worth linking to.
function FriendsSortToggle({
  onSortChange,
  sort,
}: Readonly<{
  onSortChange: (next: FriendsSort) => void;
  sort: FriendsSort;
}>) {
  const options: Array<{ label: string; value: FriendsSort }> = [
    { label: 'By birthday', value: 'birthday' },
    { label: 'A–Z', value: 'az' },
  ];

  return (
    <div
      role="group"
      aria-label="Sort friends"
      className="inline-flex flex-none gap-0.5 rounded-full bg-muted p-1"
    >
      {options.map((option) => {
        const active = sort === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSortChange(option.value)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FriendRequestRow({
  onStateChange,
  onToggleSelected,
  relationship,
  requestId,
  selected,
  selectMode,
  user,
}: FriendRequestRowProps) {
  const username = user.username;

  return (
    <li className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {selectMode ? (
        <input
          type="checkbox"
          aria-label={`Select @${username}`}
          checked={selected}
          onChange={(event) =>
            onToggleSelected(requestId, event.currentTarget.checked)
          }
          className="h-4 w-4"
        />
      ) : null}
      <Avatar size="s" image={user.image} user={user} />
      <div className="flex-1 text-foreground">@{username}</div>
      {selectMode ? null : (
        <FriendActionButton
          targetUserId={user.id}
          targetUserName={`@${username}`}
          relationship={relationship}
          variant="compact"
          onStateChange={onStateChange}
        />
      )}
    </li>
  );
}

function SearchResultRow({ onOutgoingCreated, result }: SearchResultRowProps) {
  const { relationship, user } = result;
  const username = user.username;

  const handleStateChange = useCallback(
    (snapshot: RelationshipSnapshot) => {
      if (snapshot.state === 'PENDING_OUTGOING' && snapshot.outgoingRequestId) {
        onOutgoingCreated?.(snapshot.outgoingRequestId, user);
      }
    },
    [onOutgoingCreated, user],
  );

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <Avatar size="s" image={user.image} user={user} />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            @{username}
          </div>
        </div>
      </div>
      <div className="sm:ml-auto">
        <FriendActionButton
          targetUserId={user.id}
          targetUserName={`@${username}`}
          relationship={relationship}
          variant="compact"
          className="w-full sm:w-auto"
          onStateChange={handleStateChange}
        />
      </div>
    </li>
  );
}

function SearchResultsPanel({
  hasResults,
  isLoading,
  onOutgoingCreated,
  query,
  results,
  showEmpty,
}: SearchResultsPanelProps) {
  if (isLoading) {
    return (
      <div className="mt-3 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (hasResults) {
    return (
      <div className="mt-3 max-h-64 overflow-y-auto pr-1 md:max-h-96">
        <ul className="space-y-3">
          {results.map((result) => (
            <SearchResultRow
              key={result.user.id}
              result={result}
              onOutgoingCreated={onOutgoingCreated}
            />
          ))}
        </ul>
      </div>
    );
  }

  if (showEmpty) {
    return (
      <div className="mt-3">
        <EmptyState
          title={`No users found for "${query.trim()}"`}
          description="Try a different username."
        />
      </div>
    );
  }

  return null;
}

function InviteLinkPanel({
  inviteUrl,
  onCopy,
  onCreate,
  onOpenQr,
}: InviteLinkPanelProps) {
  if (!inviteUrl) {
    return (
      <Button onClick={onCreate} className="w-full">
        <LuLink className="mr-2 h-4 w-4" aria-hidden /> Create invite link
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        readOnly
        aria-label="Friend invite link"
        value={inviteUrl}
        onClick={(event) => event.currentTarget.select()}
        className="font-mono text-xs"
      />
      <div className="flex w-full items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label="Copy invite link"
          onClick={onCopy}
          className="flex-1"
        >
          <LuCopy className="mr-2 h-4 w-4" aria-hidden />
          Copy link
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-label="Show QR code"
          onClick={onOpenQr}
          className="flex-1"
        >
          <LuQrCode className="mr-2 h-4 w-4" aria-hidden />
          Show QR
        </Button>
      </div>
    </div>
  );
}

function InviteQrDialog({
  inviteUrl,
  onClose,
  onCopy,
  open,
  qrDataUrl,
}: InviteQrDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Friend Invite QR</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Friend invite QR" className="h-48 w-48" />
          ) : (
            <Skeleton className="h-48 w-48" />
          )}
          {inviteUrl ? (
            <div className="max-w-full break-all text-center text-xs text-muted-foreground">
              {inviteUrl}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {inviteUrl ? <Button onClick={onCopy}>Copy Link</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function mapSearchResults(
  results: Array<{
    relationship: {
      friendship?: { id?: string | null } | null;
      incoming?: { id?: string | null } | null;
      outgoing?: { id?: string | null } | null;
      state: string;
    };
    user: FriendEntry['user'];
  }>,
): SearchResult[] {
  return results.map((result) => ({
    user: result.user,
    relationship: {
      state: result.relationship.state as RelationshipSnapshot['state'],
      friendshipId: result.relationship.friendship?.id ?? null,
      incomingRequestId: result.relationship.incoming?.id ?? null,
      outgoingRequestId: result.relationship.outgoing?.id ?? null,
    },
  }));
}

export function createOutgoingEntry(
  requestId: string,
  user: FriendEntry['user'],
): OutgoingEntry {
  return {
    id: requestId,
    toUser: user,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as OutgoingEntry;
}

export function syncIncomingForFriendshipEvent(
  detail: FriendshipEventDetail,
  addFriendEntry: (entry: FriendEntry) => void,
  setIncomingState: React.Dispatch<React.SetStateAction<IncomingEntry[]>>,
) {
  setIncomingState((prev) => {
    const match = prev.find((request) => request.fromUser.id === detail.userId);
    if (!match) return prev;
    if (detail.state === 'FRIENDS') {
      addFriendEntry(
        buildFriendEntry(match.id, match.fromUser, detail.friendshipId),
      );
    }
    return applyIncomingRelationshipTransition(
      prev,
      match.id,
      toRelationshipSnapshot(detail),
    );
  });
}

export function syncOutgoingForFriendshipEvent(
  detail: FriendshipEventDetail,
  addFriendEntry: (entry: FriendEntry) => void,
  setOutgoingState: React.Dispatch<React.SetStateAction<OutgoingEntry[]>>,
) {
  setOutgoingState((prev) => {
    const match = prev.find((request) => request.toUser.id === detail.userId);
    if (!match) return prev;
    if (detail.state === 'FRIENDS') {
      addFriendEntry(
        buildFriendEntry(match.id, match.toUser, detail.friendshipId),
      );
    }
    return applyOutgoingRelationshipTransition(
      prev,
      match.id,
      toRelationshipSnapshot(detail),
    );
  });
}

export function syncFriendsForFriendshipEvent(
  detail: FriendshipEventDetail,
  setFriendsState: React.Dispatch<React.SetStateAction<FriendEntry[]>>,
) {
  if (detail.state === 'NONE') {
    setFriendsState((prev) =>
      prev.filter((friend) => friend.user.id !== detail.userId),
    );
  }

  const inviteUser = extractInviteUser(detail);
  if (detail.state !== 'FRIENDS' || !inviteUser) {
    return;
  }

  setFriendsState((prev) =>
    addFriendIfMissing(
      prev,
      buildFriendEntry(crypto.randomUUID(), inviteUser, detail.friendshipId),
    ),
  );
}

function useFriendsSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getActiveTab(searchParams);
  const initialQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (q) next.set('q', q);
      else next.delete('q');
      next.set('tab', activeTab);
      setSearchParams(next, {
        preventScrollReset: true,
      });
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [activeTab, q, searchParams, setSearchParams]);

  const handleTabChange = useCallback(
    (value: FriendsTab) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', value);
      if (q) next.set('q', q);
      setSearchParams(next, {
        preventScrollReset: true,
      });
    },
    [q, searchParams, setSearchParams],
  );

  return {
    activeTab,
    q,
    setQ,
    searchParams,
    handleTabChange,
  };
}

function useFriendsRouteState({
  data,
  setUnreadCount: _setUnreadCount,
}: UseFriendsRouteStateOptions) {
  const [friendsState, setFriendsState] = useState<FriendEntry[]>(data.friends);
  const [incomingState, setIncomingState] = useState<IncomingEntry[]>(
    data.incoming,
  );
  const [outgoingState, setOutgoingState] = useState<OutgoingEntry[]>(
    data.outgoing,
  );

  useEffect(() => {
    setFriendsState(data.friends);
  }, [data.friends]);
  useEffect(() => {
    setIncomingState(data.incoming);
  }, [data.incoming]);
  useEffect(() => {
    setOutgoingState(data.outgoing);
  }, [data.outgoing]);

  const addFriendEntry = useCallback((entry: FriendEntry) => {
    setFriendsState((prev) => addFriendIfMissing(prev, entry));
  }, []);

  const handleIncomingTransition = useCallback(
    (requestId: string, user: IncomingEntry['fromUser']) =>
      (snapshot: RelationshipSnapshot) => {
        if (snapshot.state === 'FRIENDS') {
          addFriendEntry(
            buildFriendEntry(requestId, user, snapshot.friendshipId),
          );
        }
        setIncomingState((prev) =>
          applyIncomingRelationshipTransition(prev, requestId, snapshot),
        );
      },
    [addFriendEntry],
  );
  const handleOutgoingTransition = useCallback(
    (requestId: string, user: OutgoingEntry['toUser']) =>
      (snapshot: RelationshipSnapshot) => {
        if (snapshot.state === 'FRIENDS') {
          addFriendEntry(
            buildFriendEntry(requestId, user, snapshot.friendshipId),
          );
        }
        setOutgoingState((prev) =>
          applyOutgoingRelationshipTransition(prev, requestId, snapshot),
        );
      },
    [addFriendEntry],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FriendshipEventDetail>).detail;
      syncIncomingForFriendshipEvent(detail, addFriendEntry, setIncomingState);
      syncOutgoingForFriendshipEvent(detail, addFriendEntry, setOutgoingState);
      syncFriendsForFriendshipEvent(detail, setFriendsState);
    };

    window.addEventListener(FRIENDSHIP_UPDATED_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(
        FRIENDSHIP_UPDATED_EVENT,
        handler as EventListener,
      );
  }, [addFriendEntry]);

  return {
    friendsState,
    handleIncomingTransition,
    handleOutgoingTransition,
    incomingState,
    outgoingState,
    setFriendsState,
    setOutgoingState,
  };
}

function FriendsListSection({
  activeTab,
  filteredFriends,
  friendsState,
  onRenderFriendRow,
  t,
}: FriendsListSectionProps) {
  if (friendsState.length === 0) {
    return (
      <EmptyState
        title={t('friends.emptyTitle')}
        description={t('friends.emptyDescription')}
        action={
          // Opens the Add friend dialog directly — the old "Browse groups"
          // CTA was circular for new users, whose groups page is empty too.
          <Button
            onClick={() =>
              window.dispatchEvent(new Event('friends:add-friend-open'))
            }
          >
            {t('friends.emptyCta')}
          </Button>
        }
      />
    );
  }

  return (
    <section
      className={cn(activeTab !== 'friends' ? 'hidden sm:block' : undefined)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('friends.friends')}
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {filteredFriends.length}
        </span>
      </div>
      {filteredFriends.length === 0 ? (
        <EmptyState
          title="No friends match your search"
          description="Try a different name or @username."
        />
      ) : (
        /* Dense single column on mobile, card grid from the 768px
         * breakpoint up. */
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {filteredFriends.map((friend) => onRenderFriendRow(friend))}
        </ul>
      )}
    </section>
  );
}

function useFriendSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestVersion = useRef(0);
  const [settledVersion, setSettledVersion] = useState(0);
  const loadingStartedAt = useRef<number | null>(null);
  const hideLoadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    const trimmedQuery = query.trim();

    const timeout = setTimeout(async () => {
      if (trimmedQuery.length < 2) {
        setResults([]);
        setIsLoading(false);
        setSettledVersion(version);
        return;
      }

      if (hideLoadingTimer.current) {
        clearTimeout(hideLoadingTimer.current);
        hideLoadingTimer.current = null;
      }
      loadingStartedAt.current = Date.now();
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmedQuery)}`,
          {
            credentials: 'same-origin',
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error('search failed');
        const payload = (await response.json()) as {
          results: Array<{
            relationship: {
              friendship?: { id?: string | null } | null;
              incoming?: { id?: string | null } | null;
              outgoing?: { id?: string | null } | null;
              state: string;
            };
            user: FriendEntry['user'];
          }>;
        };

        if (version === requestVersion.current) {
          setResults(mapSearchResults(payload.results));
        }
      } catch {
        // ignore
      } finally {
        if (controller.signal.aborted) return;

        const minSpinnerMs = 300;
        const started = loadingStartedAt.current ?? Date.now();
        const remaining = Math.max(0, minSpinnerMs - (Date.now() - started));

        const finalize = () => {
          setIsLoading(false);
          setSettledVersion(version);
          hideLoadingTimer.current = null;
        };

        if (remaining === 0) {
          finalize();
        } else {
          hideLoadingTimer.current = setTimeout(finalize, remaining);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timeout);
      controller.abort();
      if (hideLoadingTimer.current) {
        clearTimeout(hideLoadingTimer.current);
        hideLoadingTimer.current = null;
      }
    };
  }, [query]);

  const hasResults = results.length > 0;
  const showEmpty =
    !isLoading &&
    query.trim().length >= 2 &&
    !hasResults &&
    settledVersion === requestVersion.current;

  return { hasResults, isLoading, results, showEmpty };
}

function useInviteLinkController() {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const copyInviteLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Friend invite link copied');
    } catch {
      toast.error('Unable to copy link');
    }
  }, []);

  const loadInvite = useCallback(async () => {
    const response = await fetch('/api/friends/invite', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { inviteUrl: string };
    setInviteUrl(payload.inviteUrl);
    return payload.inviteUrl;
  }, []);

  const createInvite = useCallback(async () => {
    const nextInviteUrl = await loadInvite();
    if (!nextInviteUrl) return;
    await copyInviteLink(nextInviteUrl);
  }, [copyInviteLink, loadInvite]);

  const openQr = useCallback(async () => {
    if (!inviteUrl) return;

    try {
      const qrCodeModule: {
        toDataURL: (
          value: string,
          options: { margin: number; scale: number },
        ) => Promise<string>;
      } = await import('qrcode');
      const dataUrl = await qrCodeModule.toDataURL(inviteUrl, {
        margin: 1,
        scale: 6,
      });
      setQrDataUrl(dataUrl);
      setQrOpen(true);
    } catch {
      toast.error('Unable to generate QR code');
    }
  }, [inviteUrl]);

  useEffect(() => {
    loadInvite().catch(() => {});
  }, [loadInvite]);

  return {
    closeQr: () => setQrOpen(false),
    createInvite,
    copyInviteLink,
    inviteUrl,
    openQr,
    qrDataUrl,
    qrOpen,
  };
}
// Combined incoming + outgoing pending requests in a single card. Replaces
// the previous IncomingRequestSection + OutgoingRequestSection split which
// each had its own multi-select mode and dedicated header.
function PendingRequestsCard({
  incomingState,
  outgoingState,
  onIncomingTransition,
  onOutgoingTransition,
}: Readonly<{
  incomingState: IncomingEntry[];
  outgoingState: OutgoingEntry[];
  onIncomingTransition: (
    requestId: string,
    user: IncomingEntry['fromUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
  onOutgoingTransition: (
    requestId: string,
    user: OutgoingEntry['toUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
}>) {
  const total = incomingState.length + outgoingState.length;
  const [open, setOpen] = useState(false);
  const hasIncoming = incomingState.length > 0;

  // Incoming requests are the actionable case, so their arrival opens the
  // section — on mount and again whenever one shows up later via the
  // optimistic FRIENDSHIP_UPDATED_EVENT wiring, which a `useState(...)`
  // initialiser alone would miss.
  //
  // Deliberately one-way: never auto-collapse. Deriving `open` from
  // `hasIncoming` instead would snap the section shut the moment you accept
  // the last incoming request, yanking the "Sent" list you were reading out
  // from under you. Collapsing stays a user action.
  useEffect(() => {
    if (hasIncoming) setOpen(true);
  }, [hasIncoming]);

  if (total === 0) return null;

  return (
    <section
      id="pending-requests"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="pending-requests-body"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
          {total}
        </span>
        <h2 className="text-base font-semibold">Friend requests</h2>
        <LuChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="pending-requests-body" className="px-4 pb-4">
          {incomingState.length > 0 ? (
            <ul className="space-y-2">
              {incomingState.map((request) => (
                <FriendRequestRow
                  key={request.id}
                  requestId={request.id}
                  user={request.fromUser}
                  relationship={{
                    state: 'PENDING_INCOMING',
                    friendshipId: null,
                    incomingRequestId: request.id,
                    outgoingRequestId: null,
                  }}
                  selected={false}
                  selectMode={false}
                  onToggleSelected={() => {}}
                  onStateChange={onIncomingTransition(
                    request.id,
                    request.fromUser,
                  )}
                />
              ))}
            </ul>
          ) : null}

          {outgoingState.length > 0 ? (
            <>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                Sent
              </h3>
              <ul className="space-y-2">
                {outgoingState.map((request) => (
                  <FriendRequestRow
                    key={request.id}
                    requestId={request.id}
                    user={request.toUser}
                    relationship={{
                      state: 'PENDING_OUTGOING',
                      friendshipId: null,
                      incomingRequestId: null,
                      outgoingRequestId: request.id,
                    }}
                    selected={false}
                    selectMode={false}
                    onToggleSelected={() => {}}
                    onStateChange={onOutgoingTransition(
                      request.id,
                      request.toUser,
                    )}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// "Add friend" primary button + responsive sheet wrapper. Uses
// MobileBottomSheet so the surface renders as a bottom sheet on mobile
// (matching the wishlist editor pattern) and as a centered dialog on
// desktop. Replaces the always-expanded AddFriendsPanel section that
// lived at the top of the page.
function AddFriendDialog({
  q,
  setQ,
  onOutgoingCreated,
}: Readonly<{
  q: string;
  setQ: (next: string) => void;
  onOutgoingCreated: (requestId: string, user: FriendEntry['user']) => void;
}>) {
  const [open, setOpen] = useState(false);
  // Lets the empty state (and anything else) open this dialog without
  // prop-drilling — same pattern as the notification bell's
  // 'notifications:open' event.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('friends:add-friend-open', handler);
    return () => window.removeEventListener('friends:add-friend-open', handler);
  }, []);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <LuPlus className="mr-2 h-4 w-4" aria-hidden />
        Add friend
      </Button>
      <MobileBottomSheet open={open} onOpenChange={setOpen}>
        <MobileBottomSheetContent className="sm:max-w-md">
          <MobileBottomSheetHeader>
            <MobileBottomSheetTitle>Add a friend</MobileBottomSheetTitle>
            <MobileBottomSheetDescription>
              Search by username or share an invite link.
            </MobileBottomSheetDescription>
          </MobileBottomSheetHeader>
          <AddFriendsPanel
            query={q}
            onQueryChange={setQ}
            onOutgoingCreated={(requestId, user) => {
              onOutgoingCreated(requestId, user);
              setOpen(false);
            }}
          />
        </MobileBottomSheetContent>
      </MobileBottomSheet>
    </>
  );
}

const FriendsRoute = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { setUnreadCount } = useNotificationsStore();
  useFriendWishlistPrefetch(data.friends.map((friend) => friend.user.username));
  const { q, setQ } = useFriendsSearchParams();
  const [friendsFilter, setFriendsFilter] = useState('');
  const {
    friendsState,
    handleIncomingTransition,
    handleOutgoingTransition,
    incomingState,
    outgoingState,
    setFriendsState,
    setOutgoingState,
  }: FriendsRouteState = useFriendsRouteState({
    data,
    setUnreadCount,
  });
  const [sort, setSort] = useState<FriendsSort>('birthday');
  const filteredFriends = useMemo(() => {
    const matching = filterFriends(friendsState, friendsFilter);
    return sort === 'az'
      ? sortFriendsByName(matching)
      : sortFriendsByUpcomingBirthday(matching);
  }, [friendsFilter, friendsState, sort]);
  // While the viewer is filtering, the pinned sections above the list are
  // noise between them and their results — collapse the page down to the
  // matches.
  const isFiltering = friendsFilter.trim().length > 0;
  const handleRemoveFriend = useCallback(
    async (friend: FriendEntry) => {
      const displayName = friend.user.name ?? friend.user.username;
      try {
        const response = await fetch('/api/friends/remove', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: friend.user.id,
          }),
        });
        if (!response.ok) {
          throw new Error('remove failed');
        }
        setFriendsState((prev) =>
          prev.filter((entry) => entry.friendshipId !== friend.friendshipId),
        );
        toast.success(
          t('friends.removeSuccess', {
            name: displayName,
          }),
        );
      } catch {
        toast.error(t('toasts.genericError'));
      }
    },
    [setFriendsState, t],
  );
  const renderFriendRow = useCallback(
    (friend: FriendEntry) => {
      const displayName = friend.user.name ?? friend.user.username;
      return (
        <li key={friend.friendshipId}>
          <FriendRowCard
            friend={friend}
            displayName={displayName}
            onRemove={() => handleRemoveFriend(friend)}
          />
        </li>
      );
    },
    [handleRemoveFriend],
  );
  const handleOutgoingCreated = useCallback(
    (requestId: string, user: FriendEntry['user']) => {
      setOutgoingState((prev) => {
        if (
          prev.some(
            (request) =>
              request.id === requestId || request.toUser.id === user.id,
          )
        ) {
          return prev;
        }
        return [createOutgoingEntry(requestId, user), ...prev];
      });
    },
    [setOutgoingState],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="section"
        icon={<LuUsers className="text-primary" />}
        title="Friends"
      >
        <AddFriendDialog
          q={q}
          setQ={setQ}
          onOutgoingCreated={handleOutgoingCreated}
        />
      </PageHeader>

      <PageShell className="min-h-0 flex-1 py-6 sm:py-8">
        <Stack gap={4}>
          {isFiltering ? null : (
            <>
              <PendingRequestsCard
                incomingState={incomingState}
                outgoingState={outgoingState}
                onIncomingTransition={handleIncomingTransition}
                onOutgoingTransition={handleOutgoingTransition}
              />

              <ComingUpSection friends={friendsState} />
            </>
          )}

          {friendsState.length > 8 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={friendsFilter}
                onChange={(event) => setFriendsFilter(event.currentTarget.value)}
                placeholder="Search friends"
                aria-label="Search friends"
                className="sm:flex-1"
              />
              <FriendsSortToggle sort={sort} onSortChange={setSort} />
            </div>
          ) : null}

          <FriendsListSection
            activeTab="friends"
            filteredFriends={filteredFriends}
            friendsState={friendsState}
            onRenderFriendRow={renderFriendRow}
            t={t}
          />
        </Stack>
        {/* Nested routes (e.g., /friends/accept/:code) render here */}
        <Outlet />
      </PageShell>
    </div>
  );
};
export default FriendsRoute;
function AddFriendsPanel({
  onOutgoingCreated,
  query: controlledQuery,
  onQueryChange,
}: {
  onOutgoingCreated?: (requestId: string, user: FriendEntry['user']) => void;
  query?: string;
  onQueryChange?: (q: string) => void;
}) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState('');
  const query = controlledQuery ?? uncontrolledQuery;
  const setQuery = useCallback(
    (v: string) => {
      if (typeof controlledQuery === 'string') onQueryChange?.(v);
      else setUncontrolledQuery(v);
    },
    [controlledQuery, onQueryChange],
  );
  const { hasResults, isLoading, results, showEmpty } = useFriendSearch(query);
  const {
    closeQr,
    createInvite,
    copyInviteLink,
    inviteUrl,
    openQr,
    qrDataUrl,
    qrOpen,
  } = useInviteLinkController();
  const handleCopyInviteLink = useCallback(async () => {
    if (!inviteUrl) return;
    await copyInviteLink(inviteUrl);
  }, [copyInviteLink, inviteUrl]);
  const handleOpenQr = useCallback(() => {
    openQr().catch(() => {});
  }, [openQr]);
  const handleCreateInvite = useCallback(() => {
    createInvite().catch(() => {});
  }, [createInvite]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="friend-username-search">
          Search by username
        </label>
        <Input
          id="friend-username-search"
          placeholder="e.g. alice"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoFocus
        />
        <SearchResultsPanel
          query={query}
          results={results}
          isLoading={isLoading}
          hasResults={hasResults}
          showEmpty={showEmpty}
          onOutgoingCreated={onOutgoingCreated}
        />
      </div>

      {/* Divider with "or" label so the two add-friend modes feel
       * deliberately separated rather than competing for the same row. */}
      <div
        className="relative flex items-center"
        role="separator"
        aria-orientation="horizontal"
      >
        <div className="flex-1 border-t border-border" />
        <span className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          or
        </span>
        <div className="flex-1 border-t border-border" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Invite via link</div>
        <p className="text-xs text-muted-foreground">
          Share this link or QR code with anyone you want to add.
        </p>
        <InviteLinkPanel
          inviteUrl={inviteUrl}
          onCopy={handleCopyInviteLink}
          onCreate={handleCreateInvite}
          onOpenQr={handleOpenQr}
        />
      </div>

      <InviteQrDialog
        open={qrOpen}
        qrDataUrl={qrDataUrl}
        inviteUrl={inviteUrl}
        onClose={closeQr}
        onCopy={() => {
          handleCopyInviteLink().catch(() => {});
        }}
      />
    </div>
  );
}

// invite metadata not shown in simplified Add tab UX
