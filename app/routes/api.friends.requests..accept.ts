import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  acceptFriendRequest,
  getRelationshipDetails,
} from '#app/utils/friends.server.ts';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const requestId = params.id;
  if (!requestId) {
    throw new Response('Friend request id required', { status: 400 });
  }
  const actingUserId = await requireUserId(request);
  const requestRecord = await acceptFriendRequest(requestId, actingUserId);
  const otherUserId =
    requestRecord.fromUserId === actingUserId
      ? requestRecord.toUserId
      : requestRecord.fromUserId;
  const relationship = await getRelationshipDetails(actingUserId, otherUserId);
  const unreadCount = await prisma.notification.count({
    where: { userId: actingUserId, status: 'UNREAD' },
  });

  return json({ success: true, relationship, unreadCount });
}
