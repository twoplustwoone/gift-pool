import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { parse } from 'node-html-parser';
import sharp from 'sharp';
import { Agent, fetch as undiciFetch } from 'undici';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit for uploads/downloads
const MAX_PROCESSED_IMAGE_BYTES = 5 * 1024 * 1024; // compress down to <= 5MB before storage
const PROCESS_QUALITIES = [82, 70, 60, 50, 40, 30];
const MAX_HTML_BYTES = 1024 * 1024; // 1MB limit when fetching HTML for auto-detect
// Metadata extraction reads further into the document than image auto-detect:
// marketplace pages park the product image block (and sometimes the JSON-LD)
// well past the first megabyte, so the truncating fetch gets a bigger window.
const MAX_HTML_METADATA_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const PROCESSED_CONTENT_TYPE = 'image/webp';

const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '::1'];

export type WishlistItemImageSource = 'AUTO' | 'MANUAL_UPLOAD' | 'MANUAL_URL';

type FetchWithLimitOptions = {
  allowedContentTypes?: string[];
  maxBytes: number;
  headers?: Record<string, string>;
  // Return the first maxBytes instead of throwing when the body is larger.
  // Safe for HTML metadata extraction: meta tags live in the document head.
  truncateOnLimit?: boolean;
};

type ProcessedImage = {
  data: Buffer;
  contentType: string;
};

// `URL.hostname` keeps the brackets around an IPv6 literal (e.g. `[::1]`);
// strip them so `isIP` / `ipaddr.parse` see the bare address.
function stripIpBrackets(hostname: string) {
  return hostname.replace(/^\[|\]$/g, '');
}

// Default-DENY classification: an address is safe only if it is a globally
// routable unicast address. Anything else — loopback, private, link-local,
// unique-local, CGNAT, reserved, multicast, NAT64/mapped, or unparseable —
// is blocked. Using ipaddr.js (rather than hand-rolled octet math) also
// normalizes IPv4-mapped IPv6 (`::ffff:127.0.0.1`) to its embedded IPv4
// before classifying, closing the mapped-address SSRF bypass.
export function isBlockedAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return true; // unparseable → deny
  }
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    }
  }
  return parsed.range() !== 'unicast';
}

// Resolves and validates the target, returning the set of validated IPs.
// Callers MUST connect only to these addresses (see `pinnedDispatcher`) so the
// address that passed validation is the address that is actually dialed — this
// is what closes the DNS-rebinding TOCTOU. Node's global fetch would otherwise
// re-resolve the hostname independently at connect time.
async function assertSafeUrl(target: URL): Promise<string[]> {
  if (!target.hostname) {
    throw new Error('Invalid URL host');
  }

  if (BLOCKED_HOSTNAMES.includes(target.hostname.toLowerCase())) {
    throw new Error('Blocked host');
  }

  const host = stripIpBrackets(target.hostname);
  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new Error('Blocked private address');
    }
    return [host];
  }

  const lookups = await dns.lookup(target.hostname, {
    all: true,
    verbatim: true,
  });
  if (lookups.length === 0) {
    throw new Error('DNS resolution failed');
  }
  for (const entry of lookups) {
    if (isBlockedAddress(entry.address)) {
      throw new Error('Blocked private address');
    }
  }
  return lookups.map((entry) => entry.address);
}

// Builds an undici dispatcher whose DNS lookup is pinned to the already-
// validated addresses, so the connection can only reach a vetted IP while the
// request still carries the original hostname for Host header / TLS SNI.
function pinnedDispatcher(addresses: string[]) {
  if (addresses.length === 0) {
    throw new Error('No validated address to pin');
  }
  const resolved = addresses.map((address) => ({
    address,
    family: isIP(address) === 6 ? 6 : 4,
  }));
  const primary = resolved[0]!;
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options && (options as { all?: boolean }).all) {
          (callback as (err: null, addrs: typeof resolved) => void)(
            null,
            resolved,
          );
        } else {
          (callback as (err: null, address: string, family: number) => void)(
            null,
            primary.address,
            primary.family,
          );
        }
      },
    },
  });
}

function ensureImageContentType(contentType: string | null) {
  if (!contentType) throw new Error('Missing content type');
  const normalized = contentType.toLowerCase();
  if (!normalized.startsWith('image/')) {
    throw new Error('URL is not an image');
  }
}

function buildRequestHeaders(options: FetchWithLimitOptions) {
  return {
    'User-Agent':
      options.headers?.['User-Agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    Accept:
      options.headers?.Accept ||
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': options.headers?.['Accept-Language'] || 'en-US,en;q=0.9',
    ...(options.headers ?? {}),
  };
}

function resolveRedirectTarget(response: Response, currentUrl: URL) {
  if (response.status < 300 || response.status >= 400) return null;

  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Redirect missing location header');
  }

  return new URL(location, currentUrl);
}

function assertAllowedContentType(
  contentType: string | null,
  allowedContentTypes: string[] | undefined,
) {
  if (!allowedContentTypes?.length) return;

  const isAllowed = allowedContentTypes.some((allowed) =>
    contentType?.toLowerCase().startsWith(allowed.toLowerCase()),
  );
  if (!isAllowed) {
    throw new Error('Unsupported content type');
  }
}

function assertResponseSize(contentLength: string | null, maxBytes: number) {
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error('Response too large');
  }
}

async function readResponseBuffer(
  response: Response,
  maxBytes: number,
  truncateOnLimit = false,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Unable to read response');

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      if (!truncateOnLimit) {
        throw new Error('Response too large');
      }
      const keep = value.byteLength - (total - maxBytes);
      if (keep > 0) chunks.push(value.subarray(0, keep));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function fetchValidatedResponse(
  currentUrl: URL,
  controller: AbortController,
  options: FetchWithLimitOptions,
  dispatchers: Agent[],
) {
  const validatedIps = await assertSafeUrl(currentUrl);
  const dispatcher = pinnedDispatcher(validatedIps);
  dispatchers.push(dispatcher);

  const response = await undiciFetch(currentUrl, {
    signal: controller.signal,
    redirect: 'manual',
    headers: buildRequestHeaders(options),
    dispatcher,
  });

  const redirectTarget = resolveRedirectTarget(
    response as unknown as Response,
    currentUrl,
  );
  if (redirectTarget) {
    return { redirectTarget, response: null };
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  assertAllowedContentType(contentType, options.allowedContentTypes);
  if (!options.truncateOnLimit) {
    assertResponseSize(
      response.headers.get('content-length'),
      options.maxBytes,
    );
  }

  return {
    redirectTarget: null,
    response: response as unknown as Response,
    contentType,
  };
}

async function fetchWithLimit(
  url: URL,
  options: FetchWithLimitOptions,
): Promise<{
  buffer: Buffer;
  contentType: string | null;
  // The URL the body actually came from, after following redirects. Callers
  // that interpret the document (relative URLs, per-site adapters) must use
  // this, not the URL they asked for — short links like a.co/d/… resolve to a
  // different host entirely.
  finalUrl: URL;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Each hop gets its own IP-pinned dispatcher; close them all at the end so
  // pooled sockets don't leak.
  const dispatchers: Agent[] = [];
  try {
    let currentUrl = url;
    let redirectCount = 0;
    while (redirectCount <= MAX_REDIRECTS) {
      const result = await fetchValidatedResponse(
        currentUrl,
        controller,
        options,
        dispatchers,
      );
      if (result.redirectTarget) {
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }
        currentUrl = result.redirectTarget;
        continue;
      }

      const buffer = await readResponseBuffer(
        result.response,
        options.maxBytes,
        options.truncateOnLimit,
      );
      return {
        buffer,
        contentType: result.contentType ?? null,
        finalUrl: currentUrl,
      };
    }

    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
    await Promise.all(dispatchers.map((d) => d.close().catch(() => {})));
  }
}

async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  // Lower image quality progressively until the final payload fits under the max size.
  const baseImage = sharp(buffer);

  for (const quality of PROCESS_QUALITIES) {
    const processed = await baseImage
      .clone()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    if (processed.byteLength <= MAX_PROCESSED_IMAGE_BYTES) {
      return { data: processed, contentType: PROCESSED_CONTENT_TYPE };
    }
  }

  throw new Error('Processed image is too large');
}

export async function processImageFromFile(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return processImage(buffer);
}

export async function processImageFromUrl(urlString: string) {
  const target = new URL(urlString);
  const { buffer, contentType } = await fetchWithLimit(target, {
    maxBytes: MAX_IMAGE_BYTES,
    allowedContentTypes: ['image/'],
  });
  ensureImageContentType(contentType);
  return processImage(buffer);
}

export async function fetchHtml(
  urlString: string,
  { truncate = false }: { truncate?: boolean } = {},
): Promise<{ html: string; finalUrl: string }> {
  const target = new URL(urlString);
  const { buffer, finalUrl } = await fetchWithLimit(target, {
    maxBytes: truncate ? MAX_HTML_METADATA_BYTES : MAX_HTML_BYTES,
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
    truncateOnLimit: truncate,
  });
  return { html: buffer.toString('utf8'), finalUrl: finalUrl.toString() };
}

function resolveImageUrl(src: string | null, base: string) {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

export async function autoDetectImageUrl(itemUrl: string) {
  const { html, finalUrl } = await fetchHtml(itemUrl);
  const root = parse(html);

  const ogImage = root
    .querySelector('meta[property="og:image"]')
    ?.getAttribute('content');
  const twitterImage = root
    .querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]')
    ?.getAttribute('content');
  const firstImg = root.querySelector('img')?.getAttribute('src');

  const candidate = ogImage ?? twitterImage ?? firstImg ?? null;
  // Resolve against the post-redirect URL: a shortened link resolves to a
  // different origin, and relative image paths belong to that origin.
  return resolveImageUrl(candidate, finalUrl);
}

export const WISHLIST_IMAGE_HEADERS = {
  'Content-Type': PROCESSED_CONTENT_TYPE,
  'Cache-Control': 'public, max-age=31536000, immutable',
};
