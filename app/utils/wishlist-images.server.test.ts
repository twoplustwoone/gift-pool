/**
 * @vitest-environment node
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookup = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

vi.stubGlobal('fetch', fetchMock);

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

    const html = await fetchHtml('https://example.com/start');
    expect(html).toContain('og:image');

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
});
