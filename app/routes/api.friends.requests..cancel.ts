import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  cancelOutgoingRequest,
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
  const requestRecord = await cancelOutgoingRequest(actingUserId, requestId);
  const relationship = await getRelationshipDetails(
    actingUserId,
    requestRecord.toUserId,
  );
  return json({ success: true, relationship });
}
