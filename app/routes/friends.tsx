import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useState } from 'react';
import {
  FriendActionButton,
  type RelationshipSnapshot,
} from '#app/components/friends/friend-action-button.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { EmptyState } from '#app/components/ui/empty-state.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
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
        setIncomingState((prev) => prev.filter((req) => req.id !== requestId));
        if (snapshot.state === 'FRIENDS') {
          addFriendEntry({
            friendshipId: snapshot.friendshipId ?? requestId,
            createdAt: new Date().toISOString(),
            user,
          });
        }
      },
    [addFriendEntry],
  );

  const handleOutgoingTransition = useCallback(
    (requestId: string, user: OutgoingEntry['toUser']) =>
      (snapshot: RelationshipSnapshot) => {
        setOutgoingState((prev) => prev.filter((req) => req.id !== requestId));
        if (snapshot.state === 'FRIENDS') {
          addFriendEntry({
            friendshipId: snapshot.friendshipId ?? requestId,
            createdAt: new Date().toISOString(),
            user,
          });
        }
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
        }
        return prev.filter((req) => req.id !== match.id);
      });
      if (detail.state === 'NONE') {
        setFriendsState((prev) =>
          prev.filter((friend) => friend.user.id !== detail.userId),
        );
      }
    };
    window.addEventListener(
      FRIENDSHIP_UPDATED_EVENT,
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        FRIENDSHIP_UPDATED_EVENT,
        handler as EventListener,
      );
  }, [addFriendEntry]);

  return (
    <div className="container py-10">
      <Stack gap={4}>
        <Heading>{t('friends.listTitle')}</Heading>
        <p className="text-muted-foreground">{t('friends.listDescription')}</p>

        {incomingState.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold">{t('friends.incomingRequests')}</h2>
            <ul className="mt-3 space-y-3">
              {incomingState.map((request) => {
                const user = request.fromUser;
                const displayName = user.name ?? user.username;
                return (
                  <li
                    key={request.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <Avatar size="s" image={user.image} user={user} />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{displayName}</div>
                      <div className="text-sm text-muted-foreground">@{user.username}</div>
                    </div>
                    <FriendActionButton
                      targetUserId={user.id}
                      targetUserName={displayName}
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
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {outgoingState.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold">{t('friends.outgoingRequests')}</h2>
            <ul className="mt-3 space-y-3">
              {outgoingState.map((request) => {
                const user = request.toUser;
                const displayName = user.name ?? user.username;
                return (
                  <li
                    key={request.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <Avatar size="s" image={user.image} user={user} />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{displayName}</div>
                      <div className="text-sm text-muted-foreground">@{user.username}</div>
                    </div>
                    <FriendActionButton
                      targetUserId={user.id}
                      targetUserName={displayName}
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
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {friendsState.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold">{t('friends.friends')}</h2>
            <ul className="mt-3 space-y-3">
              {friendsState.map((friend) => {
                const user = friend.user;
                const displayName = user.name ?? user.username;
                return (
                  <li
                    key={friend.friendshipId}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <Avatar size="s" image={user.image} user={user} />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{displayName}</div>
                      <div className="text-sm text-muted-foreground">@{user.username}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/users/${user.username}`}>{t('friends.viewProfile')}</Link>
                      </Button>
                      <FriendActionButton
                        targetUserId={user.id}
                        targetUserName={displayName}
                        relationship={{
                          state: 'FRIENDS',
                          friendshipId: friend.friendshipId,
                          incomingRequestId: null,
                          outgoingRequestId: null,
                        }}
                        variant="compact"
                        onStateChange={handleFriendTransition(
                          friend.friendshipId,
                          user.id,
                        )}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
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
    </div>
  );
};

export default FriendsRoute;
