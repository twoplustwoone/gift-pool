import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  PoolInvitationError,
  sendPoolInvitations,
} from '#app/utils/pool-invitations.server.ts';

const SendInvitationsSchema = z.object({
  inviteeIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const managerId = await requireUserId(request);
  const poolId = params.poolId;
  if (!poolId) return data({ error: 'Pool not found.' }, { status: 404 });

  const parsed = SendInvitationsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data(
      { error: 'Choose at least one eligible person.' },
      { status: 400 },
    );
  }
  try {
    const invitations = await sendPoolInvitations({
      poolId,
      managerId,
      inviteeIds: parsed.data.inviteeIds,
    });
    return data({ success: true, invitations });
  } catch (error) {
    return invitationErrorResponse(error);
  }
}

function invitationErrorResponse(error: unknown) {
  if (!(error instanceof PoolInvitationError)) throw error;
  return data(
    { error: error.message, code: error.code },
    { status: error.status },
  );
}
