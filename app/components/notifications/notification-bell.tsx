import { useNavigate } from '@remix-run/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuBell, LuCheckCheck, LuLoader, LuX } from 'react-icons/lu';
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
const FRIEND_REJECT_EVENT = 'FRIEND_REJECT';

type PendingActionKey = `${string}:${string}`;

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
  const [pendingAction, setPendingAction] = useState<PendingActionKey | null>(
    null,
  );
  const openEventHandlerRef = useRef<(event: Event) => void>();

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
      void loadNotifications();
    }
    track('notifications_open');
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
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId
              ? { ...notification, status: 'READ' }
              : notification,
          ),
        );
      } catch (err) {
        console.error(err);
        toast.error(t('toasts.genericError'));
      }
    },
    [setUnreadCount, t],
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
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
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } catch (err) {
        console.error(err);
        toast.error(t('toasts.genericError'));
      }
    },
    [setUnreadCount, t],
  );

  const handleNotificationClick = useCallback(
    async (notification: ApiNotification) => {
      track('notification_click', { type: notification.type });
      if (notification.status === 'UNREAD') {
        await markNotificationRead(notification.id);
      }
      setOpen(false);
      if (notification.targetUrl) {
        navigate(notification.targetUrl);
      }
    },
    [markNotificationRead, navigate],
  );

  const markAllAsRead = useCallback(async () => {
    if (markAllPending || unreadCount === 0) return;
    setMarkAllPending(true);
    try {
      track('notifications_mark_all_read');
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
      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, status: 'READ' })),
      );
      toast.success(t('notifications.markAllReadSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.genericError'));
    } finally {
      setMarkAllPending(false);
    }
  }, [markAllPending, setUnreadCount, t, unreadCount]);

  const handleFriendAction = useCallback(
    async (
      notification: ApiNotification,
      action: NotificationActionPayload,
    ) => {
      if (!notification.friendRequestId) return;
      const actionKey: PendingActionKey = `${notification.id}:${action.kind}`;
      setPendingAction(actionKey);
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
        setNotifications((prev) =>
          prev.filter((item) => item.id !== notification.id),
        );
        track('notification_inline_action', {
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
        track('notification_inline_action', {
          kind: action.kind,
          success: false,
        });
        toast.error(t('toasts.genericError'));
      } finally {
        setPendingAction((current) => (current === actionKey ? null : current));
      }
    },
    [setUnreadCount, t],
  );

  const displayCount = unreadCount > 9 ? '9+' : unreadCount.toString();

  const listContent = useMemo(() => {
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
        {notifications.map((notification) => {
          const isUnread = notification.status === 'UNREAD';
          const message = t(
            notification.messageKey,
            sanitizeTranslationParams(notification.messageParams),
          );
          const relativeTime = formatRelativeTime(
            notification.createdAt,
            locale,
          );
          return (
            <li
              key={notification.id}
              className="relative border-b last:border-b-0"
            >
              <button
                type="button"
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="Dismiss notification"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteNotification(notification.id);
                }}
              >
                <LuX className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'hover:bg-accent/40',
                )}
                onClick={() => void handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                      isUnread
                        ? 'bg-primary'
                        : 'border border-border bg-transparent',
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
              {notification.actions.length > 0 ? (
                <div className="flex items-center gap-2 px-4 pb-3">
                  {notification.actions.map((action) => (
                    <Button
                      key={`${notification.id}-${action.kind}`}
                      size="sm"
                      variant={
                        action.kind === FRIEND_ACCEPT_EVENT
                          ? 'default'
                          : 'secondary'
                      }
                      onClick={() =>
                        void handleFriendAction(notification, action)
                      }
                      disabled={
                        pendingAction === `${notification.id}:${action.kind}`
                      }
                    >
                      {pendingAction === `${notification.id}:${action.kind}` ? (
                        <LuLoader
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      {action.labelKey
                        ? t(
                            action.labelKey,
                            sanitizeTranslationParams(
                              notification.messageParams,
                            ),
                          )
                        : (action.label ?? '')}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }, [
    handleNotificationClick,
    handleFriendAction,
    locale,
    loading,
    notifications,
    pendingAction,
    t,
  ]);

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
                  onClick={() => void markAllAsRead()}
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
        {error ? (
          <div className="px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}
        {listContent}
        {hasMore ? (
          <div className="border-t px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() =>
                void loadNotifications({
                  cursor: nextCursor ?? undefined,
                  append: true,
                })
              }
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
