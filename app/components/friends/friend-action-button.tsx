import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuCheck, LuLoader, LuUserPlus } from 'react-icons/lu';
import { toast } from 'sonner';
import { track } from '#app/utils/analytics.client.ts';
import {
  dispatchFriendshipUpdate,
  subscribeToFriendshipUpdates,
} from '#app/utils/friendship-events.ts';
import type { RelationshipState } from '#app/utils/friends.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';
import { Button, type ButtonProps } from '#app/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';

interface RelationshipSnapshot {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
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

  useEffect(() => {
    onStateChange?.(current);
  }, [current, onStateChange]);

  const buttonSize: ButtonProps['size'] = variant === 'primary' ? 'lg' : 'sm';

  const sendRequest = useCallback(async () => {
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
      const payload: {
        relationship?: {
          state: RelationshipState;
          friendship?: { id?: string | null } | null;
          incoming?: { id?: string | null } | null;
          outgoing?: { id?: string | null } | null;
        };
      } = await response.json();
      const next: RelationshipSnapshot = payload.relationship
        ? {
            state: payload.relationship.state,
            friendshipId: payload.relationship.friendship?.id ?? null,
            incomingRequestId: payload.relationship.incoming?.id ?? null,
            outgoingRequestId: payload.relationship.outgoing?.id ?? null,
          }
        : {
            state: 'PENDING_OUTGOING',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.sendSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [t, targetUserId]);

  const cancelRequest = useCallback(async () => {
    if (!current.outgoingRequestId) return;
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
      const payload: {
        relationship?: {
          state: RelationshipState;
          friendship?: { id?: string | null } | null;
          incoming?: { id?: string | null } | null;
          outgoing?: { id?: string | null } | null;
        };
      } = await response.json();
      const next: RelationshipSnapshot = payload.relationship
        ? {
            state: payload.relationship.state,
            friendshipId: payload.relationship.friendship?.id ?? null,
            incomingRequestId: payload.relationship.incoming?.id ?? null,
            outgoingRequestId: payload.relationship.outgoing?.id ?? null,
          }
        : {
            state: 'NONE',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.cancelSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current.outgoingRequestId, t, targetUserId]);

  const acceptRequest = useCallback(async () => {
    if (!current.incomingRequestId) return;
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
      const payload: {
        unreadCount?: number;
        relationship?: {
          state: RelationshipState;
          friendship?: { id?: string | null } | null;
          incoming?: { id?: string | null } | null;
          outgoing?: { id?: string | null } | null;
        };
      } = await response.json();
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
      }
      const next: RelationshipSnapshot = payload.relationship
        ? {
            state: payload.relationship.state,
            friendshipId: payload.relationship.friendship?.id ?? null,
            incomingRequestId: payload.relationship.incoming?.id ?? null,
            outgoingRequestId: payload.relationship.outgoing?.id ?? null,
          }
        : {
            state: 'FRIENDS',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.acceptSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current.incomingRequestId, setUnreadCount, t, targetUserId]);

  const rejectRequest = useCallback(async () => {
    if (!current.incomingRequestId) return;
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
      const payload: {
        unreadCount?: number;
        relationship?: {
          state: RelationshipState;
          friendship?: { id?: string | null } | null;
          incoming?: { id?: string | null } | null;
          outgoing?: { id?: string | null } | null;
        };
      } = await response.json();
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
      }
      const next: RelationshipSnapshot = payload.relationship
        ? {
            state: payload.relationship.state,
            friendshipId: payload.relationship.friendship?.id ?? null,
            incomingRequestId: payload.relationship.incoming?.id ?? null,
            outgoingRequestId: payload.relationship.outgoing?.id ?? null,
          }
        : {
            state: 'NONE',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.rejectSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
    }
  }, [current.incomingRequestId, setUnreadCount, t, targetUserId]);

  const removeFriend = useCallback(async () => {
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
      const payload: {
        relationship?: {
          state: RelationshipState;
          friendshipId?: string | null;
          incomingRequestId?: string | null;
          outgoingRequestId?: string | null;
        };
      } = await response.json();
      const next: RelationshipSnapshot = payload.relationship
        ? {
            state: payload.relationship.state,
            friendshipId: payload.relationship.friendshipId ?? null,
            incomingRequestId: payload.relationship.incomingRequestId ?? null,
            outgoingRequestId: payload.relationship.outgoingRequestId ?? null,
          }
        : {
            state: 'NONE',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
      setCurrent(next);
      dispatchFriendshipUpdate({ userId: targetUserId, ...next });
      toast.success(t('friends.removeSuccess', { name: targetUserName }));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setPendingAction(null);
      setConfirmOpen(false);
    }
  }, [t, targetUserId, targetUserName]);

  const isPending = useCallback(
    (actionKey: string) => pendingAction === actionKey,
    [pendingAction],
  );

  const renderActions = useMemo(() => {
    switch (current.state) {
      case 'NONE':
        return (
          <Button
            type="button"
            size={buttonSize}
            className={cn('gap-2', className)}
            onClick={() => void sendRequest()}
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
        return (
          <div className={cn('flex items-center gap-2', className)}>
            <Button size={buttonSize} variant="secondary" disabled>
              {t('friends.requestSent')}
            </Button>
            <Button
              size={buttonSize}
              variant="ghost"
              onClick={() => void cancelRequest()}
              disabled={isPending('cancel')}
            >
              {isPending('cancel') ? (
                <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {t('friends.cancelRequest')}
            </Button>
          </div>
        );
      case 'PENDING_INCOMING':
        return (
          <div className={cn('flex items-center gap-2', className)}>
            <Button
              size={buttonSize}
              onClick={() => void acceptRequest()}
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
              onClick={() => void rejectRequest()}
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
                    onClick={() => void removeFriend()}
                    disabled={isPending('remove')}
                  >
                    {isPending('remove') ? (
                      <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
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
    cancelRequest,
    className,
    confirmOpen,
    current.state,
    isPending,
    removeFriend,
    acceptRequest,
    rejectRequest,
    sendRequest,
    t,
    targetUserName,
  ]);

  return renderActions;
};

export type { RelationshipSnapshot };
