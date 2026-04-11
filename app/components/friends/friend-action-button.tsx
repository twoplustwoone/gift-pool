import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuCheck, LuLoader, LuUserPlus } from 'react-icons/lu';
import { toast } from 'sonner';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';
import { Button, type ButtonProps } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import { track } from '#app/utils/analytics.client.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import {
  dispatchFriendshipUpdate,
  subscribeToFriendshipUpdates,
} from '#app/utils/friendship-events.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';

interface RelationshipSnapshot {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
}

interface RelationshipEdgePayload {
  state: RelationshipState;
  friendship?: { id?: string | null } | null;
  incoming?: { id?: string | null } | null;
  outgoing?: { id?: string | null } | null;
}

interface RemoveRelationshipPayload {
  state: RelationshipState;
  friendshipId?: string | null;
  incomingRequestId?: string | null;
  outgoingRequestId?: string | null;
}

const EMPTY_SNAPSHOT: RelationshipSnapshot = {
  state: 'NONE' as RelationshipState,
  friendshipId: null,
  incomingRequestId: null,
  outgoingRequestId: null,
};

function snapshotFromEdge(
  payload?: RelationshipEdgePayload | null,
): RelationshipSnapshot {
  if (!payload) return EMPTY_SNAPSHOT;
  return {
    state: payload.state,
    friendshipId: payload.friendship?.id ?? null,
    incomingRequestId: payload.incoming?.id ?? null,
    outgoingRequestId: payload.outgoing?.id ?? null,
  };
}

function snapshotFromRemove(
  payload?: RemoveRelationshipPayload | null,
): RelationshipSnapshot {
  if (!payload) return EMPTY_SNAPSHOT;
  return {
    state: payload.state,
    friendshipId: payload.friendshipId ?? null,
    incomingRequestId: payload.incomingRequestId ?? null,
    outgoingRequestId: payload.outgoingRequestId ?? null,
  };
}

interface FriendActionButtonProps {
  targetUserId: string;
  targetUserName: string;
  relationship: RelationshipSnapshot;
  variant?: 'primary' | 'compact';
  className?: string;
  onStateChange?: (relationship: RelationshipSnapshot) => void;
}

const FRIEND_ACCEPT_EVENT = 'FRIEND_ACCEPT';
const FRIEND_REJECT_EVENT = 'FRIEND_REJECT';

export const FriendActionButton = ({
  targetUserId,
  targetUserName,
  relationship,
  variant = 'primary',
  className,
  onStateChange,
}: FriendActionButtonProps) => {
  const [current, setCurrent] = useState<RelationshipSnapshot>(relationship);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { setUnreadCount } = useNotificationsStore();
  const { t } = useTranslation();

  useEffect(() => {
    setCurrent(relationship);
  }, [relationship]);

  useEffect(() => {
    return subscribeToFriendshipUpdates(targetUserId, (detail) => {
      setCurrent({
        state: detail.state,
        friendshipId: detail.friendshipId ?? null,
        incomingRequestId: detail.incomingRequestId ?? null,
        outgoingRequestId: detail.outgoingRequestId ?? null,
      });
    });
  }, [targetUserId]);

  // Avoid firing onStateChange on the initial mount to prevent list flicker
  const didInitRef = useMemo(() => ({ current: false }), []);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true as any;
      return;
    }
    onStateChange?.(current);
  }, [current, onStateChange, didInitRef]);

  const buttonSize: ButtonProps['size'] = variant === 'primary' ? 'lg' : 'sm';

  const sendRequest = useCallback(async () => {
    const previous = current;
    const optimisticNext: RelationshipSnapshot = {
      state: 'PENDING_OUTGOING' as RelationshipState,
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: current.outgoingRequestId,
    };
    setCurrent(optimisticNext);
    dispatchFriendshipUpdate({ userId: targetUserId, ...optimisticNext });
    setPendingAction('send');
    try {
      track('friend_request_send', { targetUserId });
      const response = await fetch('/api/friends/requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: targetUserId }),
      });
      if (!response.ok) {
        throw new Error('Failed to send friend request');
      }
      const payload = (await response.json()) as {
        relationship?: RelationshipEdgePayload | null;
      };
      const next = payload.relationship
        ? snapshotFromEdge(payload.relationship)
        : { ...EMPTY_SNAPSHOT, state: 'PENDING_OUTGOING' as RelationshipState };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.sendSuccess'));
    } catch (err) {
      console.error(err);
      setCurrent(previous);
      dispatchFriendshipUpdate({ userId: targetUserId, ...previous });
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current, t, targetUserId]);

  const cancelRequest = useCallback(async () => {
    if (!current.outgoingRequestId) return;
    const previous = current;
    setCurrent(EMPTY_SNAPSHOT);
    dispatchFriendshipUpdate({ userId: targetUserId, ...EMPTY_SNAPSHOT });
    setPendingAction('cancel');
    try {
      const response = await fetch(
        `/api/friends/requests/${current.outgoingRequestId}/cancel`,
        {
          method: 'POST',
          credentials: 'same-origin',
        },
      );
      if (!response.ok) {
        throw new Error('Failed to cancel request');
      }
      const payload = (await response.json()) as {
        relationship?: RelationshipEdgePayload | null;
      };
      const next = payload.relationship
        ? snapshotFromEdge(payload.relationship)
        : EMPTY_SNAPSHOT;
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.cancelSuccess'));
    } catch (err) {
      console.error(err);
      setCurrent(previous);
      dispatchFriendshipUpdate({ userId: targetUserId, ...previous });
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current, t, targetUserId]);

  const acceptRequest = useCallback(async () => {
    if (!current.incomingRequestId) return;
    const previous = current;
    const optimisticNext: RelationshipSnapshot = {
      ...EMPTY_SNAPSHOT,
      state: 'FRIENDS' as RelationshipState,
    };
    setCurrent(optimisticNext);
    dispatchFriendshipUpdate({ userId: targetUserId, ...optimisticNext });
    setPendingAction(FRIEND_ACCEPT_EVENT);
    try {
      track('friend_request_accept', { targetUserId });
      const response = await fetch(
        `/api/friends/requests/${current.incomingRequestId}/accept`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) {
        throw new Error('Failed to accept request');
      }
      const payload = (await response.json()) as {
        unreadCount?: number;
        relationship?: RelationshipEdgePayload | null;
      };
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
      }
      const next = payload.relationship
        ? snapshotFromEdge(payload.relationship)
        : { ...EMPTY_SNAPSHOT, state: 'FRIENDS' as RelationshipState };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.acceptSuccess'));
    } catch (err) {
      console.error(err);
      setCurrent(previous);
      dispatchFriendshipUpdate({ userId: targetUserId, ...previous });
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current, setUnreadCount, t, targetUserId]);

  const rejectRequest = useCallback(async () => {
    if (!current.incomingRequestId) return;
    const previous = current;
    setCurrent(EMPTY_SNAPSHOT);
    dispatchFriendshipUpdate({ userId: targetUserId, ...EMPTY_SNAPSHOT });
    setPendingAction(FRIEND_REJECT_EVENT);
    try {
      track('friend_request_reject', { targetUserId });
      const response = await fetch(
        `/api/friends/requests/${current.incomingRequestId}/reject`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) {
        throw new Error('Failed to reject request');
      }
      const payload = (await response.json()) as {
        unreadCount?: number;
        relationship?: RelationshipEdgePayload | null;
      };
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
      }
      const next = payload.relationship
        ? snapshotFromEdge(payload.relationship)
        : EMPTY_SNAPSHOT;
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.rejectSuccess'));
    } catch (err) {
      console.error(err);
      setCurrent(previous);
      dispatchFriendshipUpdate({ userId: targetUserId, ...previous });
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current, setUnreadCount, t, targetUserId]);

  const removeFriend = useCallback(async () => {
    const previous = current;
    setCurrent(EMPTY_SNAPSHOT);
    dispatchFriendshipUpdate({ userId: targetUserId, ...EMPTY_SNAPSHOT });
    setPendingAction('remove');
    try {
      track('friend_remove', { targetUserId });
      const response = await fetch('/api/friends/remove', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (!response.ok) {
        throw new Error('Failed to remove friend');
      }
      const payload = (await response.json()) as {
        relationship?: RemoveRelationshipPayload | null;
      };
      const next = snapshotFromRemove(payload.relationship);
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.removeSuccess', { name: targetUserName }));
    } catch (err) {
      console.error(err);
      setCurrent(previous);
      dispatchFriendshipUpdate({ userId: targetUserId, ...previous });
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
      setConfirmOpen(false);
    }
  }, [current, t, targetUserId, targetUserName]);

  const isPending = useCallback(
    (actionKey: string) => pendingAction === actionKey,
    [pendingAction],
  );

  const canCancelOutgoing = Boolean(current.outgoingRequestId);
  const handleSendRequestClick = () => sendRequest();
  const handleCancelRequestClick = () => cancelRequest();
  const handleAcceptRequestClick = () => acceptRequest();
  const handleRejectRequestClick = () => rejectRequest();
  const handleRemoveFriendClick = () => removeFriend();

  const renderActions = useMemo(() => {
    switch (current.state) {
      case 'NONE':
        return (
          <Button
            type="button"
            size={buttonSize}
            className={cn('gap-2', className)}
            onClick={handleSendRequestClick}
            disabled={isPending('send')}
          >
            {isPending('send') ? (
              <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LuUserPlus className="h-4 w-4" aria-hidden />
            )}
            {t('friends.add')}
          </Button>
        );
      case 'PENDING_OUTGOING':
        // Drop the disabled "Request sent" pseudo-button — the row's
        // location in the Pending requests section already conveys that
        // status, so the pill is dead weight that fights with the real
        // Cancel action for visual attention. Just keep the actionable
        // Cancel button.
        return (
          <Button
            size={buttonSize}
            variant="secondary"
            className={cn('gap-2', className)}
            onClick={handleCancelRequestClick}
            disabled={isPending('cancel') || !canCancelOutgoing}
          >
            {isPending('cancel') ? (
              <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {t('friends.cancelRequest')}
          </Button>
        );
      case 'PENDING_INCOMING':
        return (
          <div className={cn('flex items-center gap-2', className)}>
            <Button
              size={buttonSize}
              onClick={handleAcceptRequestClick}
              disabled={isPending(FRIEND_ACCEPT_EVENT)}
              aria-label={t('notifications.friendRequest.acceptAria', {
                name: targetUserName,
              })}
            >
              {isPending(FRIEND_ACCEPT_EVENT) ? (
                <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {t('friends.accept')}
            </Button>
            <Button
              size={buttonSize}
              variant="secondary"
              onClick={handleRejectRequestClick}
              disabled={isPending(FRIEND_REJECT_EVENT)}
              aria-label={t('notifications.friendRequest.rejectAria', {
                name: targetUserName,
              })}
            >
              {isPending(FRIEND_REJECT_EVENT) ? (
                <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {t('friends.reject')}
            </Button>
          </div>
        );
      case 'FRIENDS':
        return (
          <div className={cn('flex items-center gap-2', className)}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size={buttonSize}
                  variant="secondary"
                  className="gap-2"
                  aria-label={t('friends.friends')}
                >
                  <LuCheck className="h-4 w-4" aria-hidden />
                  {t('friends.friends')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                  {t('friends.remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('friends.removeConfirmTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('friends.removeConfirmDescription', {
                      name: targetUserName,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                  >
                    {t('friends.removeConfirmCancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRemoveFriendClick}
                    disabled={isPending('remove')}
                  >
                    {isPending('remove') ? (
                      <LuLoader
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    {t('friends.removeConfirmConfirm')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );
      default:
        return null;
    }
  }, [
    buttonSize,
    canCancelOutgoing,
    className,
    confirmOpen,
    current.state,
    handleAcceptRequestClick,
    handleCancelRequestClick,
    handleRejectRequestClick,
    handleRemoveFriendClick,
    handleSendRequestClick,
    isPending,
    t,
    targetUserName,
  ]);

  return renderActions;
};

export type { RelationshipSnapshot };
