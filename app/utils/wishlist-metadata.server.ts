import { parse, type HTMLElement } from 'node-html-parser';
import { fetchHtml } from '#app/utils/wishlist-images.server.ts';
import {
  extractMetadataWithLlm,
  isLlmEnrichmentEnabled,
} from '#app/utils/wishlist-metadata-llm.server.ts';

export type UrlMetadataSource = 'structured' | 'llm' | 'mixed' | 'none';

export type UrlMetadata = {
  title: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  source: UrlMetadataSource;
};

export type UnfurlFailureOutcome =
  | 'fetch_failed'
  | 'blocked_url'
  | 'timeout'
  | 'too_large';

export type UnfurlResult =
  | { ok: true; metadata: UrlMetadata; llmAttempted: boolean; llmFailed: boolean }
  | { ok: false; outcome: UnfurlFailureOutcome };

// Reject obviously-corrupt prices: anything above $100M is parser noise.
const MAX_PRICE_CENTS = 100_000_000_00;

export function parsePriceToCents(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null) return null;

  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else {
    let cleaned = raw.replace(/[^\d.,]/g, '');
    if (!cleaned) return null;
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
      // Both separators present: the last one is the decimal separator.
      // "1,299.99" → 1299.99; "1.299,00" → 1299.00
      const decimal = lastDot > lastComma ? '.' : ',';
      const thousands = decimal === '.' ? ',' : '.';
      cleaned = cleaned
        .split(thousands)
        .join('')
        .replace(decimal, '.');
    } else if (lastComma !== -1 && /,\d{1,2}$/.test(cleaned)) {
      // Lone comma followed by 1-2 digits is an EU decimal comma: "19,99"
      cleaned = cleaned.replace(',', '.');
    } else {
      // Remaining commas are thousands separators: "1,299"
      cleaned = cleaned.replace(/,/g, '');
    }
    value = Number(cleaned);
  }

  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0 || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : null;
}

function resolveAbsoluteUrl(src: string | null | undefined, base: string) {
  if (!src) return null;
  try {
    const resolved = new URL(src, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

type JsonLdProduct = {
  name: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
};

function isProductNode(node: unknown): node is Record<string, unknown> {
  if (typeof node !== 'object' || node === null) return false;
  const type = (node as Record<string, unknown>)['@type'];
  if (typeof type === 'string') return type === 'Product';
  if (Array.isArray(type)) return type.includes('Product');
  return false;
}

function readOffer(offers: unknown): { price: number | null; currency: string | null } {
  const offerList = Array.isArray(offers) ? offers : [offers];
  for (const offer of offerList) {
    if (typeof offer !== 'object' || offer === null) continue;
    const record = offer as Record<string, unknown>;
    const price = parsePriceToCents(
      (record.price ?? record.lowPrice) as string | number | null | undefined,
    );
    if (price != null) {
      return { price, currency: normalizeCurrency(record.priceCurrency) };
    }
  }
  return { price: null, currency: null };
}

function readProductImage(image: unknown): string | null {
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    const first = image[0];
    if (typeof first === 'string') return first;
    image = first;
  }
  if (typeof image === 'object' && image !== null) {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === 'string') return url;
  }
  return null;
}

function parseJsonLdProduct(root: HTMLElement): JsonLdProduct | null {
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    const candidates: unknown[] = [];
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      candidates.push(node);
      if (typeof node === 'object' && node !== null) {
        const graph = (node as Record<string, unknown>)['@graph'];
        if (Array.isArray(graph)) candidates.push(...graph);
      }
    }

    // Prefer the first Product node that carries a price; fall back to any.
    let fallback: JsonLdProduct | null = null;
    for (const node of candidates) {
      if (!isProductNode(node)) continue;
      const name = typeof node.name === 'string' ? node.name.trim() : null;
      const image = readProductImage(node.image);
      const { price, currency } = readOffer(node.offers);
      const product = { name: name || null, image, price, currency };
      if (price != null) return product;
      fallback ??= product;
    }
    if (fallback) return fallback;
  }
  return null;
}

function readMeta(root: HTMLElement, selector: string) {
  const content = root.querySelector(selector)?.getAttribute('content')?.trim();
  return content || null;
}

export function parseMetadataFromHtml(
  html: string,
  baseUrl: string,
): UrlMetadata {
  return parseMetadataFromRoot(parse(html), baseUrl);
}

function parseMetadataFromRoot(root: HTMLElement, baseUrl: string): UrlMetadata {
  const product = parseJsonLdProduct(root);

  const title =
    product?.name ??
    readMeta(root, 'meta[property="og:title"]') ??
    readMeta(root, 'meta[name="twitter:title"]') ??
    (root.querySelector('title')?.textContent.trim() || null);

  const imageCandidate =
    product?.image ??
    readMeta(root, 'meta[property="og:image"]') ??
    readMeta(
      root,
      'meta[name="twitter:image"], meta[name="twitter:image:src"]',
    );

  const priceCents =
    product?.price ??
    parsePriceToCents(
      readMeta(root, 'meta[property="product:price:amount"]') ??
        readMeta(root, 'meta[property="og:price:amount"]'),
    );

  const currency =
    priceCents == null
      ? null
      : (product?.currency ??
        normalizeCurrency(
          readMeta(root, 'meta[property="product:price:currency"]') ??
            readMeta(root, 'meta[property="og:price:currency"]'),
        ));

  const found = title != null || imageCandidate != null || priceCents != null;

  return {
    title,
    imageUrl: resolveAbsoluteUrl(imageCandidate, baseUrl),
    priceCents,
    currency,
    source: found ? 'structured' : 'none',
  };
}

function classifyFetchError(error: unknown): UnfurlFailureOutcome {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      return 'timeout';
    }
    if (
      error.message.includes('Blocked') ||
      error.message.includes('Invalid URL host')
    ) {
      return 'blocked_url';
    }
    if (error.message.includes('Response too large')) {
      return 'too_large';
    }
  }
  return 'fetch_failed';
}

// Strip a parsed page down to text Claude can read: drop code/markup noise,
// keep the title and meta description up front where they survive the cap.
function stripRootToText(root: HTMLElement): string {
  const title = root.querySelector('title')?.textContent.trim() ?? '';
  const description =
    root
      .querySelector('meta[name="description"]')
      ?.getAttribute('content')
      ?.trim() ?? '';
  for (const node of root.querySelectorAll(
    'script, style, noscript, svg, template',
  )) {
    node.remove();
  }
  const body = root.querySelector('body')?.structuredText ?? root.structuredText;
  return [title, description, body].filter(Boolean).join('\n');
}

const AMAZON_HOST = /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/i;

const CURRENCY_SYMBOLS: Array<[string, string]> = [
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
];

function currencyFromSymbol(raw: string): string | null {
  return CURRENCY_SYMBOLS.find(([symbol]) => raw.includes(symbol))?.[1] ?? null;
}

// "Amazon.com: Apple AirPods Pro … : Electronics" → "Apple AirPods Pro …".
// The title comes from an untrusted page, so the suffix strip avoids
// backtracking-prone regex: locate the separator with lastIndexOf and test
// the remainder with a single unambiguous character class (linear).
function cleanAmazonTitle(raw: string): string | null {
  // Real product titles are far shorter; anything beyond this is junk and
  // bounds the work the regexes below can ever do.
  let title = raw
    .slice(0, 500)
    .replace(/^Amazon\.[a-z.]+\s*:\s*/i, '')
    .trim();
  const separator = title.lastIndexOf(' : ');
  if (
    separator !== -1 &&
    /^[A-Za-z ,&'-]+$/.test(title.slice(separator + 3))
  ) {
    title = title.slice(0, separator).trim();
  }
  return title || null;
}

// Amazon ships no og tags and no JSON-LD on product pages, so the generic
// parser only ever sees the <title>. The real values ARE in the fetched
// markup though: the buybox price in `.a-offscreen` spans and the product
// image in the image-block JSON. Fill only the gaps the generic parse left.
// (Datacenter IPs often get a bot-wall instead — then nothing here matches
// and the result degrades exactly as before.)
export function applyAmazonAdapter(
  html: string,
  root: HTMLElement,
  baseUrl: string,
  metadata: UrlMetadata,
): UrlMetadata {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return metadata;
  }
  if (!AMAZON_HOST.test(hostname)) return metadata;

  const title = metadata.title ? cleanAmazonTitle(metadata.title) : null;

  let priceCents = metadata.priceCents;
  let currency = metadata.currency;
  if (priceCents == null) {
    // First `.a-offscreen` in DOM order is the buybox price.
    const rawPrice = root.querySelector('span.a-offscreen')?.textContent.trim();
    const parsed = parsePriceToCents(rawPrice);
    if (rawPrice && parsed != null) {
      priceCents = parsed;
      currency = currencyFromSymbol(rawPrice);
    }
  }

  let imageUrl = metadata.imageUrl;
  if (!imageUrl) {
    const landing = root.querySelector('#landingImage');
    const candidate =
      landing?.getAttribute('data-old-hires') ||
      landing?.getAttribute('src') ||
      html.match(/"hiRes":"(https:[^"]+?)"/)?.[1] ||
      null;
    imageUrl = resolveAbsoluteUrl(candidate, baseUrl);
  }

  const foundAnything =
    title != null || priceCents != null || imageUrl != null;

  return {
    title,
    imageUrl,
    priceCents,
    currency,
    source: foundAnything ? 'structured' : metadata.source,
  };
}

export async function extractUrlMetadata(itemUrl: string): Promise<UnfurlResult> {
  let html: string;
  try {
    html = await fetchHtml(itemUrl, { truncate: true });
  } catch (error) {
    return { ok: false, outcome: classifyFetchError(error) };
  }

  const root = parse(html);
  const structured = applyAmazonAdapter(
    html,
    root,
    itemUrl,
    parseMetadataFromRoot(root, itemUrl),
  );

  // The LLM is a fallback, not a second opinion: it only runs when the
  // deterministic parse is missing title or price, and deterministic values
  // always win the merge.
  const needsLlm = !structured.title || structured.priceCents == null;
  if (!needsLlm || !isLlmEnrichmentEnabled()) {
    return { ok: true, metadata: structured, llmAttempted: false, llmFailed: false };
  }

  const llm = await extractMetadataWithLlm(stripRootToText(root), itemUrl);
  if (!llm) {
    return { ok: true, metadata: structured, llmAttempted: true, llmFailed: true };
  }

  const hadStructuredData =
    structured.title != null || structured.priceCents != null;
  const merged: UrlMetadata = {
    title: structured.title ?? llm.title,
    imageUrl: structured.imageUrl, // the LLM never supplies images
    priceCents: structured.priceCents ?? llm.priceCents,
    currency: structured.currency ?? llm.currency,
    source:
      llm.title != null || llm.priceCents != null
        ? hadStructuredData
          ? 'mixed'
          : 'llm'
        : structured.source,
  };
  // Keep the invariant: currency only ever accompanies a price.
  if (merged.priceCents == null) merged.currency = null;

  return { ok: true, metadata: merged, llmAttempted: true, llmFailed: false };
}
