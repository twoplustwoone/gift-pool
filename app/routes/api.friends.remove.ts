import { type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { removeFriend } from '#app/utils/friends.server.ts';
async function extractUserId(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return request
      .json()
      .then((body) => {
        if (typeof body !== 'object' || body === null) return null;
        const value = (body as Record<string, unknown>).userId;
        return typeof value === 'string' ? value : null;
      })
      .catch(() => null);
  }
  return request
    .formData()
    .then((formData) => {
      const value = formData.get('userId');
      return typeof value === 'string' && value.length > 0 ? value : null;
    })
    .catch(() => null);
}
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', {
      status: 405,
    });
  }
  const currentUserId = await requireUserId(request);
  const friendUserId = await extractUserId(request);
  if (!friendUserId) {
    throw new Response('userId is required', {
      status: 400,
    });
  }
  await removeFriend(currentUserId, friendUserId);
  return {
    success: true,
    relationship: {
      state: 'NONE',
    },
  };
}
