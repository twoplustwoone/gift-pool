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
  'fetch_failed' | 'blocked_url' | 'blocked_bot' | 'timeout' | 'too_large';

export type UnfurlResult =
  | {
      ok: true;
      metadata: UrlMetadata;
      llmAttempted: boolean;
      llmFailed: boolean;
    }
  | { ok: false; outcome: UnfurlFailureOutcome };

// Reject obviously-corrupt prices: anything above $100M is parser noise.
const MAX_PRICE_CENTS = 10_000_000_000;

// "$1,299.99" → 1299.99; "1.299,00" → 1299.00; "19,99" → 19.99
function priceStringToNumber(raw: string): number {
  let cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return Number.NaN;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators present: the last one is the decimal separator.
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    cleaned = cleaned.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1 && /,\d{1,2}$/.test(cleaned)) {
    // Lone comma followed by 1-2 digits is an EU decimal comma: "19,99"
    cleaned = cleaned.replace(',', '.');
  } else {
    // Remaining commas are thousands separators: "1,299"
    cleaned = cleaned.replaceAll(',', '');
  }
  return Number(cleaned);
}

export function parsePriceToCents(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null) return null;

  const value = typeof raw === 'number' ? raw : priceStringToNumber(raw);
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

// Take the first candidate that resolves to an http(s) URL. Candidate lists
// routinely start with junk — data: placeholders, `javascript:`, empty strings
// — and a single-candidate lookup would give up on the whole page instead of
// trying the next source.
function firstResolvableUrl(
  candidates: Array<string | null | undefined>,
  base: string,
): string | null {
  for (const candidate of candidates) {
    const resolved = resolveAbsoluteUrl(candidate, base);
    if (resolved) return resolved;
  }
  return null;
}

const CURRENCY_SYMBOLS: Array<[string, string]> = [
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
];

function currencyFromSymbol(raw: string): string | null {
  return CURRENCY_SYMBOLS.find(([symbol]) => raw.includes(symbol))?.[1] ?? null;
}

type JsonLdProduct = {
  name: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
};

// ProductGroup is what a "see options" listing (one page, many variants) is
// modelled as; IndividualProduct shows up on marketplaces that split listings.
const PRODUCT_TYPES = new Set(['Product', 'ProductGroup', 'IndividualProduct']);

function isProductNode(node: unknown): node is Record<string, unknown> {
  if (typeof node !== 'object' || node === null) return false;
  const type = (node as Record<string, unknown>)['@type'];
  if (typeof type === 'string') return PRODUCT_TYPES.has(type);
  if (Array.isArray(type)) {
    return type.some((t) => typeof t === 'string' && PRODUCT_TYPES.has(t));
  }
  return false;
}

// Offers nest in practice: an AggregateOffer wrapping per-variant Offers, or an
// Offer whose amount lives in a priceSpecification. Depth is bounded so a
// hostile document can't drive unbounded recursion.
function readOffer(
  offers: unknown,
  depth = 0,
): { price: number | null; currency: string | null } {
  if (depth > 3) return { price: null, currency: null };

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

    for (const nestedSource of [record.priceSpecification, record.offers]) {
      if (nestedSource == null) continue;
      const nested = readOffer(nestedSource, depth + 1);
      if (nested.price != null) {
        return {
          price: nested.price,
          currency: nested.currency ?? normalizeCurrency(record.priceCurrency),
        };
      }
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

function productFromNode(node: Record<string, unknown>): JsonLdProduct {
  const name = typeof node.name === 'string' ? node.name.trim() : null;
  let image = readProductImage(node.image);
  let { price, currency } = readOffer(node.offers);

  // A ProductGroup ("see options") often carries no offer of its own — the
  // prices hang off its variants. Any variant price beats no price at all.
  if (price == null && Array.isArray(node.hasVariant)) {
    for (const variant of node.hasVariant) {
      if (typeof variant !== 'object' || variant === null) continue;
      const record = variant as Record<string, unknown>;
      const offer = readOffer(record.offers);
      if (offer.price == null) continue;
      price = offer.price;
      currency = offer.currency;
      image ??= readProductImage(record.image);
      break;
    }
  }

  return { name: name || null, image, price, currency };
}

// Flatten a parsed JSON-LD document into candidate nodes, unwrapping arrays
// and @graph containers.
function collectJsonLdCandidates(parsed: unknown): unknown[] {
  const candidates: unknown[] = [];
  for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
    candidates.push(node);
    if (typeof node === 'object' && node !== null) {
      const graph = (node as Record<string, unknown>)['@graph'];
      if (Array.isArray(graph)) candidates.push(...graph);
    }
  }
  return candidates;
}

// Prefer the first Product node that carries a price; fall back to any.
function productFromJsonLdScript(scriptText: string): JsonLdProduct | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(scriptText);
  } catch {
    return null;
  }

  let fallback: JsonLdProduct | null = null;
  for (const node of collectJsonLdCandidates(parsed)) {
    if (!isProductNode(node)) continue;
    const product = productFromNode(node);
    if (product.price != null) return product;
    fallback ??= product;
  }
  return fallback;
}

function parseJsonLdProduct(root: HTMLElement): JsonLdProduct | null {
  let fallback: JsonLdProduct | null = null;
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    const product = productFromJsonLdScript(script.textContent);
    if (!product) continue;
    if (product.price != null) return product;
    fallback ??= product;
  }
  return fallback;
}

function readMeta(root: HTMLElement, selector: string) {
  const content = root.querySelector(selector)?.getAttribute('content')?.trim();
  return content || null;
}

function readAttr(root: HTMLElement, selector: string, attribute: string) {
  const value = root.querySelector(selector)?.getAttribute(attribute)?.trim();
  return value || null;
}

export function parseMetadataFromHtml(
  html: string,
  baseUrl: string,
): UrlMetadata {
  return parseMetadataFromRoot(parse(html), baseUrl);
}

function parseMetadataFromRoot(
  root: HTMLElement,
  baseUrl: string,
): UrlMetadata {
  const product = parseJsonLdProduct(root);

  const title =
    product?.name ??
    readMeta(root, 'meta[property="og:title"]') ??
    // A handful of storefronts emit the OG tags with `name=` instead of
    // `property=`; browsers and scrapers accept both, so we do too.
    readMeta(root, 'meta[name="og:title"]') ??
    readMeta(root, 'meta[name="twitter:title"]') ??
    readMeta(root, 'meta[property="twitter:title"]') ??
    readMeta(root, 'meta[itemprop="name"]') ??
    (root.querySelector('title')?.textContent.trim() || null);

  const imageUrl = firstResolvableUrl(
    [
      product?.image,
      readMeta(root, 'meta[property="og:image"]'),
      readMeta(root, 'meta[property="og:image:secure_url"]'),
      readMeta(root, 'meta[name="og:image"]'),
      readMeta(
        root,
        'meta[name="twitter:image"], meta[name="twitter:image:src"]',
      ),
      readMeta(root, 'meta[property="twitter:image"]'),
      readMeta(root, 'meta[itemprop="image"]'),
      readAttr(root, 'link[rel="image_src"]', 'href'),
    ],
    baseUrl,
  );

  const priceCents =
    product?.price ??
    parsePriceToCents(
      readMeta(root, 'meta[property="product:price:amount"]') ??
        readMeta(root, 'meta[property="og:price:amount"]') ??
        readMeta(root, 'meta[property="og:product:price:amount"]') ??
        readMeta(root, 'meta[itemprop="price"]'),
    );

  const currency =
    priceCents == null
      ? null
      : (product?.currency ??
        normalizeCurrency(
          readMeta(root, 'meta[property="product:price:currency"]') ??
            readMeta(root, 'meta[property="og:price:currency"]') ??
            readMeta(root, 'meta[itemprop="priceCurrency"]'),
        ));

  const found = title != null || imageUrl != null || priceCents != null;

  return {
    title,
    imageUrl,
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
  const body =
    root.querySelector('body')?.structuredText ?? root.structuredText;
  return [title, description, body].filter(Boolean).join('\n');
}

// A site adapter fills gaps the generic parse left on a host whose markup we
// know. `botWalled` means the page we got is an anti-scraping interstitial, not
// the product — its "metadata" is worse than nothing, so callers discard it.
type AdapterResult = { metadata: UrlMetadata; botWalled?: boolean };

// Every non-empty value for the given attributes, in selector order — feed
// straight into `firstResolvableUrl`.
function attrValues(
  root: HTMLElement,
  selectors: string[],
  attributes: string[],
): string[] {
  const values: string[] = [];
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute)?.trim();
        if (value) values.push(value);
      }
    }
  }
  return values;
}

function priceFromSelectors(
  root: HTMLElement,
  selectors: string[],
  { requirePriceShape = false }: { requirePriceShape?: boolean } = {},
): { priceCents: number; currency: string | null } | null {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const raw = element.textContent.trim();
      if (!raw || raw.length > 40) continue;
      // Some selectors are generic enough to also match non-price text (see
      // `.a-offscreen` below); those callers demand something price-shaped.
      if (requirePriceShape && !/[$€£¥₹]|\d[.,]\d{2}(\D|$)/.test(raw)) continue;
      const priceCents = parsePriceToCents(raw);
      if (priceCents == null) continue;
      return { priceCents, currency: currencyFromSymbol(raw) };
    }
  }
  return null;
}

// a.co and amzn.* are the share/short links the Amazon mobile apps hand out.
// They normally redirect to a real amazon.* URL (which is what we end up
// matching on), but keep them here so a non-redirecting hop still adapts.
const AMAZON_HOST =
  /(^|\.)(amazon\.[a-z]{2,3}(\.[a-z]{2})?|a\.co|amzn\.(to|eu|asia))$/i;

const ETSY_HOST = /(^|\.)etsy\.com$/i;

// Amazon serves a CAPTCHA interstitial to datacenter IPs. It is a 200 with a
// perfectly parseable <title>, so without this check we prefill items titled
// "Amazon.com" and no image, which reads as a broken feature.
const AMAZON_BOT_WALL_TITLES = new Set([
  'amazon.com',
  'amazon.com. spend less. smile more.',
  'robot check',
  'bot check',
  'amazon captcha',
  'sorry! something went wrong!',
]);

function isAmazonBotWall(root: HTMLElement, rawTitle: string | null): boolean {
  if (
    root.querySelector('form[action*="validateCaptcha"]') ||
    root.querySelector('#captchacharacters')
  ) {
    return true;
  }
  const title = rawTitle?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  return AMAZON_BOT_WALL_TITLES.has(title);
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
  if (separator !== -1 && /^[A-Za-z ,&'-]+$/.test(title.slice(separator + 3))) {
    title = title.slice(0, separator).trim();
  }
  return title || null;
}

// Ordered most- to least-specific. The core price containers come first so a
// struck-through list price or an accessory's price never wins; `.a-price-range`
// is what a "see options" parent shows instead of a buybox price, and its low
// end is the only number on the page.
const AMAZON_PRICE_SELECTORS = [
  '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
  '#corePrice_feature_div .a-price .a-offscreen',
  '#corePrice_desktop .a-offscreen',
  '#apex_desktop .a-price .a-offscreen',
  '#price_inside_buybox',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '#priceblock_saleprice',
  '.a-price-range .a-offscreen',
  '.a-price .a-offscreen',
  'span.a-offscreen',
];

// #landingImage is the standard product image; the others cover books, the
// variation ("see options") layout, and the generic image block.
const AMAZON_IMAGE_SELECTORS = [
  '#landingImage',
  '#imgBlkFront',
  '#ebooksImgBlkFront',
  '#imgTagWrapperId img',
  '#main-image-container img',
  '#image-block img',
  '#altImages img',
];

// `data-a-dynamic-image` maps every rendition to its [width, height]; the
// largest is the one worth storing.
function largestDynamicImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replaceAll('&quot;', '"'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  let best: string | null = null;
  let bestWidth = -1;
  for (const [url, size] of Object.entries(parsed as Record<string, unknown>)) {
    const width =
      Array.isArray(size) && typeof size[0] === 'number' ? size[0] : 0;
    if (width > bestWidth) {
      bestWidth = width;
      best = url;
    }
  }
  return best;
}

function amazonImageCandidates(root: HTMLElement, html: string) {
  const candidates: Array<string | null> = [];
  for (const selector of AMAZON_IMAGE_SELECTORS) {
    const element = root.querySelector(selector);
    if (!element) continue;
    candidates.push(
      element.getAttribute('data-old-hires') ?? null,
      largestDynamicImageUrl(element.getAttribute('data-a-dynamic-image')),
      element.getAttribute('src') ?? null,
    );
  }
  // Last resort: the image-block bootstrap JSON, which survives even when the
  // markup around it was rewritten. Bounded character class, no backtracking.
  candidates.push(
    /"hiRes"\s*:\s*"(https:[^"]{0,500}?)"/.exec(html)?.[1] ?? null,
    /"large"\s*:\s*"(https:[^"]{0,500}?)"/.exec(html)?.[1] ?? null,
  );
  return candidates;
}

// Amazon ships no og tags and no JSON-LD on product pages, so the generic
// parser only ever sees the <title>. The real values ARE in the fetched
// markup though: the price in one of the price widgets and the product image
// in the image block. Fill only the gaps the generic parse left.
export function applyAmazonAdapter(
  html: string,
  root: HTMLElement,
  baseUrl: string,
  metadata: UrlMetadata,
): AdapterResult {
  if (isAmazonBotWall(root, metadata.title)) {
    return {
      metadata: {
        title: null,
        imageUrl: null,
        priceCents: null,
        currency: null,
        source: 'none',
      },
      botWalled: true,
    };
  }

  const title = metadata.title ? cleanAmazonTitle(metadata.title) : null;

  let priceCents = metadata.priceCents;
  let currency = metadata.currency;
  if (priceCents == null) {
    const price = priceFromSelectors(root, AMAZON_PRICE_SELECTORS, {
      requirePriceShape: true,
    });
    if (price) {
      priceCents = price.priceCents;
      currency = price.currency;
    }
  }

  const imageUrl =
    metadata.imageUrl ??
    firstResolvableUrl(amazonImageCandidates(root, html), baseUrl);

  const foundAnything = title != null || priceCents != null || imageUrl != null;

  return {
    metadata: {
      title,
      imageUrl,
      priceCents,
      currency,
      source: foundAnything ? 'structured' : metadata.source,
    },
  };
}

// "Personalised Mug - Etsy" / "Personalised Mug | Etsy Canada" → "Personalised
// Mug". Bounded repetition keeps this linear on untrusted input.
function cleanEtsyTitle(raw: string): string | null {
  const title = raw.slice(0, 500).trim();
  const suffix = /\s*[-|–]\s*Etsy(?:\s+[\p{L}.]{1,20}){0,2}\s*$/u.exec(title);
  const cleaned = suffix ? title.slice(0, suffix.index).trim() : title;
  return cleaned || null;
}

// Etsy's buy box renders the amount and its symbol in separate spans, so the
// value selectors are numbers without a currency marker — the symbol is read
// alongside them.
const ETSY_PRICE_SELECTORS = [
  '[data-buy-box-region="price"] .currency-value',
  '[data-selector="price-only"] .currency-value',
  '[data-appears-component-name="price"] .currency-value',
  '.wt-text-title-larger .currency-value',
  '[data-buy-box-region="price"] p',
];

const ETSY_IMAGE_SELECTORS = [
  'img[data-palette-listing-image]',
  '[data-palette-listing-image] img',
  '.listing-page-image-carousel-component img',
  '#image-carousel img',
];

// Etsy does ship og tags and JSON-LD, but the JSON-LD sits at the very bottom
// of a multi-megabyte document (so a truncated fetch can miss it) and the og
// title carries a marketplace suffix. Clean the title, and reach into the buy
// box for anything the generic parse missed.
export function applyEtsyAdapter(
  root: HTMLElement,
  baseUrl: string,
  metadata: UrlMetadata,
): AdapterResult {
  const title = metadata.title ? cleanEtsyTitle(metadata.title) : null;

  let priceCents = metadata.priceCents;
  let currency = metadata.currency;
  if (priceCents == null) {
    const price = priceFromSelectors(root, ETSY_PRICE_SELECTORS);
    if (price) {
      priceCents = price.priceCents;
      currency =
        price.currency ??
        currencyFromSymbol(
          root
            .querySelector(
              '[data-buy-box-region="price"] .currency-symbol, .currency-symbol',
            )
            ?.textContent.trim() ?? '',
        ) ??
        normalizeCurrency(readMeta(root, 'meta[itemprop="priceCurrency"]'));
    }
  }

  const imageUrl =
    metadata.imageUrl ??
    firstResolvableUrl(
      attrValues(root, ETSY_IMAGE_SELECTORS, ['src', 'data-src']),
      baseUrl,
    );

  const foundAnything = title != null || priceCents != null || imageUrl != null;

  return {
    metadata: {
      title,
      imageUrl,
      priceCents,
      currency,
      source: foundAnything ? 'structured' : metadata.source,
    },
  };
}

export function applySiteAdapters(
  html: string,
  root: HTMLElement,
  baseUrl: string,
  metadata: UrlMetadata,
): AdapterResult {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return { metadata };
  }

  if (AMAZON_HOST.test(hostname)) {
    return applyAmazonAdapter(html, root, baseUrl, metadata);
  }
  if (ETSY_HOST.test(hostname)) {
    return applyEtsyAdapter(root, baseUrl, metadata);
  }
  return { metadata };
}

export async function extractUrlMetadata(
  itemUrl: string,
): Promise<UnfurlResult> {
  let html: string;
  // Short links (a.co/d/…, amzn.to/…) and marketplace locale redirects mean the
  // document we parse frequently comes from a different URL than the one the
  // user pasted. Everything downstream — relative URL resolution and host
  // adapter selection — keys off where the body actually came from.
  let pageUrl = itemUrl;
  try {
    const fetched = await fetchHtml(itemUrl, { truncate: true });
    html = fetched.html;
    pageUrl = fetched.finalUrl;
  } catch (error) {
    return { ok: false, outcome: classifyFetchError(error) };
  }

  const root = parse(html);
  const adapted = applySiteAdapters(
    html,
    root,
    pageUrl,
    parseMetadataFromRoot(root, pageUrl),
  );
  if (adapted.botWalled) {
    return { ok: false, outcome: 'blocked_bot' };
  }
  const structured = adapted.metadata;

  // The LLM is a fallback, not a second opinion: it only runs when the
  // deterministic parse is missing title or price, and deterministic values
  // always win the merge.
  const needsLlm = !structured.title || structured.priceCents == null;
  if (!needsLlm || !isLlmEnrichmentEnabled()) {
    return {
      ok: true,
      metadata: structured,
      llmAttempted: false,
      llmFailed: false,
    };
  }

  const llm = await extractMetadataWithLlm(stripRootToText(root), pageUrl);
  if (!llm) {
    return {
      ok: true,
      metadata: structured,
      llmAttempted: true,
      llmFailed: true,
    };
  }

  const hadStructuredData =
    structured.title != null || structured.priceCents != null;
  let source: UrlMetadataSource = structured.source;
  if (llm.title != null || llm.priceCents != null) {
    source = hadStructuredData ? 'mixed' : 'llm';
  }
  const merged: UrlMetadata = {
    title: structured.title ?? llm.title,
    imageUrl: structured.imageUrl, // the LLM never supplies images
    priceCents: structured.priceCents ?? llm.priceCents,
    currency: structured.currency ?? llm.currency,
    source,
  };
  // Keep the invariant: currency only ever accompanies a price.
  if (merged.priceCents == null) merged.currency = null;

  return { ok: true, metadata: merged, llmAttempted: true, llmFailed: false };
}
