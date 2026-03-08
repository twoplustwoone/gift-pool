import { type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { markAllNotificationsRead } from '#app/utils/notifications.server.ts';
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', {
      status: 405,
    });
  }
  const userId = await requireUserId(request);
  await markAllNotificationsRead(userId);
  return {
    success: true,
    unreadCount: 0,
  };
}
