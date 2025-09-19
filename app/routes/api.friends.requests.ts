import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  getRelationshipDetails,
  sendFriendRequest,
} from '#app/utils/friends.server.ts';

function extractToUserId(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return request
      .json()
      .then((body) => {
        if (typeof body !== 'object' || body === null) return null;
        const value = (body as Record<string, unknown>).toUserId;
        return typeof value === 'string' ? value : null;
      })
      .catch(() => null);
  }

  return request
    .formData()
    .then((formData) => {
      const value = formData.get('toUserId');
      return typeof value === 'string' && value.length > 0 ? value : null;
    })
    .catch(() => null);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  const userId = await requireUserId(request);
  const toUserId = await extractToUserId(request);
  if (!toUserId) {
    throw new Response('toUserId is required', { status: 400 });
  }

  const requestRecord = await sendFriendRequest(userId, toUserId);
  const relationship = await getRelationshipDetails(userId, toUserId);

  return json({
    success: true,
    requestId: requestRecord.id,
    relationship,
  });
}
