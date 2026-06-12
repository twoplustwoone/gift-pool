import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { extractUrlMetadata } from '#app/utils/wishlist-metadata.server.ts';

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
  const unfurl = await extractUrlMetadata(url);
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
      llmAttempted: unfurl.ok ? unfurl.llmAttempted : false,
      llmFailed: unfurl.ok ? unfurl.llmFailed : false,
      durationMs,
    },
  });

  // Always 200 once authed+valid: enrichment failure must never break the
  // editor flow — the client just leaves the fields for the user to type.
  return data({ result: foundAnything ? metadata : null });
}
