import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuCopy,
  LuHeart,
  LuLink,
  LuQrCode,
  LuTrash,
  LuUser,
} from 'react-icons/lu';
import { Link, Outlet, useLoaderData, useSearchParams,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction } from 'react-router';
import { toast } from 'sonner';
import {
  FriendActionButton,
  type RelationshipSnapshot,
} from '#app/components/friends/friend-action-button.tsx';
import { FriendSummary } from '#app/components/friends/friend-summary.tsx';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { EmptyState } from '#app/components/ui/empty-state.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Skeleton } from '#app/components/ui/skeleton.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { useFriendWishlistPrefetch } from '#app/hooks/use-background-route-prefetch.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
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
type IncomingRequestSectionProps = Readonly<{
  incoming: IncomingEntry[];
  isSelectMode: boolean;
  onStateChange: (
    requestId: string,
    user: IncomingEntry['fromUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
  onToggleMode: () => void;
  onToggleSelected: (requestId: string, selected: boolean) => void;
  selectedIncoming: Set<string>;
  t: TranslateFn;
}>;
type OutgoingRequestSectionProps = Readonly<{
  isSelectMode: boolean;
  onStateChange: (
    requestId: string,
    user: OutgoingEntry['toUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
  onToggleMode: () => void;
  onToggleSelected: (requestId: string, selected: boolean) => void;
  outgoing: OutgoingEntry[];
  selectedOutgoing: Set<string>;
  t: TranslateFn;
}>;
type RequestSelectionBarProps = Readonly<{
  onAccept: () => void;
  onCancel: () => void;
  onDecline: () => void;
  selectedIncoming: Set<string>;
  selectedOutgoing: Set<string>;
}>;
type FriendRowActionsProps = Readonly<{
  displayName: string;
  friend: FriendEntry;
  onRemove: (friend: FriendEntry) => Promise<void>;
  t: TranslateFn;
}>;
type FriendRowProps = Readonly<{
  friend: FriendEntry;
  mutuals: Record<
    string,
    {
      groups: Array<{
        id: string;
        name: string;
      }>;
      more: number;
    }
  >;
  onClose: () => void;
  onOpen: () => void;
  onRemove: (friend: FriendEntry) => Promise<void>;
  open: boolean;
  t: TranslateFn;
}>;
type SearchResultRowProps = Readonly<{
  onOutgoingCreated?: (
    requestId: string,
    user: FriendEntry['user'],
  ) => void;
  result: SearchResult;
}>;
type SearchResultsPanelProps = Readonly<{
  hasResults: boolean;
  isLoading: boolean;
  onOutgoingCreated?: (
    requestId: string,
    user: FriendEntry['user'],
  ) => void;
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
type FriendsMobileHeaderProps = Readonly<{
  activeTab: FriendsTab;
  friendsFilter: string;
  onFriendsFilterChange: (value: string) => void;
  onTabChange: (value: FriendsTab) => void;
}>;
type FriendsRequestsPanelProps = Readonly<{
  acceptSelectedIncoming: () => Promise<void>;
  anySelected: boolean;
  cancelSelectedOutgoing: () => Promise<void>;
  declineSelectedIncoming: () => Promise<void>;
  incomingSelectMode: boolean;
  incomingState: IncomingEntry[];
  onHandleIncomingSelection: (requestId: string, selected: boolean) => void;
  onHandleOutgoingSelection: (requestId: string, selected: boolean) => void;
  onHandleIncomingTransition: (
    requestId: string,
    user: IncomingEntry['fromUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
  onHandleOutgoingTransition: (
    requestId: string,
    user: OutgoingEntry['toUser'],
  ) => (snapshot: RelationshipSnapshot) => void;
  onToggleIncomingSelectMode: () => void;
  onToggleOutgoingSelectMode: () => void;
  outgoingSelectMode: boolean;
  outgoingState: OutgoingEntry[];
  selectedIncoming: Set<string>;
  selectedOutgoing: Set<string>;
  t: TranslateFn;
}>;
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

function getActiveTab(searchParams: URLSearchParams): FriendsTab {
  const activeTabParam = (searchParams.get('tab') ?? 'friends').toLowerCase();
  return activeTabParam === 'add' || activeTabParam === 'requests'
    ? activeTabParam
    : 'friends';
}

function addFriendIfMissing(
  friends: FriendEntry[],
  entry: FriendEntry,
) {
  if (friends.some((item) => item.user.id === entry.user.id)) {
    return friends;
  }
  return [...friends, entry];
}

function buildFriendEntry(
  requestId: string,
  user: FriendEntry['user'],
  friendshipId?: string | null,
): FriendEntry {
  return {
    friendshipId: friendshipId ?? requestId,
    createdAt: new Date(),
    user,
  };
}

async function submitRequestMutation(
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

async function runBatchRequestMutation(
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

async function runOptimisticRequestBatch<TRequest extends { id: string }>(
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

function getRequestMutationMessages(
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

function filterFriends(
  friends: FriendEntry[],
  term: string,
) {
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

function toggleSelection(set: Set<string>, id: string, selected: boolean) {
  const next = new Set(set);
  if (selected) next.add(id);
  else next.delete(id);
  return next;
}

function applyIncomingRelationshipTransition(
  incoming: IncomingEntry[],
  requestId: string,
  snapshot: RelationshipSnapshot,
) {
  if (snapshot.state === 'FRIENDS' || snapshot.state === 'NONE') {
    return incoming.filter((request) => request.id !== requestId);
  }
  return incoming;
}

function applyOutgoingRelationshipTransition(
  outgoing: OutgoingEntry[],
  requestId: string,
  snapshot: RelationshipSnapshot,
) {
  if (snapshot.state === 'FRIENDS' || snapshot.state === 'NONE') {
    return outgoing.filter((request) => request.id !== requestId);
  }
  return outgoing;
}

function extractInviteUser(detail: FriendshipEventDetail) {
  return (detail as FriendshipEventDetail & { user?: FriendEntry['user'] }).user;
}

function toRelationshipSnapshot(
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

function getMutualGroupChips(
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
    <li
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
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

function IncomingRequestSection({
  incoming,
  isSelectMode,
  onStateChange,
  onToggleMode,
  onToggleSelected,
  selectedIncoming,
  t,
}: IncomingRequestSectionProps) {
  if (incoming.length === 0) return null;

  return (
    <section id="incoming-requests">
      <h2 className="text-lg font-semibold">{t('friends.incomingRequests')}</h2>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {isSelectMode
            ? `${selectedIncoming.size} selected`
            : `${incoming.length} pending`}
        </div>
        <Button size="sm" variant="ghost" onClick={onToggleMode}>
          {isSelectMode ? 'Done' : 'Select'}
        </Button>
      </div>
      <ul className="mt-3 space-y-3">
        {incoming.map((request) => {
          const user = request.fromUser;
          const selected = selectedIncoming.has(request.id);
          return (
            <FriendRequestRow
              key={request.id}
              user={user}
              requestId={request.id}
              selected={selected}
              selectMode={isSelectMode}
              onToggleSelected={onToggleSelected}
              relationship={{
                state: 'PENDING_INCOMING',
                friendshipId: null,
                incomingRequestId: request.id,
                outgoingRequestId: null,
              }}
              onStateChange={onStateChange(request.id, user)}
            />
          );
        })}
      </ul>
    </section>
  );
}

function OutgoingRequestSection({
  isSelectMode,
  onStateChange,
  onToggleMode,
  onToggleSelected,
  outgoing,
  selectedOutgoing,
  t,
}: OutgoingRequestSectionProps) {
  if (outgoing.length === 0) return null;

  return (
    <section id="outgoing-requests">
      <h2 className="text-lg font-semibold">{t('friends.outgoingRequests')}</h2>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {isSelectMode
            ? `${selectedOutgoing.size} selected`
            : `${outgoing.length} pending`}
        </div>
        <Button size="sm" variant="ghost" onClick={onToggleMode}>
          {isSelectMode ? 'Done' : 'Select'}
        </Button>
      </div>
      <ul className="mt-3 space-y-3">
        {outgoing.map((request) => {
          const user = request.toUser;
          const selected = selectedOutgoing.has(request.id);
          return (
            <FriendRequestRow
              key={request.id}
              user={user}
              requestId={request.id}
              selected={selected}
              selectMode={isSelectMode}
              onToggleSelected={onToggleSelected}
              relationship={{
                state: 'PENDING_OUTGOING',
                friendshipId: null,
                incomingRequestId: null,
                outgoingRequestId: request.id,
              }}
              onStateChange={onStateChange(request.id, user)}
            />
          );
        })}
      </ul>
    </section>
  );
}

function RequestSelectionBar({
  onAccept,
  onCancel,
  onDecline,
  selectedIncoming,
  selectedOutgoing,
}: RequestSelectionBarProps) {
  const totalSelected = selectedIncoming.size + selectedOutgoing.size;
  if (totalSelected === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 mt-4 rounded-t-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{totalSelected} selected</div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIncoming.size > 0 ? (
            <>
              <Button size="sm" onClick={onAccept}>
                Accept ({selectedIncoming.size})
              </Button>
              <Button size="sm" variant="secondary" onClick={onDecline}>
                Decline ({selectedIncoming.size})
              </Button>
            </>
          ) : null}
          {selectedOutgoing.size > 0 ? (
            <Button size="sm" variant="secondary" onClick={onCancel}>
              Cancel ({selectedOutgoing.size})
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FriendRowActions({
  displayName,
  friend,
  onRemove,
  t,
}: FriendRowActionsProps) {
  const user = friend.user;

  return (
    <div className="flex items-center gap-2">
      <Button
        asChild
        size="sm"
        variant="default"
        aria-label={t('friends.viewWishlist')}
      >
        <Link to={`/users/${user.username}/wishlist`}>
          <LuHeart />
          <span className="ml-2 hidden sm:inline">{t('friends.viewWishlist')}</span>
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="secondary"
        aria-label={t('friends.viewProfile')}
      >
        <Link to={`/users/${user.username}`}>
          <LuUser />
          <span className="ml-2 hidden sm:inline">{t('friends.viewProfile')}</span>
        </Link>
      </Button>
      <ConfirmDialog
        title={t('friends.removeConfirmTitle')}
        description={
          <p className="text-sm text-muted-foreground">
            {t('friends.removeConfirmDescription', {
              name: displayName,
            })}
          </p>
        }
        confirmText={t('friends.removeConfirmConfirm')}
        onConfirm={() => onRemove(friend)}
      >
        <Button size="sm" variant="destructive" aria-label={t('friends.remove')}>
          <LuTrash />
          <span className="ml-2 hidden sm:inline">{t('friends.remove')}</span>
        </Button>
      </ConfirmDialog>
    </div>
  );
}

function FriendRow({
  friend,
  mutuals,
  onClose,
  onOpen,
  onRemove,
  open,
  t,
}: FriendRowProps) {
  const user = friend.user;
  const displayName = user.name ?? user.username;
  const chips = getMutualGroupChips(mutuals, user.id);

  return (
    <SwipeableFriendRow
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      rightActions={null}
    >
      <FriendSummary
        user={user}
        displayName={displayName}
        mutualGroups={chips.mutualGroups}
        extraGroupCount={chips.extraGroupCount}
      />
      <FriendRowActions
        displayName={displayName}
        friend={friend}
        onRemove={onRemove}
        t={t}
      />
    </SwipeableFriendRow>
  );
}

function SearchResultRow({
  onOutgoingCreated,
  result,
}: SearchResultRowProps) {
  const { relationship, user } = result;
  const username = user.username;

  const handleStateChange = useCallback(
    (snapshot: RelationshipSnapshot) => {
      if (
        snapshot.state === 'PENDING_OUTGOING' &&
        snapshot.outgoingRequestId
      ) {
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
          <div className="truncate font-medium text-foreground">@{username}</div>
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
        <LuLink className="mr-2" /> Create Friend Link
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        readOnly
        aria-label="Friend invite link"
        value={inviteUrl}
        onClick={(event) => event.currentTarget.select()}
        className="truncate"
      />
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Copy invite link"
          onClick={onCopy}
          className="min-w-[120px] flex-1 sm:flex-none"
        >
          <LuCopy />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenQr}
          className="min-w-[120px] flex-1 sm:flex-none"
        >
          <LuQrCode className="md:mr-2" />
          <Text size="sm" className="hidden md:block">
            Show QR
          </Text>
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

function mapSearchResults(
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

function createOutgoingEntry(
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

function syncIncomingForFriendshipEvent(
  detail: FriendshipEventDetail,
  addFriendEntry: (entry: FriendEntry) => void,
  setIncomingState: React.Dispatch<React.SetStateAction<IncomingEntry[]>>,
) {
  setIncomingState((prev) => {
    const match = prev.find((request) => request.fromUser.id === detail.userId);
    if (!match) return prev;
    if (detail.state === 'FRIENDS') {
      addFriendEntry(buildFriendEntry(match.id, match.fromUser, detail.friendshipId));
    }
    return applyIncomingRelationshipTransition(
      prev,
      match.id,
      toRelationshipSnapshot(detail),
    );
  });
}

function syncOutgoingForFriendshipEvent(
  detail: FriendshipEventDetail,
  addFriendEntry: (entry: FriendEntry) => void,
  setOutgoingState: React.Dispatch<React.SetStateAction<OutgoingEntry[]>>,
) {
  setOutgoingState((prev) => {
    const match = prev.find((request) => request.toUser.id === detail.userId);
    if (!match) return prev;
    if (detail.state === 'FRIENDS') {
      addFriendEntry(buildFriendEntry(match.id, match.toUser, detail.friendshipId));
    }
    return applyOutgoingRelationshipTransition(
      prev,
      match.id,
      toRelationshipSnapshot(detail),
    );
  });
}

function syncFriendsForFriendshipEvent(
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
  setUnreadCount,
}: UseFriendsRouteStateOptions) {
  const [friendsState, setFriendsState] = useState<FriendEntry[]>(data.friends);
  const [incomingState, setIncomingState] = useState<IncomingEntry[]>(
    data.incoming,
  );
  const [outgoingState, setOutgoingState] = useState<OutgoingEntry[]>(
    data.outgoing,
  );
  const [incomingSelectMode, setIncomingSelectMode] = useState(false);
  const [outgoingSelectMode, setOutgoingSelectMode] = useState(false);
  const [selectedIncoming, setSelectedIncoming] = useState<Set<string>>(
    new Set(),
  );
  const [selectedOutgoing, setSelectedOutgoing] = useState<Set<string>>(
    new Set(),
  );
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [mutuals] = useState<
    Record<
      string,
      {
        groups: Array<{
          id: string;
          name: string;
        }>;
        more: number;
      }
    >
  >({});

  const anySelected =
    (incomingSelectMode && selectedIncoming.size > 0) ||
    (outgoingSelectMode && selectedOutgoing.size > 0);

  const resetSelection = useCallback(() => {
    setIncomingSelectMode(false);
    setOutgoingSelectMode(false);
    setSelectedIncoming(new Set());
    setSelectedOutgoing(new Set());
  }, []);

  const batchAccept = useCallback(
    async (ids: string[]) => {
      await runOptimisticRequestBatch(
        ids,
        'accept',
        incomingState,
        setIncomingState,
        setUnreadCount,
      );
    },
    [incomingState, setUnreadCount],
  );
  const batchDecline = useCallback(
    async (ids: string[]) => {
      await runOptimisticRequestBatch(
        ids,
        'reject',
        incomingState,
        setIncomingState,
        setUnreadCount,
      );
    },
    [incomingState, setUnreadCount],
  );
  const batchCancel = useCallback(
    async (ids: string[]) => {
      await runOptimisticRequestBatch(
        ids,
        'cancel',
        outgoingState,
        setOutgoingState,
      );
    },
    [outgoingState],
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
          addFriendEntry(buildFriendEntry(requestId, user, snapshot.friendshipId));
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
          addFriendEntry(buildFriendEntry(requestId, user, snapshot.friendshipId));
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

  const toggleIncomingSelectMode = useCallback(() => {
    setIncomingSelectMode((value) => !value);
    setSelectedIncoming(new Set());
  }, []);
  const toggleOutgoingSelectMode = useCallback(() => {
    setOutgoingSelectMode((value) => !value);
    setSelectedOutgoing(new Set());
  }, []);
  const handleIncomingSelection = useCallback(
    (requestId: string, selected: boolean) => {
      setSelectedIncoming((prev) => toggleSelection(prev, requestId, selected));
    },
    [],
  );
  const handleOutgoingSelection = useCallback(
    (requestId: string, selected: boolean) => {
      setSelectedOutgoing((prev) => toggleSelection(prev, requestId, selected));
    },
    [],
  );
  const acceptSelectedIncoming = useCallback(async () => {
    await batchAccept(Array.from(selectedIncoming));
    resetSelection();
  }, [batchAccept, resetSelection, selectedIncoming]);
  const declineSelectedIncoming = useCallback(async () => {
    await batchDecline(Array.from(selectedIncoming));
    resetSelection();
  }, [batchDecline, resetSelection, selectedIncoming]);
  const cancelSelectedOutgoing = useCallback(async () => {
    await batchCancel(Array.from(selectedOutgoing));
    resetSelection();
  }, [batchCancel, resetSelection, selectedOutgoing]);

  return {
    acceptSelectedIncoming,
    addFriendEntry,
    anySelected,
    cancelSelectedOutgoing,
    declineSelectedIncoming,
    friendsState,
    handleIncomingSelection,
    handleIncomingTransition,
    handleOutgoingSelection,
    handleOutgoingTransition,
    incomingSelectMode,
    incomingState,
    mutuals,
    openSwipeId,
    outgoingSelectMode,
    outgoingState,
    selectedIncoming,
    selectedOutgoing,
    setFriendsState,
    setOpenSwipeId,
    setOutgoingState,
    toggleIncomingSelectMode,
    toggleOutgoingSelectMode,
  };
}

function FriendsMobileHeader({
  activeTab,
  friendsFilter,
  onFriendsFilterChange,
  onTabChange,
}: FriendsMobileHeaderProps) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:hidden">
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-center">
          <SegmentedTabs value={activeTab} onChange={onTabChange} />
          {activeTab === 'friends' ? (
            <div className="sm:col-span-2">
              <Input
                value={friendsFilter}
                onChange={(event) => onFriendsFilterChange(event.currentTarget.value)}
                placeholder="Search friends"
                aria-label="Search"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FriendsRequestsPanel({
  acceptSelectedIncoming,
  anySelected,
  cancelSelectedOutgoing,
  declineSelectedIncoming,
  incomingSelectMode,
  incomingState,
  onHandleIncomingSelection,
  onHandleOutgoingSelection,
  onHandleIncomingTransition,
  onHandleOutgoingTransition,
  onToggleIncomingSelectMode,
  onToggleOutgoingSelectMode,
  outgoingSelectMode,
  outgoingState,
  selectedIncoming,
  selectedOutgoing,
  t,
}: FriendsRequestsPanelProps) {
  return (
    <>
      {incomingState.length > 0 ? (
        <IncomingRequestSection
          incoming={incomingState}
          isSelectMode={incomingSelectMode}
          onStateChange={onHandleIncomingTransition}
          onToggleMode={onToggleIncomingSelectMode}
          onToggleSelected={onHandleIncomingSelection}
          selectedIncoming={selectedIncoming}
          t={t}
        />
      ) : null}

      {outgoingState.length > 0 ? (
        <OutgoingRequestSection
          isSelectMode={outgoingSelectMode}
          onStateChange={onHandleOutgoingTransition}
          onToggleMode={onToggleOutgoingSelectMode}
          onToggleSelected={onHandleOutgoingSelection}
          outgoing={outgoingState}
          selectedOutgoing={selectedOutgoing}
          t={t}
        />
      ) : null}

      {anySelected ? (
        <RequestSelectionBar
          onAccept={acceptSelectedIncoming}
          onCancel={cancelSelectedOutgoing}
          onDecline={declineSelectedIncoming}
          selectedIncoming={selectedIncoming}
          selectedOutgoing={selectedOutgoing}
        />
      ) : null}

      {incomingState.length === 0 && outgoingState.length === 0 ? (
        <EmptyState
          title="No requests"
          description="You don't have any incoming or outgoing requests."
        />
      ) : null}
    </>
  );
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
          <Button asChild variant="ghost">
            <Link to="/groups">{t('friends.emptyCta')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section
      className={cn(activeTab !== 'friends' ? 'hidden sm:block' : undefined)}
    >
      <h2 className="text-lg font-semibold">{t('friends.friends')}</h2>
      {filteredFriends.length > 40 ? (
        <VirtualizedFriendsList
          items={filteredFriends}
          rowHeight={72}
          renderRow={onRenderFriendRow}
        />
      ) : (
        <ul className="mt-3 space-y-3">
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
      const qrCodeModule: { toDataURL: (value: string, options: { margin: number; scale: number }) => Promise<string> } =
        await import('qrcode');
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
const FriendsRoute = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { setUnreadCount } = useNotificationsStore();
  useFriendWishlistPrefetch(data.friends.map((friend) => friend.user.username));
  const { activeTab, handleTabChange, q, setQ } = useFriendsSearchParams();
  const [friendsFilter, setFriendsFilter] = useState('');
  const {
    acceptSelectedIncoming,
    anySelected,
    cancelSelectedOutgoing,
    declineSelectedIncoming,
    friendsState,
    handleIncomingSelection,
    handleIncomingTransition,
    handleOutgoingSelection,
    handleOutgoingTransition,
    incomingSelectMode,
    incomingState,
    mutuals,
    openSwipeId,
    outgoingSelectMode,
    outgoingState,
    selectedIncoming,
    selectedOutgoing,
    setFriendsState,
    setOpenSwipeId,
    setOutgoingState,
    toggleIncomingSelectMode,
    toggleOutgoingSelectMode,
  }: FriendsRouteState = useFriendsRouteState({
    data,
    setUnreadCount,
  });
  const filteredFriends = useMemo(
    () => filterFriends(friendsState, friendsFilter),
    [friendsFilter, friendsState],
  );
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
    (friend: FriendEntry) => (
      <FriendRow
        key={friend.friendshipId}
        friend={friend}
        mutuals={mutuals}
        onClose={() =>
          setOpenSwipeId((id) => (id === friend.friendshipId ? null : id))
        }
        onOpen={() => setOpenSwipeId(friend.friendshipId)}
        onRemove={handleRemoveFriend}
        open={openSwipeId === friend.friendshipId}
        t={t}
      />
    ),
    [handleRemoveFriend, mutuals, openSwipeId, setOpenSwipeId, t],
  );
  const handleOutgoingCreated = useCallback(
    (requestId: string, user: FriendEntry['user']) => {
      setOutgoingState((prev) => {
        if (prev.some((request) => request.id === requestId || request.toUser.id === user.id)) {
          return prev;
        }
        return [createOutgoingEntry(requestId, user), ...prev];
      });
    },
    [setOutgoingState],
  );

  return (
    <div className="container py-6 sm:py-8">
      <FriendsMobileHeader
        activeTab={activeTab}
        friendsFilter={friendsFilter}
        onFriendsFilterChange={setFriendsFilter}
        onTabChange={handleTabChange}
      />

      <Stack gap={4}>
        {/* Add panel: visible on mobile when tab=add; always visible on desktop */}
        <section
          className={cn(
            'rounded-xl border border-border bg-card p-4 shadow-sm',
            activeTab !== 'add' ? 'hidden sm:block' : undefined,
          )}
        >
          <h2 className="text-lg font-semibold">Add friends</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search by username or share an invite link.
          </p>
          <AddFriendsPanel
            query={q}
            onQueryChange={setQ}
            onOutgoingCreated={handleOutgoingCreated}
          />
        </section>

        {/* Requests: visible on mobile when tab=requests; always visible on desktop */}
        <div
          className={cn(
            activeTab !== 'requests' ? 'hidden sm:block' : undefined,
          )}
        >
          <FriendsRequestsPanel
            acceptSelectedIncoming={acceptSelectedIncoming}
            anySelected={anySelected}
            cancelSelectedOutgoing={cancelSelectedOutgoing}
            declineSelectedIncoming={declineSelectedIncoming}
            incomingSelectMode={incomingSelectMode}
            incomingState={incomingState}
            onHandleIncomingSelection={handleIncomingSelection}
            onHandleOutgoingSelection={handleOutgoingSelection}
            onHandleIncomingTransition={handleIncomingTransition}
            onHandleOutgoingTransition={handleOutgoingTransition}
            onToggleIncomingSelectMode={toggleIncomingSelectMode}
            onToggleOutgoingSelectMode={toggleOutgoingSelectMode}
            outgoingSelectMode={outgoingSelectMode}
            outgoingState={outgoingState}
            selectedIncoming={selectedIncoming}
            selectedOutgoing={selectedOutgoing}
            t={t}
          />
        </div>

        {/* Friends: visible on mobile when tab=friends; always visible on desktop */}
        <FriendsListSection
          activeTab={activeTab}
          filteredFriends={filteredFriends}
          friendsState={friendsState}
          onRenderFriendRow={renderFriendRow}
          t={t}
        />
      </Stack>
      {/* Nested routes (e.g., /friends/accept/:code) render here */}
      <Outlet />
    </div>
  );
};
export default FriendsRoute;
function SegmentedTabs({
  value,
  onChange,
}: {
  value: 'add' | 'requests' | 'friends';
  onChange: (v: 'add' | 'requests' | 'friends') => void;
}) {
  const items: Array<{
    key: 'add' | 'requests' | 'friends';
    label: string;
  }> = [
    {
      key: 'add',
      label: 'Add',
    },
    {
      key: 'requests',
      label: 'Requests',
    },
    {
      key: 'friends',
      label: 'Friends',
    },
  ];
  return (
    <div className="grid grid-cols-3 rounded-full bg-muted p-1">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={cn(
            'rounded-full px-4 py-1.5 text-center text-sm font-medium text-muted-foreground transition',
            value === it.key && 'bg-background text-foreground shadow',
          )}
          aria-current={value === it.key ? 'page' : undefined}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
function VirtualizedFriendsList({
  items,
  rowHeight = 72,
  renderRow,
}: {
  items: Array<{
    friendshipId: string;
    user: {
      id: string;
      username: string;
      name: string | null;
      image: {
        id: string;
        altText: string | null;
      } | null;
    };
  }>;
  rowHeight?: number;
  renderRow: (item: any) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({
    height: 480,
    scrollTop: 0,
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport((v) => ({
        ...v,
        height: el.clientHeight,
      }));
    });
    ro.observe(el);
    const onScroll = () =>
      setViewport((v) => ({
        ...v,
        scrollTop: el.scrollTop,
      }));
    el.addEventListener('scroll', onScroll, {
      passive: true,
    });
    // initialize
    setViewport({
      height: el.clientHeight,
      scrollTop: el.scrollTop,
    });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);
  const total = items.length * rowHeight;
  const overscan = 8;
  const start = Math.max(
    0,
    Math.floor(viewport.scrollTop / rowHeight) - overscan,
  );
  const end = Math.min(
    items.length,
    Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + overscan,
  );
  const slice = items.slice(start, end);
  return (
    <div ref={containerRef} className="mt-3 h-[60vh] overflow-auto sm:h-[70vh]">
      <div
        style={{
          height: total,
          position: 'relative',
        }}
      >
        {slice.map((item, i) => {
          const index = start + i;
          const top = index * rowHeight;
          return (
            <div
              key={item.friendshipId}
              style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function SwipeableFriendRow({
  children,
  rightActions,
  open,
  onOpen,
  onClose,
}: {
  children: React.ReactNode;
  rightActions: React.ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);
  const threshold = 48;
  return (
    <div className="relative" data-testid="friend-row">
      {/* Actions behind */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {rightActions}
      </div>
      {/* Foreground content */}
      <div
        className={cn(
          'relative rounded-xl border border-border bg-card p-4 shadow-sm transition-transform',
        )}
        style={{
          transform: `translateX(${open ? -140 : 0}px)`,
        }}
        onTouchStart={(e) => {
          const touch = e.touches?.[0];
          if (!touch) return;
          startX.current = touch.clientX;
          deltaX.current = 0;
        }}
        onTouchMove={(e) => {
          if (startX.current == null) return;
          const touch = e.touches?.[0];
          if (!touch) return;
          deltaX.current = touch.clientX - startX.current;
        }}
        onTouchEnd={() => {
          if (deltaX.current < -threshold) onOpen();
          else if (deltaX.current > threshold) onClose();
          startX.current = null;
          deltaX.current = 0;
        }}
      >
        <div className="pointer-events-auto flex items-center gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}
function AddFriendsPanel({
  onOutgoingCreated,
  query: controlledQuery,
  onQueryChange,
}: {
  onOutgoingCreated?: (
    requestId: string,
    user: {
      id: string;
      username: string;
      name: string | null;
      image: {
        id: string;
        altText: string | null;
      } | null;
    },
  ) => void;
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
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-sm font-medium">Search by username</div>
        <Input
          placeholder="e.g. alice"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
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
      <div>
        <div className="mb-2 text-sm font-medium">Invite via link</div>
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
