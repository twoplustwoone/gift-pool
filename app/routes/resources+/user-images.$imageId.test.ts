/**
 * @vitest-environment node
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const findUnique = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    userImage: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
  },
}));

import { loader } from './user-images.$imageId.tsx';

function makeArgs(imageId: string, size?: number) {
  const url = new URL(
    `https://giftpool.app/resources/user-images/${imageId}`,
  );
  if (size !== undefined) url.searchParams.set('size', String(size));
  return {
    context: {},
    params: { imageId },
    request: new Request(url),
  } as never;
}

beforeEach(() => {
  requireUserId.mockReset();
  findUnique.mockReset();
});

describe('app/routes/resources+/user-images.$imageId.tsx', () => {
  it('redirects unauthenticated callers without querying the database', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?redirectTo=%2Fresources%2Fuser-images%2Ftest' },
    });
    requireUserId.mockRejectedValueOnce(loginRedirect);

    const error = await loader(makeArgs('test')).catch((e: unknown) => e);

    expect(error).toBe(loginRedirect);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the image does not exist', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    findUnique.mockResolvedValueOnce(null);

    const error = await loader(makeArgs('missing-id')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
  });

  it('returns the image with private cache headers for authenticated callers', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    // A minimal valid buffer — no size param so Sharp is not invoked.
    const blob = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    findUnique.mockResolvedValueOnce({ contentType: 'image/png', blob });

    const response = await loader(makeArgs('img-1'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=31536000, immutable',
    );
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(blob.byteLength));
  });

  it('serves the raw branch as an attachment under an enforced restrictive CSP', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    const blob = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    findUnique.mockResolvedValueOnce({ contentType: 'image/png', blob });

    const response = await loader(makeArgs('img-1'));

    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="img-1"',
    );
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; sandbox",
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('downgrades a legacy non-raster stored content type so it cannot render as a document', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    // A legacy row whose stored contentType is an active-content type.
    const blob = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    findUnique.mockResolvedValueOnce({ contentType: 'image/svg+xml', blob });

    const response = await loader(makeArgs('legacy-svg'));

    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="legacy-svg"',
    );
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; sandbox",
    );
  });

  it('returns a resized webp with private cache headers when ?size is provided', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    const imageBuffer = await fs.readFile(
      path.join(process.cwd(), 'tests/fixtures/images/user/0.jpg'),
    );
    findUnique.mockResolvedValueOnce({ contentType: 'image/jpeg', blob: imageBuffer });

    const response = await loader(makeArgs('img-1', 64));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=31536000, immutable',
    );
    expect(response.headers.get('content-type')).toBe('image/webp');
  });
});
