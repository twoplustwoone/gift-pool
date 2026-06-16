import { data, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

// Lightweight endpoint for the in-app bell's live polling — returns only the
// unread count so we don't refetch a page of notifications every interval.
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const unreadCount = await prisma.notification.count({
    where: { userId, status: 'UNREAD' },
  });
  return data({ unreadCount }, { headers: { 'Cache-Control': 'no-store' } });
}
