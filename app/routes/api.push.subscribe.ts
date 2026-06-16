import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { setNotificationPreference } from '#app/utils/notification-preferences.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from '#app/utils/notification-registry.ts';

// Shape of a browser PushSubscription as serialized by `subscription.toJSON()`.
const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  // When true (explicit opt-in), also flip pushEnabled on for every type so the
  // fanout actually sends. Re-registration (e.g. on page load) omits this so it
  // never clobbers the user's per-type push choices.
  enableAll: z.boolean().optional(),
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

  const { subscription, enableAll } = parsed.data;
  const { endpoint, keys } = subscription;
  const userAgent = request.headers.get('user-agent');

  // Endpoint is globally unique per device+browser. Upsert so the same device
  // re-subscribing (or a different user signing in on it) is reassigned rather
  // than duplicated.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });

  if (enableAll) {
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      await setNotificationPreference(
        userId,
        type as NotificationType,
        NOTIFICATION_CHANNELS.WEB_PUSH,
        true,
        'push:subscribe',
      );
    }
  }

  return data({ success: true });
}
