import { captureException } from '@sentry/react-router';
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { prisma } from '#app/utils/db.server.ts';

/**
 * Web Push delivery. This is a best-effort side channel that hangs off the
 * notification fanout — it must never throw into a mutation handler (mirrors
 * the side-effect-off-the-response pattern used by `queueLogEvent` and
 * `fanoutNotification`). Failures are tailed to Sentry; dead subscriptions are
 * pruned on the spot.
 *
 * When the VAPID env vars are unset (dev / CI), every call is a no-op so the
 * feature is inert without keys — the same approach as the ANTHROPIC_API_KEY
 * enrichment fallback.
 */

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

/**
 * Send a push to every registered subscription for a user. No-ops when VAPID is
 * unconfigured or the user has no subscriptions. Prunes subscriptions the push
 * service reports as gone (404/410).
 */
export async function sendWebPush(
  userId: string,
  message: WebPushMessage,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      const target: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(target, payload);
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the subscription is permanently gone — drop it so we
        // stop retrying a dead endpoint.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          return;
        }
        captureException(error, {
          tags: { feature: 'web-push' },
          extra: { userId, endpoint: sub.endpoint, statusCode },
        });
      }
    }),
  );
}
