import { captureException } from '@sentry/react-router';
import webpush, {
  type PushSubscription as WebPushSubscription,
} from 'web-push';
import { prisma } from '#app/utils/db.server.ts';

/** Web Push adapter implementation. Endpoint failures stay isolated here. */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface WebPushMessage {
  title: string;
  body: string;
  /** In-app path opened when the notification is clicked (e.g. "/friends"). */
  url: string;
  /** Collapse key so repeat notifications replace rather than stack. */
  tag?: string;
}

export type WebPushDeliveryResult =
  | { status: 'delivered'; attempted: number; delivered: number }
  | { status: 'unavailable'; attempted: 0; delivered: 0 }
  | { status: 'failed'; attempted: number; delivered: 0 };

export async function hasWebPushCapability(userId: string): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const subscription = await prisma.pushSubscription.findFirst({
    where: { userId },
    select: { id: true },
  });
  return Boolean(subscription);
}

/**
 * Send a push to every registered subscription for a user. No-ops when VAPID is
 * unconfigured or the user has no subscriptions. Prunes subscriptions the push
 * service reports as gone (404/410).
 */
export async function sendWebPush(
  userId: string,
  message: WebPushMessage,
): Promise<WebPushDeliveryResult> {
  if (!ensureConfigured()) {
    return { status: 'unavailable', attempted: 0, delivered: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) {
    return { status: 'unavailable', attempted: 0, delivered: 0 };
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  });

  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const target: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(target, payload);
        return true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the subscription is permanently gone — drop it so we
        // stop retrying a dead endpoint.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          return false;
        }
        captureException(error, {
          tags: { feature: 'web-push' },
          extra: { userId, endpoint: sub.endpoint, statusCode },
        });
        return false;
      }
    }),
  );

  const delivered = results.filter(Boolean).length;
  if (delivered > 0) {
    return {
      status: 'delivered',
      attempted: subscriptions.length,
      delivered,
    };
  }
  return { status: 'failed', attempted: subscriptions.length, delivered: 0 };
}
