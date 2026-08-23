/**
 * @vitest-environment node
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookup = vi.fn();
const fetchMock = vi.fn();

// Outbound fetches go through undici (so the connection can be pinned to the
// validated IP); mock undici's fetch + a no-op Agent for the dispatcher.
vi.mock('undici', () => ({
  fetch: (...args: Array<unknown>) => fetchMock(...args),
  Agent: class {
    close() {
      return Promise.resolve();
    }
  },
}));

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: (...args: Array<unknown>) => dnsLookup(...args),
  },
  lookup: (...args: Array<unknown>) => dnsLookup(...args),
}));

import {
  WISHLIST_IMAGE_HEADERS,
  autoDetectImageUrl,
  fetchHtml,
  isBlockedAddress,
  processImageFromFile,
  processImageFromUrl,
} from './wishlist-images.server.ts';

function imageFixturePath() {
  return path.join(process.cwd(), 'tests/fixtures/images/user/0.jpg');
}

beforeEach(() => {
  dnsLookup.mockReset();
  fetchMock.mockReset();
});

describe('wishlist-images.server.ts', () => {
  it('rejects uploads that exceed the maximum file size before processing', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'huge.png', {
      type: 'image/png',
    });
    Object.defineProperty(file, 'size', {
      value: 10 * 1024 * 1024 + 1,
    });

    await expect(processImageFromFile(file)).rejects.toThrow(
      'Image is too large',
    );
  });

  it('processes remote image URLs and stores them as compressed webp', async () => {
    const imageBuffer = await fs.readFile(imageFixturePath());
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(imageBuffer, {
        headers: {
          'content-length': String(imageBuffer.length),
          'content-type': 'image/jpeg',
        },
        status: 200,
      }),
    );

    const result = await processImageFromUrl('https://example.com/image.jpg');

    expect(result.contentType).toBe('image/webp');
    expect(result.data.byteLength).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://example.com/image.jpg'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining('image/webp'),
        }),
        redirect: 'manual',
      }),
    );
  });

  it('follows redirects when fetching HTML and auto-detects the og:image URL', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            location: '/gift',
          },
          status: 302,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<html><head><meta property="og:image" content="/images/cover.jpg" /></head></html>',
          {
            headers: {
              'content-length': '83',
              'content-type': 'text/html; charset=utf-8',
            },
            status: 200,
          },
        ),
      );

    const fetched = await fetchHtml('https://example.com/start');
    expect(fetched.html).toContain('og:image');
    // The post-redirect URL is what callers must resolve relative URLs and
    // per-host adapters against.
    expect(fetched.finalUrl).toBe('https://example.com/gift');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        '<html><head><meta property="og:image" content="/images/cover.jpg" /></head></html>',
        {
          headers: {
            'content-length': '83',
            'content-type': 'text/html; charset=utf-8',
          },
          status: 200,
        },
      ),
    );

    await expect(
      autoDetectImageUrl('https://example.com/product/123'),
    ).resolves.toBe('https://example.com/images/cover.jpg');
  });

  it('resolves relative images against the redirected origin, not the pasted URL', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { location: 'https://www.shop.example/products/9' },
          status: 301,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<html><head><meta property="og:image" content="/img/hero.jpg" /></head></html>',
          {
            headers: { 'content-type': 'text/html; charset=utf-8' },
            status: 200,
          },
        ),
      );

    await expect(autoDetectImageUrl('https://sho.rt/abc')).resolves.toBe(
      'https://www.shop.example/img/hero.jpg',
    );
  });

  it('blocks private addresses and exposes immutable image headers', async () => {
    await expect(
      processImageFromUrl('http://127.0.0.1/private-image.png'),
    ).rejects.toThrow('Blocked host');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(WISHLIST_IMAGE_HEADERS).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/webp',
    });
  });

  it('blocks link-local, 0.0.0.0/8, and CGNAT addresses', async () => {
    // 169.254.0.0/16 — link-local, includes AWS IMDSv1 (169.254.169.254)
    await expect(
      processImageFromUrl('http://169.254.169.254/latest/meta-data'),
    ).rejects.toThrow('Blocked private address');

    // 0.0.0.0/8
    await expect(processImageFromUrl('http://0.0.0.1/secret')).rejects.toThrow(
      'Blocked private address',
    );

    // 100.64.0.0/10 — CGNAT (RFC 6598)
    await expect(
      processImageFromUrl('http://100.64.0.1/internal'),
    ).rejects.toThrow('Blocked private address');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a hostname that resolves to an IPv4-mapped IPv6 private address (finding #2)', async () => {
    // The classic bypass: an AAAA record pointing at ::ffff:169.254.169.254.
    dnsLookup.mockResolvedValue([
      { address: '::ffff:169.254.169.254', family: 6 },
    ]);

    await expect(
      processImageFromUrl('http://rebind.evil.example/x'),
    ).rejects.toThrow('Blocked private address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pins the connection to the validated IP via a dispatcher (finding #4)', async () => {
    const imageBuffer = await fs.readFile(imageFixturePath());
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(imageBuffer, {
        headers: {
          'content-length': String(imageBuffer.length),
          'content-type': 'image/jpeg',
        },
        status: 200,
      }),
    );

    await processImageFromUrl('https://example.com/image.jpg');

    // The fetch must carry an IP-pinned dispatcher so the connection cannot be
    // re-resolved to a different (private) address at connect time.
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://example.com/image.jpg'),
      expect.objectContaining({ dispatcher: expect.anything() }),
    );
  });
});

describe('isBlockedAddress', () => {
  it('blocks IPv4-mapped IPv6 forms of private/loopback/metadata addresses', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks loopback, unspecified, ULA, link-local, and NAT64', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('64:ff9b::1')).toBe(true); // NAT64
  });

  it('blocks private / CGNAT / reserved IPv4', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('0.0.0.1')).toBe(true);
  });

  it('default-denies unparseable input', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });

  it('allows globally-routable public unicast addresses', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});
