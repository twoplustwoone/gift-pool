import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { markNotificationRead } from '#app/utils/notifications.server.ts';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const userId = await requireUserId(request);
  const notificationId = params.id;
  if (!notificationId) {
    throw new Response('Notification id required', { status: 400 });
  }

  await markNotificationRead(userId, notificationId);
  const unreadCount = await prisma.notification.count({
    where: { userId, status: 'UNREAD' },
  });

  return json({ success: true, unreadCount });
}
