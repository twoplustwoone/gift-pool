import { data, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  cancelPoolInvitation,
  PoolInvitationError,
} from '#app/utils/pool-invitations.server.ts';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const managerId = await requireUserId(request);
  if (!params.invitationId) {
    return data({ error: 'Invitation not found.' }, { status: 404 });
  }
  try {
    return data({
      success: true,
      ...(await cancelPoolInvitation({
        invitationId: params.invitationId,
        managerId,
      })),
    });
  } catch (error) {
    if (!(error instanceof PoolInvitationError)) throw error;
    return data(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
}
