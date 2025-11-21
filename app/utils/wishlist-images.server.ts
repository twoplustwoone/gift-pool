import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { parse } from 'node-html-parser';
import sharp from 'sharp';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit for uploads/downloads
const MAX_PROCESSED_IMAGE_BYTES = 5 * 1024 * 1024; // compress down to <= 5MB before storage
const PROCESS_QUALITIES = [82, 70, 60, 50, 40, 30];
const MAX_HTML_BYTES = 1024 * 1024; // 1MB limit when fetching HTML for auto-detect
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const PROCESSED_CONTENT_TYPE = 'image/webp';

const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '::1'];

export type WishlistItemImageSource = 'AUTO' | 'MANUAL_UPLOAD' | 'MANUAL_URL';

type FetchWithLimitOptions = {
  allowedContentTypes?: string[];
  maxBytes: number;
  headers?: Record<string, string>;
};

type ProcessedImage = {
  data: Buffer;
  contentType: string;
};

function isPrivateIPv4(address: string) {
  const [a, b = Number.NaN] = address.split('.').map(Number);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

function isPrivateIPv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80')
  );
}

async function assertSafeUrl(target: URL) {
  if (!target.hostname) {
    throw new Error('Invalid URL host');
  }

  if (BLOCKED_HOSTNAMES.includes(target.hostname.toLowerCase())) {
    throw new Error('Blocked host');
  }

  const parsedIpFamily = isIP(target.hostname);
  if (parsedIpFamily === 4 && isPrivateIPv4(target.hostname)) {
    throw new Error('Blocked private address');
  }
  if (parsedIpFamily === 6 && isPrivateIPv6(target.hostname)) {
    throw new Error('Blocked private address');
  }
  if (parsedIpFamily) return;

  const lookups = await dns.lookup(target.hostname, {
    all: true,
    verbatim: true,
  });
  const unsafe = lookups.some((entry) => {
    if (entry.family === 4) return isPrivateIPv4(entry.address);
    return isPrivateIPv6(entry.address);
  });
  if (unsafe) {
    throw new Error('Blocked private address');
  }
}

function ensureImageContentType(contentType: string | null) {
  if (!contentType) throw new Error('Missing content type');
  const normalized = contentType.toLowerCase();
  if (!normalized.startsWith('image/')) {
    throw new Error('URL is not an image');
  }
}

async function fetchWithLimit(
  url: URL,
  options: FetchWithLimitOptions,
): Promise<{
  buffer: Buffer;
  contentType: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let currentUrl = url;
    let redirectCount = 0;
    // Follow redirects manually so we can re-validate each hop.
    while (true) {
      await assertSafeUrl(currentUrl);
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          // Some hosts (e.g., Amazon) block requests without a browsery UA.
          'User-Agent':
            options.headers?.['User-Agent'] ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          Accept:
            options.headers?.Accept ||
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': options.headers?.['Accept-Language'] || 'en-US,en;q=0.9',
          ...(options.headers ?? {}),
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect missing location header');
        }
        if (redirectCount >= MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }
        redirectCount += 1;
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (options.allowedContentTypes?.length) {
        const isAllowed = options.allowedContentTypes.some((allowed) =>
          contentType?.toLowerCase().startsWith(allowed.toLowerCase()),
        );
        if (!isAllowed) {
          throw new Error('Unsupported content type');
        }
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > options.maxBytes) {
        throw new Error('Response too large');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Unable to read response');
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > options.maxBytes) {
          throw new Error('Response too large');
        }
        chunks.push(value);
      }

      return { buffer: Buffer.concat(chunks), contentType };
    }
  } finally {
    clearTimeout(timeout);
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

export async function fetchHtml(urlString: string) {
  const target = new URL(urlString);
  const { buffer } = await fetchWithLimit(target, {
    maxBytes: MAX_HTML_BYTES,
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
  });
  return buffer.toString('utf8');
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
  const html = await fetchHtml(itemUrl);
  const root = parse(html);

  const ogImage = root
    .querySelector('meta[property="og:image"]')
    ?.getAttribute('content');
  const twitterImage = root
    .querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]')
    ?.getAttribute('content');
  const firstImg = root.querySelector('img')?.getAttribute('src');

  const candidate = ogImage ?? twitterImage ?? firstImg ?? null;
  return resolveImageUrl(candidate, itemUrl);
}

export const WISHLIST_IMAGE_HEADERS = {
  'Content-Type': PROCESSED_CONTENT_TYPE,
  'Cache-Control': 'public, max-age=31536000, immutable',
};
