import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import type {
  NotificationChannel,
  NotificationType,
} from '#app/utils/notification-registry.ts';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const TOKEN_VERSION = 1;

interface PreferenceTokenPayload {
  v: number;
  uid: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  exp: number;
}

function getSecret() {
  return process.env.NOTIFICATION_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? 'SESSION_SECRET';
}

function encodePayload(payload: PreferenceTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): PreferenceTokenPayload {
  const json = Buffer.from(encoded, 'base64url').toString('utf8');
  return JSON.parse(json) as PreferenceTokenPayload;
}

function sign(encoded: string) {
  return createHmac('sha256', getSecret()).update(encoded).digest('base64url');
}

export async function createPreferenceToken({
  userId,
  type,
  channel,
  ttlMs = TOKEN_TTL_MS,
}: {
  userId: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  ttlMs?: number;
}) {
  const payload: PreferenceTokenPayload = {
    v: TOKEN_VERSION,
    uid: userId,
    type,
    channel,
    exp: Date.now() + ttlMs,
  };
  const encoded = encodePayload(payload);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyPreferenceToken(token: string) {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expectedSignature = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }
  let payload: PreferenceTokenPayload;
  try {
    payload = decodePayload(encoded);
  } catch (error) {
    return null;
  }
  if (payload.exp < Date.now()) return null;
  return payload;
}

export function getPreferenceManagementUrl(token: string) {
  return buildAppUrl(`/settings/notifications?token=${token}`);
}
