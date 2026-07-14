import { data, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  formatRelativeTime,
  getLocaleFromRequest,
  sanitizeTranslationParams,
  translate,
  type Locale,
} from '#app/utils/i18n.tsx';
import {
  listNotifications,
  type NotificationRecord,
} from '#app/utils/notifications.server.ts';
function serializeNotification(record: NotificationRecord, locale: Locale) {
  const messageParams = sanitizeTranslationParams(record.messageParams);
  const message = translate(locale, record.messageKey as any, messageParams);
  const actions = record.actions.map((action) => ({
    kind: action.kind,
    labelKey: action.labelKey,
    label: action.labelKey
      ? translate(locale, action.labelKey as any, messageParams)
      : (action.label ?? null),
  }));
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    messageKey: record.messageKey,
    messageParams,
    message,
    targetUrl: record.targetUrl,
    createdAt: record.createdAt.toISOString(),
    relativeTime: formatRelativeTime(record.createdAt, locale),
    metadata: record.metadata ?? {},
    actions,
    friendRequestId: record.friendRequestId,
    poolInvitationId: record.poolInvitationId,
  };
}
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'unread' ? 'unread' : 'all';
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const locale = getLocaleFromRequest(request);
  const { items, hasMore, nextCursor } = await listNotifications({
    userId,
    status,
    cursor,
  });
  const unreadCount = await prisma.notification.count({
    where: {
      userId,
      status: 'UNREAD',
    },
  });
  return data(
    {
      notifications: items.map((item) => serializeNotification(item, locale)),
      hasMore,
      nextCursor,
      unreadCount,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
