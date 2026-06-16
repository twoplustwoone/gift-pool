import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test'] as const),
  DATABASE_PATH: z.string(),
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string(),
  INTERNAL_COMMAND_TOKEN: z.string(),
  HONEYPOT_SECRET: z.string(),
  CACHE_DATABASE_PATH: z.string(),
  // If you plan on using Sentry, uncomment this line
  SENTRY_DSN: z.string(),
  NOTIFICATION_TOKEN_SECRET: z.string().optional(),
  // If you plan to use Resend, uncomment this line
  // RESEND_API_KEY: z.string(),
  // Optional: CC every feedback operator-notification to a monitored inbox.
  // Set as a Fly secret in prod; left unset in dev/test/CI (no CC, no-op).
  FEEDBACK_CC_EMAIL: z.string().email().optional(),
  // Optional: Amazon Associates tracking ID (e.g. "giftpool-20"). When unset,
  // /out redirects pass product links through untagged.
  AMAZON_AFFILIATE_TAG: z.string().optional(),
  // Optional: enables the Claude Haiku fallback for product-page metadata
  // extraction. When unset, enrichment is structured-data only.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional: Web Push (VAPID) keys. Generate with `npx web-push
  // generate-vapid-keys`. When unset (dev/CI), push send is a no-op and the
  // subscribe UI hides itself. Only VAPID_PUBLIC_KEY is exposed to the client.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Contact URI for the push service (e.g. "mailto:you@example.com").
  VAPID_SUBJECT: z.string().optional(),
  // If you plan to use GitHub auth, remove the default:
  GITHUB_CLIENT_ID: z.string().default('MOCK_GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: z.string().default('MOCK_GITHUB_CLIENT_SECRET'),
  GITHUB_TOKEN: z.string().default('MOCK_GITHUB_TOKEN'),
  ALLOW_INDEXING: z.enum(['true', 'false']).optional(),
});

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof schema> {}
  }
}

export function init() {
  const parsed = schema.safeParse(process.env);

  if (parsed.success === false) {
    console.error(
      '❌ Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );

    throw new Error('Invalid environment variables');
  }
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getPublicEnv() {
  return {
    MODE: process.env.NODE_ENV,
    SENTRY_DSN: process.env.SENTRY_DSN,
    ALLOW_INDEXING: process.env.ALLOW_INDEXING,
    // Public VAPID key — the client needs it to subscribe to push. Safe to
    // expose; the private key stays server-side.
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  };
}

export { getPublicEnv as getEnv };

type ENV = ReturnType<typeof getPublicEnv>;

declare global {
  var ENV: ENV;
  interface Window {
    ENV: ENV;
  }
}
