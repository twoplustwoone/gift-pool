import {
  json,
  type LoaderFunctionArgs,
  type MetaFunction,
} from '@remix-run/node';
import { Link, Outlet, useLoaderData, useSearchParams } from '@remix-run/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuCopy,
  LuHeart,
  LuLink,
  LuQrCode,
  LuTrash,
  LuUser,
} from 'react-icons/lu';
import { toast } from 'sonner';
import {
  FriendActionButton,
  type RelationshipSnapshot,
} from '#app/components/friends/friend-action-button.tsx';
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
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  listFriends,
} from '#app/utils/friends.server.ts';
import {
  FRIENDSHIP_UPDATED_EVENT,
  type FriendshipEventDetail,
} from '#app/utils/friendship-events.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(userId),
    getIncomingFriendRequests(userId),
    getOutgoingFriendRequests(userId),
  ]);

  return json({ friends, incoming, outgoing });
}

export const meta: MetaFunction<typeof loader> = () => {
  return [{ title: 'Friends | GiftPool' }];
};

const FriendsRoute = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { setUnreadCount } = useNotificationsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = (searchParams.get('tab') ?? 'friends').toLowerCase();
  const activeTab: 'add' | 'requests' | 'friends' =
    activeTabParam === 'add' || activeTabParam === 'requests'
      ? (activeTabParam as any)
      : 'friends';
  const initialQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [friendsFilter, setFriendsFilter] = useState('');
  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);
  useEffect(() => {
    const tId = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (q) next.set('q', q);
      else next.delete('q');
      next.set('tab', activeTab);
      setSearchParams(next, { preventScrollReset: true });
    }, 300);
    return () => clearTimeout(tId);
  }, [q, activeTab, searchParams, setSearchParams]);

  type FriendEntry = (typeof data.friends)[number];
  type IncomingEntry = (typeof data.incoming)[number];
  type OutgoingEntry = (typeof data.outgoing)[number];

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
  const [mutuals, setMutuals] = useState<
    Record<
      string,
      { groups: Array<{ id: string; name: string }>; more: number }
    >
  >({});

  const anySelected =
    (incomingSelectMode && selectedIncoming.size > 0) ||
    (outgoingSelectMode && selectedOutgoing.size > 0);

  const resetSelection = () => {
    setIncomingSelectMode(false);
    setOutgoingSelectMode(false);
    setSelectedIncoming(new Set());
    setSelectedOutgoing(new Set());
  };

  async function batchAccept(ids: string[]) {
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/friends/requests/${id}/accept`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        }).then(async (r) => ({
          ok: r.ok,
          json: r.ok ? await r.json() : null,
        })),
      ),
    );
    let unread: number | null = null;
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value.ok) {
        const j = res.value.json as any;
        if (typeof j?.unreadCount === 'number') unread = j.unreadCount;
      }
    });
    if (unread != null) setUnreadCount(unread);
    setIncomingState((prev) => prev.filter((r) => !ids.includes(r.id)));
    toast.success(
      `Accepted ${ids.length} request${ids.length > 1 ? 's' : ''}.`,
    );
  }

  async function batchDecline(ids: string[]) {
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/friends/requests/${id}/reject`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        }).then(async (r) => ({
          ok: r.ok,
          json: r.ok ? await r.json() : null,
        })),
      ),
    );
    let unread: number | null = null;
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value.ok) {
        const j = res.value.json as any;
        if (typeof j?.unreadCount === 'number') unread = j.unreadCount;
      }
    });
    if (unread != null) setUnreadCount(unread);
    setIncomingState((prev) => prev.filter((r) => !ids.includes(r.id)));
    toast.success(
      `Declined ${ids.length} request${ids.length > 1 ? 's' : ''}.`,
    );
  }

  async function batchCancel(ids: string[]) {
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/friends/requests/${id}/cancel`, {
          method: 'POST',
          credentials: 'same-origin',
        }),
      ),
    );
    setOutgoingState((prev) => prev.filter((r) => !ids.includes(r.id)));
    toast.success(
      `Cancelled ${ids.length} request${ids.length > 1 ? 's' : ''}.`,
    );
  }

  // Keep local state in sync when loader data changes (e.g., after accepting an invite)
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
    setFriendsState((prev) => {
      if (prev.some((item) => item.user.id === entry.user.id)) {
        return prev;
      }
      return [...prev, entry];
    });
  }, []);

  const handleIncomingTransition = useCallback(
    (requestId: string, user: IncomingEntry['fromUser']) =>
      (snapshot: RelationshipSnapshot) => {
        if (snapshot.state === 'FRIENDS') {
          setIncomingState((prev) =>
            prev.filter((req) => req.id !== requestId),
          );
          addFriendEntry({
            friendshipId: snapshot.friendshipId ?? requestId,
            createdAt: new Date().toISOString(),
            user,
          });
          return;
        }
        if (snapshot.state === 'NONE') {
          setIncomingState((prev) =>
            prev.filter((req) => req.id !== requestId),
          );
          return;
        }
        // For PENDING_INCOMING, do not mutate the list
      },
    [addFriendEntry],
  );

  const handleOutgoingTransition = useCallback(
    (requestId: string, user: OutgoingEntry['toUser']) =>
      (snapshot: RelationshipSnapshot) => {
        if (snapshot.state === 'FRIENDS') {
          setOutgoingState((prev) =>
            prev.filter((req) => req.id !== requestId),
          );
          addFriendEntry({
            friendshipId: snapshot.friendshipId ?? requestId,
            createdAt: new Date().toISOString(),
            user,
          });
          return;
        }
        if (snapshot.state === 'NONE') {
          setOutgoingState((prev) =>
            prev.filter((req) => req.id !== requestId),
          );
          return;
        }
        // For PENDING_OUTGOING, do not mutate the list
      },
    [addFriendEntry],
  );

  const handleFriendTransition = useCallback(
    (friendshipId: string, userId: string) =>
      (snapshot: RelationshipSnapshot) => {
        if (snapshot.state === 'NONE') {
          setFriendsState((prev) =>
            prev.filter((friend) => friend.user.id !== userId),
          );
        }
      },
    [],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FriendshipEventDetail>).detail;
      setIncomingState((prev) => {
        const match = prev.find((req) => req.fromUser.id === detail.userId);
        if (!match) return prev;
        if (detail.state === 'FRIENDS') {
          addFriendEntry({
            friendshipId: detail.friendshipId ?? match.id,
            createdAt: new Date().toISOString(),
            user: match.fromUser,
          });
        }
        return prev.filter((req) => req.id !== match.id);
      });
      setOutgoingState((prev) => {
        const match = prev.find((req) => req.toUser.id === detail.userId);
        if (!match) return prev;
        if (detail.state === 'FRIENDS') {
          addFriendEntry({
            friendshipId: detail.friendshipId ?? match.id,
            createdAt: new Date().toISOString(),
            user: match.toUser,
          });
          return prev.filter((req) => req.id !== match.id);
        }
        // Only remove the outgoing request if it is no longer pending
        if (detail.state === 'NONE') {
          return prev.filter((req) => req.id !== match.id);
        }
        return prev;
      });
      if (detail.state === 'NONE') {
        setFriendsState((prev) =>
          prev.filter((friend) => friend.user.id !== detail.userId),
        );
      }
      // Handle invite accept case: if we became friends and we don't have
      // an incoming/outgoing match, add using the provided user payload.
      if (detail.state === 'FRIENDS' && (detail as any).user) {
        setFriendsState((prev) => {
          const user = (detail as any).user as FriendEntry['user'];
          if (prev.some((f) => f.user.id === user.id)) return prev;
          return [
            {
              friendshipId: detail.friendshipId ?? crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              user,
            },
            ...prev,
          ];
        });
      }
    };
    window.addEventListener(FRIENDSHIP_UPDATED_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(
        FRIENDSHIP_UPDATED_EVENT,
        handler as EventListener,
      );
  }, [addFriendEntry]);

  // Removed debug logging

  return (
    <div className="container py-6 sm:py-8">
      {/* Mobile-only sticky header: segmented tabs + search */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:hidden">
        <div className="mx-auto max-w-3xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-center">
            <SegmentedTabs
              value={activeTab}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                next.set('tab', v);
                if (q) next.set('q', q);
                setSearchParams(next, { preventScrollReset: true });
              }}
            />
            {activeTab === 'friends' ? (
              <div className="sm:col-span-2">
                <Input
                  value={friendsFilter}
                  onChange={(e) => setFriendsFilter(e.currentTarget.value)}
                  placeholder={'Search friends'}
                  aria-label="Search"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

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
            onOutgoingCreated={(requestId, user) => {
              setOutgoingState((prev) => {
                if (
                  prev.some(
                    (r) => r.id === requestId || r.toUser.id === user.id,
                  )
                ) {
                  return prev;
                }
                const entry = {
                  id: requestId,
                  toUser: user,
                  status: 'PENDING',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                } as unknown as OutgoingEntry;
                return [entry, ...prev];
              });
            }}
          />
        </section>

        {/* Requests: visible on mobile when tab=requests; always visible on desktop */}
        <div
          className={cn(
            activeTab !== 'requests' ? 'hidden sm:block' : undefined,
          )}
        >
          {incomingState.length > 0 ? (
            <section id="incoming-requests">
              <h2 className="text-lg font-semibold">
                {t('friends.incomingRequests')}
              </h2>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {incomingSelectMode
                    ? `${selectedIncoming.size} selected`
                    : `${incomingState.length} pending`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIncomingSelectMode((v) => !v);
                      setSelectedIncoming(new Set());
                    }}
                  >
                    {incomingSelectMode ? 'Done' : 'Select'}
                  </Button>
                </div>
              </div>
              <ul className="mt-3 space-y-3">
                {incomingState.map((request) => {
                  const user = request.fromUser;
                  const username = user.username;
                  const selected = selectedIncoming.has(request.id);
                  return (
                    <li
                      key={request.id}
                      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      {incomingSelectMode ? (
                        <input
                          type="checkbox"
                          aria-label={`Select @${username}`}
                          checked={selected}
                          onChange={(e) => {
                            setSelectedIncoming((prev) => {
                              const next = new Set(prev);
                              if (e.currentTarget.checked) next.add(request.id);
                              else next.delete(request.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                      ) : null}
                      <Avatar size="s" image={user.image} user={user} />
                      <div className="flex-1 text-foreground">@{username}</div>
                      {incomingSelectMode ? null : (
                        <FriendActionButton
                          targetUserId={user.id}
                          targetUserName={`@${username}`}
                          relationship={{
                            state: 'PENDING_INCOMING',
                            friendshipId: null,
                            incomingRequestId: request.id,
                            outgoingRequestId: null,
                          }}
                          variant="compact"
                          onStateChange={handleIncomingTransition(
                            request.id,
                            user,
                          )}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {outgoingState.length > 0 ? (
            <section id="outgoing-requests">
              <h2 className="text-lg font-semibold">
                {t('friends.outgoingRequests')}
              </h2>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {outgoingSelectMode
                    ? `${selectedOutgoing.size} selected`
                    : `${outgoingState.length} pending`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOutgoingSelectMode((v) => !v);
                      setSelectedOutgoing(new Set());
                    }}
                  >
                    {outgoingSelectMode ? 'Done' : 'Select'}
                  </Button>
                </div>
              </div>
              <ul className="mt-3 space-y-3">
                {outgoingState.map((request) => {
                  const user = request.toUser;
                  const username = user.username;
                  const selected = selectedOutgoing.has(request.id);
                  return (
                    <li
                      key={request.id}
                      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      {outgoingSelectMode ? (
                        <input
                          type="checkbox"
                          aria-label={`Select @${username}`}
                          checked={selected}
                          onChange={(e) => {
                            setSelectedOutgoing((prev) => {
                              const next = new Set(prev);
                              if (e.currentTarget.checked) next.add(request.id);
                              else next.delete(request.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                      ) : null}
                      <Avatar size="s" image={user.image} user={user} />
                      <div className="flex-1 text-foreground">@{username}</div>
                      {outgoingSelectMode ? null : (
                        <FriendActionButton
                          targetUserId={user.id}
                          targetUserName={`@${username}`}
                          relationship={{
                            state: 'PENDING_OUTGOING',
                            friendshipId: null,
                            incomingRequestId: null,
                            outgoingRequestId: request.id,
                          }}
                          variant="compact"
                          onStateChange={handleOutgoingTransition(
                            request.id,
                            user,
                          )}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {anySelected ? (
            <div className="sticky bottom-0 z-10 mt-4 rounded-t-xl border border-border bg-card p-3 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {selectedIncoming.size + selectedOutgoing.size} selected
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedIncoming.size > 0 ? (
                    <>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const ids = Array.from(selectedIncoming);
                          await batchAccept(ids);
                          resetSelection();
                        }}
                      >
                        Accept ({selectedIncoming.size})
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const ids = Array.from(selectedIncoming);
                          await batchDecline(ids);
                          resetSelection();
                        }}
                      >
                        Decline ({selectedIncoming.size})
                      </Button>
                    </>
                  ) : null}
                  {selectedOutgoing.size > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const ids = Array.from(selectedOutgoing);
                        await batchCancel(ids);
                        resetSelection();
                      }}
                    >
                      Cancel ({selectedOutgoing.size})
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {incomingState.length === 0 && outgoingState.length === 0 ? (
            <EmptyState
              title="No requests"
              description="You don't have any incoming or outgoing requests."
            />
          ) : null}
        </div>

        {/* Friends: visible on mobile when tab=friends; always visible on desktop */}
        {friendsState.length > 0 ? (
          <section
            className={cn(
              activeTab !== 'friends' ? 'hidden sm:block' : undefined,
            )}
          >
            <h2 className="text-lg font-semibold">{t('friends.friends')}</h2>
            {(() => {
              const filtered = friendsState.filter((f) => {
                const term = friendsFilter.trim().toLowerCase();
                if (!term) return true;
                const u = f.user;
                return (
                  (u.name ?? '').toLowerCase().includes(term) ||
                  u.username.toLowerCase().includes(term)
                );
              });
              if (filtered.length > 40) {
                return (
                  <VirtualizedFriendsList
                    items={filtered}
                    rowHeight={72}
                    renderRow={(friend) => {
                      const user = friend.user;
                      const displayName = user.name ?? user.username;
                      const mu = mutuals[user.id];
                      const chips = mu ? mu.groups.slice(0, 2) : [];
                      return (
                        <SwipeableFriendRow
                          key={friend.friendshipId}
                          open={openSwipeId === friend.friendshipId}
                          onOpen={() => setOpenSwipeId(friend.friendshipId)}
                          onClose={() =>
                            setOpenSwipeId((id) =>
                              id === friend.friendshipId ? null : id,
                            )
                          }
                          onRemove={async () => {}}
                          rightActions={null}
                        >
                          <Avatar size="s" image={user.image} user={user} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">
                              {displayName}
                            </div>
                            <div className="truncate text-sm text-muted-foreground">
                              @{user.username}
                            </div>
                            {chips.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {chips.map((g) => (
                                  <span
                                    key={g.id}
                                    className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    {g.name}
                                  </span>
                                ))}
                                {mu && mu.more > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                                    +{mu.more}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              asChild
                              size="sm"
                              variant="default"
                              aria-label={t('friends.viewWishlist')}
                            >
                              <Link to={`/users/${user.username}/wishlist`}>
                                <LuHeart />
                                <span className="ml-2 hidden sm:inline">
                                  {t('friends.viewWishlist')}
                                </span>
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
                                <span className="ml-2 hidden sm:inline">
                                  {t('friends.viewProfile')}
                                </span>
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
                              onConfirm={async () => {
                                try {
                                  const res = await fetch(
                                    '/api/friends/remove',
                                    {
                                      method: 'POST',
                                      credentials: 'same-origin',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({ userId: user.id }),
                                    },
                                  );
                                  if (!res.ok) throw new Error('remove failed');
                                  setFriendsState((prev) =>
                                    prev.filter(
                                      (f) =>
                                        f.friendshipId !== friend.friendshipId,
                                    ),
                                  );
                                  toast.success(
                                    t('friends.removeSuccess', {
                                      name: displayName,
                                    }),
                                  );
                                } catch {
                                  toast.error(t('toasts.genericError'));
                                }
                              }}
                            >
                              <Button
                                size="sm"
                                variant="destructive"
                                aria-label={t('friends.remove')}
                              >
                                <LuTrash />
                                <span className="ml-2 hidden sm:inline">
                                  {t('friends.remove')}
                                </span>
                              </Button>
                            </ConfirmDialog>
                          </div>
                        </SwipeableFriendRow>
                      );
                    }}
                  />
                );
              }
              return (
                <ul className="mt-3 space-y-3">
                  {filtered.map((friend) => {
                    const user = friend.user;
                    const displayName = user.name ?? user.username;
                    const mu = mutuals[user.id];
                    const chips = mu ? mu.groups.slice(0, 2) : [];
                    return (
                      <SwipeableFriendRow
                        key={friend.friendshipId}
                        open={openSwipeId === friend.friendshipId}
                        onOpen={() => setOpenSwipeId(friend.friendshipId)}
                        onClose={() =>
                          setOpenSwipeId((id) =>
                            id === friend.friendshipId ? null : id,
                          )
                        }
                        onRemove={async () => {}}
                        rightActions={null}
                      >
                        <Avatar size="s" image={user.image} user={user} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {displayName}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            @{user.username}
                          </div>
                          {chips.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {chips.map((g) => (
                                <span
                                  key={g.id}
                                  className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  {g.name}
                                </span>
                              ))}
                              {mu && mu.more > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                                  +{mu.more}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            asChild
                            size="sm"
                            variant="default"
                            aria-label={t('friends.viewWishlist')}
                          >
                            <Link to={`/users/${user.username}/wishlist`}>
                              <LuHeart />
                              <span className="ml-2 hidden sm:inline">
                                {t('friends.viewWishlist')}
                              </span>
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
                              <span className="ml-2 hidden sm:inline">
                                {t('friends.viewProfile')}
                              </span>
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
                            onConfirm={async () => {
                              try {
                                const res = await fetch('/api/friends/remove', {
                                  method: 'POST',
                                  credentials: 'same-origin',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ userId: user.id }),
                                });
                                if (!res.ok) throw new Error('remove failed');
                                setFriendsState((prev) =>
                                  prev.filter(
                                    (f) =>
                                      f.friendshipId !== friend.friendshipId,
                                  ),
                                );
                                toast.success(
                                  t('friends.removeSuccess', {
                                    name: displayName,
                                  }),
                                );
                              } catch {
                                toast.error(t('toasts.genericError'));
                              }
                            }}
                          >
                            <Button
                              size="sm"
                              variant="destructive"
                              aria-label={t('friends.remove')}
                            >
                              <LuTrash />
                              <span className="ml-2 hidden sm:inline">
                                {t('friends.remove')}
                              </span>
                            </Button>
                          </ConfirmDialog>
                        </div>
                      </SwipeableFriendRow>
                    );
                  })}
                </ul>
              );
            })()}
          </section>
        ) : (
          <EmptyState
            title={t('friends.emptyTitle')}
            description={t('friends.emptyDescription')}
            action={
              <Button asChild variant="ghost">
                <Link to="/groups">{t('friends.emptyCta')}</Link>
              </Button>
            }
          />
        )}
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
  const items: Array<{ key: 'add' | 'requests' | 'friends'; label: string }> = [
    { key: 'add', label: 'Add' },
    { key: 'requests', label: 'Requests' },
    { key: 'friends', label: 'Friends' },
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
      image: { id: string; altText: string | null } | null;
    };
  }>;
  rowHeight?: number;
  renderRow: (item: any) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ height: 480, scrollTop: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport((v) => ({ ...v, height: el.clientHeight }));
    });
    ro.observe(el);
    const onScroll = () =>
      setViewport((v) => ({ ...v, scrollTop: el.scrollTop }));
    el.addEventListener('scroll', onScroll, { passive: true });
    // initialize
    setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });
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
      <div style={{ height: total, position: 'relative' }}>
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
  onRemove,
}: {
  children: React.ReactNode;
  rightActions: React.ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);
  const threshold = 48;
  return (
    <div className="relative">
      {/* Actions behind */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {rightActions}
      </div>
      {/* Foreground content */}
      <div
        className={cn(
          'relative z-10 rounded-xl border border-border bg-card p-4 shadow-sm transition-transform',
        )}
        style={{ transform: `translateX(${open ? -140 : 0}px)` }}
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
      image: { id: string; altText: string | null } | null;
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
  const [results, setResults] = useState<
    Array<{
      user: {
        id: string;
        username: string;
        name: string | null;
        image: { id: string; altText: string | null } | null;
      };
      relationship: RelationshipSnapshot;
    }>
  >([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestVersion = useRef(0);
  const [settledVersion, setSettledVersion] = useState(0);
  const loadingStartedAt = useRef<number | null>(null);
  const hideLoadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Simplified invite management for Add tab: we generate a fresh 24h link on mount

  // Debounced search
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    const q = query.trim();
    const timeout = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setIsLoading(false);
        setSettledVersion(version);
        return;
      }
      // Start loading and note the start time, clear any pending hide timers
      if (hideLoadingTimer.current) {
        clearTimeout(hideLoadingTimer.current);
        hideLoadingTimer.current = null;
      }
      loadingStartedAt.current = Date.now();
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          {
            credentials: 'same-origin',
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as {
          results: Array<{
            user: any;
            relationship: {
              state: string;
              friendship?: { id?: string | null } | null;
              incoming?: { id?: string | null } | null;
              outgoing?: { id?: string | null } | null;
            };
          }>;
        };
        const next = data.results.map((r) => ({
          user: r.user,
          relationship: {
            state: r.relationship.state as RelationshipSnapshot['state'],
            friendshipId: r.relationship.friendship?.id ?? null,
            incomingRequestId: r.relationship.incoming?.id ?? null,
            outgoingRequestId: r.relationship.outgoing?.id ?? null,
          },
        }));
        // Only apply if this is the latest request
        if (version === requestVersion.current) {
          setResults(next);
        }
      } catch {
        // ignore
      } finally {
        if (!controller.signal.aborted) {
          const MIN_SPINNER_MS = 300;
          const started = loadingStartedAt.current ?? Date.now();
          const elapsed = Date.now() - started;
          const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);
          if (remaining === 0) {
            setIsLoading(false);
            setSettledVersion(version);
          } else {
            hideLoadingTimer.current = setTimeout(() => {
              setIsLoading(false);
              setSettledVersion(version);
              hideLoadingTimer.current = null;
            }, remaining);
          }
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

  const createInvite = useCallback(async () => {
    const res = await fetch('/api/friends/invite', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { inviteUrl: string };
    setInviteUrl(data.inviteUrl);
    try {
      await navigator.clipboard.writeText(data.inviteUrl);
      toast.success('Friend invite link copied');
    } catch {}
  }, []);

  // Fetch current invite on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/friends/invite', {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { inviteUrl: string };
        setInviteUrl(data.inviteUrl);
      } catch {}
    })();
  }, []);

  // Rotate/disable removed in Add tab to simplify UX

  const shareInvite = useCallback(async () => {
    if (!inviteUrl) return;
    const shareData = {
      title: 'Add me on GiftPool',
      text: 'Let’s connect on GiftPool!',
      url: inviteUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Friend invite link copied');
    } catch {
      toast.error('Unable to copy link');
    }
  }, [inviteUrl]);

  const openQr = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      const mod: any = await import('qrcode');
      const url = await mod.toDataURL(inviteUrl, { margin: 1, scale: 6 });
      setQrDataUrl(url);
      setQrOpen(true);
    } catch {
      toast.error('Unable to generate QR code');
    }
  }, [inviteUrl]);

  const hasResults = useMemo(() => results.length > 0, [results.length]);
  const showEmpty = useMemo(
    () =>
      !isLoading &&
      query.trim().length >= 2 &&
      results.length === 0 &&
      settledVersion === requestVersion.current,
    [isLoading, query, results.length, settledVersion],
  );

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-sm font-medium">Search by username</div>
        <Input
          placeholder="e.g. alice"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        {isLoading ? (
          <div className="mt-3 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {!isLoading && hasResults ? (
          <div className="mt-3 max-h-64 overflow-y-auto pr-1 md:max-h-96">
            <ul className="space-y-3">
              {results.map(({ user, relationship }) => {
                const username = user.username;
                return (
                  <li
                    key={user.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-3 sm:flex-row sm:items-center"
                  >
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
                        onStateChange={(snapshot) => {
                          if (
                            snapshot.state === 'PENDING_OUTGOING' &&
                            snapshot.outgoingRequestId
                          ) {
                            onOutgoingCreated?.(
                              snapshot.outgoingRequestId,
                              user,
                            );
                          }
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : showEmpty ? (
          <div className="mt-3">
            <EmptyState
              title={`No users found for "${query.trim()}"`}
              description="Try a different username."
            />
          </div>
        ) : null}
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">Invite via link</div>
        {inviteUrl ? (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              aria-label="Friend invite link"
              value={inviteUrl}
              onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
              className="truncate"
            />
            <div className="flex w-full flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Copy invite link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    toast.success('Friend invite link copied');
                  } catch {
                    toast.error('Unable to copy link');
                  }
                }}
                className="min-w-[120px] flex-1 sm:flex-none"
              >
                <LuCopy />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void openQr()}
                className="min-w-[120px] flex-1 sm:flex-none"
              >
                <LuQrCode className="md:mr-2" />
                <Text size="sm" className="hidden md:block">
                  Show QR
                </Text>
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => void createInvite()} className="w-full">
            <LuLink className="mr-2" /> Create Friend Link
          </Button>
        )}
      </div>

      {/* QR Modal */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Friend Invite QR</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Friend invite QR"
                className="h-48 w-48"
              />
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
            <Button variant="secondary" onClick={() => setQrOpen(false)}>
              Close
            </Button>
            {inviteUrl ? (
              <Button
                onClick={async () => {
                  try {
                    if (!inviteUrl) return;
                    await navigator.clipboard.writeText(inviteUrl);
                    toast.success('Friend invite link copied');
                  } catch {
                    toast.error('Unable to copy link');
                  }
                }}
              >
                Copy Link
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate/Disable removed in Add tab */}
    </div>
  );
}

// invite metadata not shown in simplified Add tab UX
