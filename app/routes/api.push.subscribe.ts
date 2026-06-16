import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

// Shape of a browser PushSubscription as serialized by `subscription.toJSON()`.
const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return data({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get('user-agent');

  // Endpoint is globally unique per device+browser. Upsert so the same device
  // re-subscribing (or a different user signing in on it) is reassigned rather
  // than duplicated.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });

  return data({ success: true });
}
