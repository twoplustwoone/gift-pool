import { data, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  acceptPoolInvitation,
  PoolInvitationError,
} from '#app/utils/pool-invitations.server.ts';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const userId = await requireUserId(request);
  if (!params.invitationId) {
    return data({ error: 'Invitation not found.' }, { status: 404 });
  }
  try {
    const result = await acceptPoolInvitation(params.invitationId, userId);
    return data({
      success: true,
      ...result,
      unreadCount: await unreadCount(userId),
    });
  } catch (error) {
    return invitationErrorResponse(error);
  }
}

function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, status: 'UNREAD' } });
}

function invitationErrorResponse(error: unknown) {
  if (!(error instanceof PoolInvitationError)) throw error;
  return data(
    { error: error.message, code: error.code },
    { status: error.status },
  );
}
