import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  createFriendInvite,
  getActiveFriendInvite,
  getActiveFriendInviteUrl,
} from '#app/utils/friend-invitations.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  const [inviteUrl, invitation] = await Promise.all([
    getActiveFriendInviteUrl(request),
    getActiveFriendInvite(request),
  ]);
  return {
    inviteUrl,
    invitation,
  };
}
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', {
      status: 405,
    });
  }
  // optional: allow overriding days via body
  let days: number | undefined;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body: any = await request.json().catch(() => ({}));
      if (typeof body?.days === 'number') days = body.days;
    } else {
      const form = await request.formData().catch(() => null);
      const raw = form?.get('days');
      if (typeof raw === 'string') days = Number.parseInt(raw, 10);
    }
  } catch {}
  const inviteUrl = await createFriendInvite(request, days);
  return {
    inviteUrl,
  };
}
