import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { captureException } from '@sentry/react-router';
// zodOutputFormat expects a zod v4 schema; the rest of the app stays on the
// classic v3 API, so the v4 import is scoped to this module.
import { z } from 'zod/v4';
import { dollarsToCents } from '#app/utils/price.ts';

// Claude Haiku fallback for product pages without usable structured data.
// One call per unfurl, only when the deterministic parser came up short.
// Every failure path returns null — enrichment must never break the editor.

const LLM_MODEL = 'claude-haiku-4-5';
const MAX_INPUT_CHARS = 10_000;

const LlmProductSchema = z.object({
  title: z.string().nullable(),
  // Major currency units (e.g. 19.99) — asking for cents invites unit bugs.
  price: z.number().nullable(),
  currency: z.string().nullable(),
});

export type LlmProductMetadata = {
  title: string | null;
  priceCents: number | null;
  currency: string | null;
};

export function isLlmEnrichmentEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient() {
  // timeout keeps the editor's blur interaction snappy; no retries — a miss
  // just means the user types the fields manually, like before this feature.
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 0 });
  return client;
}

export async function extractMetadataWithLlm(
  pageText: string,
  pageUrl: string,
): Promise<LlmProductMetadata | null> {
  if (!isLlmEnrichmentEnabled()) return null;

  try {
    const response = await getClient().messages.parse({
      model: LLM_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content:
            `Extract the product's title and current selling price from this product page text.\n` +
            `Page URL: ${pageUrl}\n` +
            `Rules: return null for any field you cannot determine confidently. ` +
            `"price" is the current selling price in major currency units (e.g. 19.99). ` +
            `"currency" is the ISO 4217 code (e.g. "USD"), or null if unclear.\n\n` +
            pageText.slice(0, MAX_INPUT_CHARS),
        },
      ],
      output_config: {
        format: zodOutputFormat(LlmProductSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) return null;

    const currency = parsed.currency?.trim().toUpperCase() ?? null;
    return {
      title: parsed.title?.trim() || null,
      priceCents:
        parsed.price != null && parsed.price > 0
          ? dollarsToCents(parsed.price)
          : null,
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    };
  } catch (error) {
    captureException(error, {
      extra: { source: 'wishlist-metadata-llm', pageUrl },
    });
    return null;
  }
}
