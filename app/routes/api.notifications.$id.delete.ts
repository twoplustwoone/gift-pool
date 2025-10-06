import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const userId = await requireUserId(request);
  const id = params.id;
  if (!id) throw new Response('Notification id required', { status: 400 });

  await prisma.notification.deleteMany({ where: { id, userId } });
  const unreadCount = await prisma.notification.count({
    where: { userId, status: 'UNREAD' },
  });
  return json({ success: true, unreadCount });
}
