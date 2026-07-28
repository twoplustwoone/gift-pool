import { useCallback, useEffect, useRef, useState } from 'react';
import { LuBell, LuCheckCheck, LuLoader, LuX } from 'react-icons/lu';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '#app/components/ui/button.tsx';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#app/components/ui/popover.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip.tsx';
import { track } from '#app/utils/analytics.client.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import { dispatchFriendshipUpdate } from '#app/utils/friendship-events.ts';
import {
  formatRelativeTime,
  sanitizeTranslationParams,
  useTranslation,
} from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';
import { useNotificationsStore } from './notifications-context.tsx';
import { PushNudge } from './push-nudge.tsx';

interface NotificationActionPayload {
  kind: string;
  labelKey?: string;
  label?: string | null;
}

interface ApiNotification {
  id: string;
  type: string;
  status: string;
  messageKey: string;
  messageParams?: Record<string, unknown> | null;
  targetUrl?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  actions: NotificationActionPayload[];
  friendRequestId?: string | null;
  poolInvitationId?: string | null;
}

interface NotificationsResponse {
  notifications: ApiNotification[];
  hasMore: boolean;
  nextCursor: string | null;
  unreadCount: number;
}

interface RelationshipEdgePayload {
  state: RelationshipState;
  friendship?: { id?: string | null } | null;
  incoming?: { id?: string | null } | null;
  outgoing?: { id?: string | null } | null;
}

const EMPTY_RELATIONSHIP = {
  state: 'NONE' as RelationshipState,
  friendshipId: null,
  incomingRequestId: null,
  outgoingRequestId: null,
};

function snapshotFromEdge(payload?: RelationshipEdgePayload | null) {
  if (!payload) return EMPTY_RELATIONSHIP;
  return {
    state: payload.state,
    friendshipId: payload.friendship?.id ?? null,
    incomingRequestId: payload.incoming?.id ?? null,
    outgoingRequestId: payload.outgoing?.id ?? null,
  };
}

const NOTIFICATIONS_ENDPOINT = '/api/notifications';
const MARK_ALL_ENDPOINT = '/api/notifications/read-all';

const FRIEND_ACCEPT_EVENT = 'FRIEND_ACCEPT';
const POOL_INVITATION_ACCEPT_EVENT = 'POOL_INVITATION_ACCEPT';
const POOL_INVITATION_DECLINE_EVENT = 'POOL_INVITATION_DECLINE';
const WISHLIST_CLAIM_KEEP_EVENT = 'WISHLIST_CLAIM_KEEP';
const WISHLIST_CLAIM_RELEASE_EVENT = 'WISHLIST_CLAIM_RELEASE';
const WISHLIST_PURCHASE_ENDPOINT = '/wishlist/purchase';

type PendingActionKey = `${string}:${string}`;
type NotificationTranslator = ReturnType<typeof useTranslation>['t'];
type NotificationLocale = Parameters<typeof formatRelativeTime>[1];

function NotificationRowActions({
  notification,
  pendingActionKeys,
  onAction,
  t,
}: {
  notification: ApiNotification;
  pendingActionKeys: Set<PendingActionKey>;
  onAction: (
    notification: ApiNotification,
    action: NotificationActionPayload,
  ) => void;
  t: NotificationTranslator;
}) {
  if (notification.actions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 pb-3">
      {notification.actions.map((action) => {
        const actionKey: PendingActionKey = `${notification.id}:${action.kind}`;
        const isPending = [...pendingActionKeys].some((key) =>
          key.startsWith(`${notification.id}:`),
        );

        return (
          <Button
            key={actionKey}
            size="sm"
            variant={
              action.kind === FRIEND_ACCEPT_EVENT ||
              action.kind === POOL_INVITATION_ACCEPT_EVENT ||
              action.kind === WISHLIST_CLAIM_RELEASE_EVENT
                ? 'default'
                : 'secondary'
            }
            className="min-h-11"
            onClick={() => onAction(notification, action)}
            disabled={isPending}
          >
            {isPending ? (
              <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {action.labelKey
              ? t(
                  action.labelKey,
                  sanitizeTranslationParams(notification.messageParams),
                )
              : (action.label ?? '')}
          </Button>
        );
      })}
    </div>
  );
}

function NotificationListItem({
  locale,
  notification,
  onDelete,
  onOpen,
  onAction,
  pendingActionKeys,
  pendingDeleteIds,
  t,
}: {
  locale: NotificationLocale;
  notification: ApiNotification;
  onDelete: (
    event: React.MouseEvent<HTMLButtonElement>,
    notificationId: string,
  ) => void;
  onOpen: (notification: ApiNotification) => void;
  onAction: (
    notification: ApiNotification,
    action: NotificationActionPayload,
  ) => void;
  pendingActionKeys: Set<PendingActionKey>;
  pendingDeleteIds: Set<string>;
  t: NotificationTranslator;
}) {
  const isUnread = notification.status === 'UNREAD';
  const message = t(
    notification.messageKey,
    sanitizeTranslationParams(notification.messageParams),
  );
  const relativeTime = formatRelativeTime(notification.createdAt, locale);

  return (
    <li key={notification.id} className="relative border-b last:border-b-0">
      <button
        type="button"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Dismiss notification"
        onClick={(event) => onDelete(event, notification.id)}
        disabled={pendingDeleteIds.has(notification.id)}
      >
        <LuX className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(
          'flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'hover:bg-accent/40',
        )}
        onClick={() => onOpen(notification)}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
              isUnread ? 'bg-primary' : 'border border-border bg-transparent',
            )}
            aria-hidden
          />
          <div className="flex-1">
            <div className="line-clamp-2 text-sm text-foreground">
              {message}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {relativeTime}
            </div>
          </div>
        </div>
      </button>
      <NotificationRowActions
        notification={notification}
        pendingActionKeys={pendingActionKeys}
        onAction={onAction}
        t={t}
      />
    </li>
  );
}

function NotificationsList({
  loading,
  locale,
  notifications,
  onDelete,
  onOpen,
  onAction,
  pendingActionKeys,
  pendingDeleteIds,
  t,
}: {
  loading: boolean;
  locale: NotificationLocale;
  notifications: ApiNotification[];
  onDelete: (
    event: React.MouseEvent<HTMLButtonElement>,
    notificationId: string,
  ) => void;
  onOpen: (notification: ApiNotification) => void;
  onAction: (
    notification: ApiNotification,
    action: NotificationActionPayload,
  ) => void;
  pendingActionKeys: Set<PendingActionKey>;
  pendingDeleteIds: Set<string>;
  t: NotificationTranslator;
}) {
  if (loading && notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
        <LuLoader className="h-5 w-5 animate-spin" aria-hidden />
        <span>{t('notifications.loading')}</span>
      </div>
    );
  }

  if (!loading && notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
        <span>{t('notifications.empty')}</span>
      </div>
    );
  }

  return (
    <ul className="max-h-80 overflow-y-auto">
      {notifications.map((notification) => (
        <NotificationListItem
          key={notification.id}
          locale={locale}
          notification={notification}
          onDelete={onDelete}
          onOpen={onOpen}
          onAction={onAction}
          pendingActionKeys={pendingActionKeys}
          pendingDeleteIds={pendingDeleteIds}
          t={t}
        />
      ))}
    </ul>
  );
}

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { unreadCount, setUnreadCount } = useNotificationsStore();
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [initialFetchCompleted, setInitialFetchCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [pendingActionKeys, setPendingActionKeys] = useState<
    Set<PendingActionKey>
  >(new Set());
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  );
  const notificationsRef = useRef<ApiNotification[]>([]);
  const unreadCountRef = useRef(unreadCount);
  const openEventHandlerRef = useRef<(event: Event) => void>();

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const loadNotifications = useCallback(
    async ({ cursor, append }: { cursor?: string; append?: boolean } = {}) => {
      setError(null);
      setLoading(true);
      try {
        const search = new URLSearchParams({ status: 'all' });
        if (cursor) search.set('cursor', cursor);
        const response = await fetch(
          `${NOTIFICATIONS_ENDPOINT}?${search.toString()}`,
          {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          },
        );
        if (!response.ok) {
          throw new Error('Failed to load notifications');
        }
        const data = (await response.json()) as NotificationsResponse;
        setNotifications((prev) =>
          append ? [...prev, ...data.notifications] : data.notifications,
        );
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount ?? 0);
        setInitialFetchCompleted(true);
      } catch (err) {
        console.error(err);
        setError(t('notifications.error'));
      } finally {
        setLoading(false);
      }
    },
    [setUnreadCount, t],
  );

  useEffect(() => {
    if (!open) return;
    if (!initialFetchCompleted && !loading) {
      loadNotifications().catch(() => {});
    }
    track('notifications_opened');
  }, [open, initialFetchCompleted, loading, loadNotifications]);

  useEffect(() => {
    const handler = () => setOpen(true);
    openEventHandlerRef.current = handler;
    window.addEventListener('notifications:open', handler);
    return () => {
      if (openEventHandlerRef.current) {
        window.removeEventListener(
          'notifications:open',
          openEventHandlerRef.current,
        );
      }
    };
  }, []);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (pendingReadIds.has(notificationId)) return;
      const targetNotification = notificationsRef.current.find(
        (notification) => notification.id === notificationId,
      );
      if (!targetNotification || targetNotification.status !== 'UNREAD') {
        return;
      }

      const previousUnreadCount = unreadCountRef.current;
      const previousNotifications = notificationsRef.current;
      setPendingReadIds((prev) => new Set(prev).add(notificationId));
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, status: 'READ' }
            : notification,
        ),
      );
      setUnreadCount(Math.max(0, previousUnreadCount - 1));

      try {
        const response = await fetch(
          `${NOTIFICATIONS_ENDPOINT}/${notificationId}/read`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) {
          throw new Error('Unable to mark notification read');
        }
        const payload = (await response.json()) as { unreadCount?: number };
        if (typeof payload.unreadCount === 'number') {
          setUnreadCount(payload.unreadCount);
        }
      } catch (err) {
        console.error(err);
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingReadIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      }
    },
    [pendingReadIds, setUnreadCount, t],
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (pendingDeleteIds.has(notificationId)) return;
      const previousNotifications = notificationsRef.current;
      const notificationIndex = previousNotifications.findIndex(
        (notification) => notification.id === notificationId,
      );
      if (notificationIndex < 0) return;
      const deletedNotification = previousNotifications[notificationIndex];
      if (!deletedNotification) return;
      const previousUnreadCount = unreadCountRef.current;

      setPendingDeleteIds((prev) => new Set(prev).add(notificationId));
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (deletedNotification.status === 'UNREAD') {
        setUnreadCount(Math.max(0, previousUnreadCount - 1));
      }

      try {
        const response = await fetch(
          `${NOTIFICATIONS_ENDPOINT}/${notificationId}/delete`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) throw new Error('Unable to delete notification');
        const payload = (await response.json()) as { unreadCount?: number };
        if (typeof payload.unreadCount === 'number')
          setUnreadCount(payload.unreadCount);
      } catch (err) {
        console.error(err);
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      }
    },
    [pendingDeleteIds, setUnreadCount, t],
  );

  const handleNotificationClick = useCallback(
    async (notification: ApiNotification) => {
      track('notification_clicked', { type: notification.type });
      if (notification.status === 'UNREAD') {
        await markNotificationRead(notification.id);
      }
      setOpen(false);
      if (notification.targetUrl) {
        Promise.resolve(navigate(notification.targetUrl)).catch(() => {});
      }
    },
    [markNotificationRead, navigate],
  );

  const markAllAsRead = useCallback(async () => {
    if (markAllPending || unreadCountRef.current === 0) return;
    setMarkAllPending(true);
    const previousUnreadCount = unreadCountRef.current;
    const previousStatuses = new Map(
      notificationsRef.current.map((notification) => [
        notification.id,
        notification.status,
      ]),
    );

    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, status: 'READ' })),
    );
    setUnreadCount(0);

    try {
      track('notifications_marked_all_read');
      const response = await fetch(MARK_ALL_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Unable to mark all read');
      }
      const payload = (await response.json()) as { unreadCount?: number };
      setUnreadCount(payload.unreadCount ?? 0);
      toast.success(t('notifications.markAllReadSuccess'));
    } catch (err) {
      console.error(err);
      setNotifications((prev) =>
        prev.map((notification) => {
          const previousStatus = previousStatuses.get(notification.id);
          return previousStatus
            ? { ...notification, status: previousStatus }
            : notification;
        }),
      );
      setUnreadCount(previousUnreadCount);
      toast.error(t('toasts.genericError'));
    } finally {
      setMarkAllPending(false);
    }
  }, [markAllPending, setUnreadCount, t]);

  const handleFriendAction = useCallback(
    async (
      notification: ApiNotification,
      action: NotificationActionPayload,
    ) => {
      if (!notification.friendRequestId) return;
      const actionKey: PendingActionKey = `${notification.id}:${action.kind}`;
      if (pendingActionKeys.has(actionKey)) return;
      const previousNotifications = notificationsRef.current;
      const previousUnreadCount = unreadCountRef.current;
      const wasUnread = notification.status === 'UNREAD';
      setPendingActionKeys((prev) => new Set(prev).add(actionKey));
      setNotifications((prev) =>
        prev.filter((item) => item.id !== notification.id),
      );
      if (wasUnread) {
        setUnreadCount(Math.max(0, previousUnreadCount - 1));
      }
      const endpoint =
        action.kind === FRIEND_ACCEPT_EVENT
          ? `/api/friends/requests/${notification.friendRequestId}/accept`
          : `/api/friends/requests/${notification.friendRequestId}/reject`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Friend action failed');
        }
        const payload = (await response.json()) as {
          unreadCount?: number;
          relationship?: RelationshipEdgePayload | null;
        };
        if (typeof payload.unreadCount === 'number') {
          setUnreadCount(payload.unreadCount);
        }
        track('notification_action_completed', {
          kind: action.kind,
          success: true,
        });
        toast.success(
          action.kind === FRIEND_ACCEPT_EVENT
            ? t('friends.acceptSuccess')
            : t('friends.rejectSuccess'),
        );
        const metadata = (notification.metadata ?? {}) as Record<
          string,
          unknown
        >;
        const senderId = metadata.senderUserId as string | undefined;
        if (senderId) {
          const relationSnapshot = payload.relationship
            ? snapshotFromEdge(payload.relationship)
            : action.kind === FRIEND_ACCEPT_EVENT
              ? { ...EMPTY_RELATIONSHIP, state: 'FRIENDS' as RelationshipState }
              : EMPTY_RELATIONSHIP;
          dispatchFriendshipUpdate({ userId: senderId, ...relationSnapshot });
        }
      } catch (err) {
        console.error(err);
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        track('notification_action_completed', {
          kind: action.kind,
          success: false,
        });
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingActionKeys((prev) => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [pendingActionKeys, setUnreadCount, t],
  );

  const handlePoolInvitationAction = useCallback(
    async (
      notification: ApiNotification,
      action: NotificationActionPayload,
    ) => {
      if (!notification.poolInvitationId) return;
      const actionKey: PendingActionKey = `${notification.id}:${action.kind}`;
      if (pendingActionKeys.has(actionKey)) return;
      setPendingActionKeys((prev) => new Set(prev).add(actionKey));
      const operation =
        action.kind === POOL_INVITATION_ACCEPT_EVENT ? 'accept' : 'decline';
      try {
        const response = await fetch(
          `/api/pool-invitations/${notification.poolInvitationId}/${operation}`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) throw new Error('Pool invitation action failed');
        const payload = (await response.json()) as {
          unreadCount?: number;
          poolId?: string;
        };
        setNotifications((prev) =>
          prev.filter((item) => item.id !== notification.id),
        );
        if (typeof payload.unreadCount === 'number') {
          setUnreadCount(payload.unreadCount);
        }
        track('notification_action_completed', {
          kind: action.kind,
          success: true,
        });
        toast.success(
          operation === 'accept'
            ? t('notifications.poolInvitation.acceptSuccess')
            : t('notifications.poolInvitation.declineSuccess'),
        );
        if (operation === 'accept' && payload.poolId) {
          setOpen(false);
          await Promise.resolve(navigate(`/pools/${payload.poolId}`));
        }
      } catch (err) {
        console.error(err);
        track('notification_action_completed', {
          kind: action.kind,
          success: false,
        });
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingActionKeys((prev) => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [navigate, pendingActionKeys, setUnreadCount, t],
  );

  // Keep and Release both resolve the notification inline — neither
  // navigates away. Release actually mutates the claim (via the same
  // `/wishlist/purchase` unpurchase path the wishlist page uses); Keep only
  // dismisses, since overriding someone's claim is an explicit non-goal.
  const handleWishlistClaimAction = useCallback(
    async (
      notification: ApiNotification,
      action: NotificationActionPayload,
    ) => {
      const actionKey: PendingActionKey = `${notification.id}:${action.kind}`;
      if (pendingActionKeys.has(actionKey)) return;
      const metadata = (notification.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const wishlistItemId = metadata.wishlistItemId as string | undefined;
      const isRelease = action.kind === WISHLIST_CLAIM_RELEASE_EVENT;
      if (isRelease && !wishlistItemId) return;

      const previousNotifications = notificationsRef.current;
      const previousUnreadCount = unreadCountRef.current;
      const wasUnread = notification.status === 'UNREAD';

      setPendingActionKeys((prev) => new Set(prev).add(actionKey));
      try {
        if (isRelease && wishlistItemId) {
          const releaseFormData = new FormData();
          releaseFormData.set('wishlistItemId', wishlistItemId);
          releaseFormData.set('intent', 'unpurchase');
          const releaseResponse = await fetch(WISHLIST_PURCHASE_ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            body: releaseFormData,
          });
          const releasePayload = (await releaseResponse
            .json()
            .catch(() => null)) as { ok?: boolean } | null;
          if (!releaseResponse.ok || !releasePayload?.ok) {
            throw new Error('Unable to release wishlist claim');
          }
        }

        // Both actions dismiss the notification once they've done their work.
        setNotifications((prev) =>
          prev.filter((item) => item.id !== notification.id),
        );
        if (wasUnread) {
          setUnreadCount(Math.max(0, previousUnreadCount - 1));
        }
        const dismissResponse = await fetch(
          `${NOTIFICATIONS_ENDPOINT}/${notification.id}/delete`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        );
        if (dismissResponse.ok) {
          const dismissPayload = (await dismissResponse.json()) as {
            unreadCount?: number;
          };
          if (typeof dismissPayload.unreadCount === 'number') {
            setUnreadCount(dismissPayload.unreadCount);
          }
        }

        track('notification_action_completed', {
          kind: action.kind,
          success: true,
        });
        toast.success(
          isRelease
            ? t('notifications.wishlistClaimConflict.releaseSuccess')
            : t('notifications.wishlistClaimConflict.keepSuccess'),
        );
      } catch (err) {
        console.error(err);
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        track('notification_action_completed', {
          kind: action.kind,
          success: false,
        });
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingActionKeys((prev) => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [pendingActionKeys, setUnreadCount, t],
  );

  const displayCount = unreadCount > 9 ? '9+' : unreadCount.toString();

  const handleDeleteNotificationClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, notificationId: string) => {
      event.stopPropagation();
      deleteNotification(notificationId).catch(() => {});
    },
    [deleteNotification],
  );
  const handleNotificationOpen = useCallback(
    (notification: ApiNotification) => {
      handleNotificationClick(notification).catch(() => {});
    },
    [handleNotificationClick],
  );
  const handleNotificationAction = useCallback(
    (notification: ApiNotification, action: NotificationActionPayload) => {
      if (
        action.kind === POOL_INVITATION_ACCEPT_EVENT ||
        action.kind === POOL_INVITATION_DECLINE_EVENT
      ) {
        handlePoolInvitationAction(notification, action).catch(() => {});
        return;
      }
      if (
        action.kind === WISHLIST_CLAIM_KEEP_EVENT ||
        action.kind === WISHLIST_CLAIM_RELEASE_EVENT
      ) {
        handleWishlistClaimAction(notification, action).catch(() => {});
        return;
      }
      handleFriendAction(notification, action).catch(() => {});
    },
    [handleFriendAction, handlePoolInvitationAction, handleWishlistClaimAction],
  );
  const handleLoadMore = useCallback(() => {
    loadNotifications({
      cursor: nextCursor ?? undefined,
      append: true,
    }).catch(() => {});
  }, [loadNotifications, nextCursor]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-surface-muted relative inline-flex size-10 items-center justify-center rounded-full border border-transparent text-foreground shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('notifications.bellLabel')}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <LuBell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {displayCount}
            </span>
          ) : null}
          <LiveAnnouncer />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={12}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('notifications.title')}
          </h3>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0 || markAllPending}
                  aria-label={t('notifications.markAllRead')}
                >
                  {markAllPending ? (
                    <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <LuCheckCheck className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('notifications.markAllRead')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <PushNudge />
        {error ? (
          <div className="px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}
        <NotificationsList
          loading={loading}
          locale={locale}
          notifications={notifications}
          onDelete={handleDeleteNotificationClick}
          onOpen={handleNotificationOpen}
          onAction={handleNotificationAction}
          pendingActionKeys={pendingActionKeys}
          pendingDeleteIds={pendingDeleteIds}
          t={t}
        />
        {hasMore ? (
          <div className="border-t px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleLoadMore}
              disabled={loading}
            >
              {loading ? (
                <LuLoader className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {t('notifications.viewMore')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};

const LiveAnnouncer = () => {
  const { unreadCount } = useNotificationsStore();
  const { t } = useTranslation('notifications');
  const message =
    unreadCount === 0
      ? t('badge.none')
      : unreadCount === 1
        ? t('badge.singular')
        : t('badge.plural', { count: unreadCount });
  return (
    <span aria-live="polite" className="sr-only">
      {message}
    </span>
  );
};
