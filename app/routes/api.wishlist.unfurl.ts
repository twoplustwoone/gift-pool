import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { cachified, lruCache } from '#app/utils/cache.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { extractUrlMetadata } from '#app/utils/wishlist-metadata.server.ts';

// Every lookup is an outbound page fetch and, on a page the deterministic
// parser can't crack, a paid LLM call — and nothing about a product page
// changes minute to minute. Caching the result keeps a user who presses
// refresh twice (or two people wishing for the same product) from paying for
// it twice. Instance-local by design: this is request de-duplication, not a
// source of truth, and LiteFS replicas each keeping their own copy is fine.
const UNFURL_SUCCESS_TTL_MS = 5 * 60 * 1000;
// Failures are cached too, far more briefly: enough to stop a bot-walled site
// being hammered by repeat presses, short enough that a transient timeout
// doesn't make the link look broken for five minutes.
const UNFURL_FAILURE_TTL_MS = 30 * 1000;

// Exported so tests can purge between cases, matching the admin-cache pattern.
export const unfurlCacheKey = (url: string) => `unfurl:v1:${url}`;

const UnfurlSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Only http(s) URLs are supported'),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserId(request);
  if (!userId) {
    return data({ result: null }, { status: 401 });
  }

  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: UnfurlSchema });
  if (submission.status !== 'success') {
    return data({ result: null }, { status: 400 });
  }

  const { url } = submission.value;
  const startedAt = Date.now();
  let servedFresh = false;
  const unfurl = await cachified({
    key: unfurlCacheKey(url),
    cache: lruCache,
    ttl: UNFURL_SUCCESS_TTL_MS,
    getFreshValue: async (context) => {
      servedFresh = true;
      const result = await extractUrlMetadata(url);
      if (!result.ok) context.metadata.ttl = UNFURL_FAILURE_TTL_MS;
      return result;
    },
  });
  const durationMs = Date.now() - startedAt;

  const metadata = unfurl.ok ? unfurl.metadata : null;
  const foundAnything =
    metadata != null &&
    (metadata.title != null ||
      metadata.priceCents != null ||
      metadata.imageUrl != null);

  let outcome: string;
  if (!unfurl.ok) {
    outcome = unfurl.outcome;
  } else {
    outcome = foundAnything ? 'success' : 'nothing_found';
  }

  // Fires on success AND failure with an outcome discriminator — the admin
  // enrichment funnel and failure breakdown are both built from these rows.
  const { requestId } = await getRequestContext(request);
  queueLogEvent({
    name: 'wishlist_unfurl_completed',
    userId,
    source: 'server',
    requestId,
    properties: {
      host: new URL(url).hostname,
      outcome,
      foundTitle: metadata?.title != null,
      foundPrice: metadata?.priceCents != null,
      foundImage: metadata?.imageUrl != null,
      source: metadata?.source ?? 'none',
      // Cache hits are real user actions and still count, but they cost
      // nothing and return in ~0ms — the admin health view needs to be able
      // to separate them from live lookups.
      cached: !servedFresh,
      llmAttempted: unfurl.ok ? unfurl.llmAttempted : false,
      llmFailed: unfurl.ok ? unfurl.llmFailed : false,
      durationMs,
    },
  });

  // Always 200 once authed+valid: enrichment failure must never break the
  // editor flow — the client just leaves the fields for the user to type.
  return data({ result: foundAnything ? metadata : null });
}
