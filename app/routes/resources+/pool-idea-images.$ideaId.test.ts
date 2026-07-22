/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const requireUserInPool = vi.fn();
const findUnique = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    giftIdea: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
  },
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  requireUserInPool: (...args: Array<unknown>) => requireUserInPool(...args),
}));

import { loader } from './pool-idea-images.$ideaId.tsx';

function makeArgs(ideaId: string) {
  return {
    context: {},
    params: { ideaId },
    request: new Request(
      `https://giftpool.app/resources/pool-idea-images/${ideaId}`,
    ),
  } as never;
}

beforeEach(() => {
  requireUserId.mockReset();
  requireUserInPool.mockReset();
  findUnique.mockReset();
});

describe('app/routes/resources+/pool-idea-images.$ideaId.tsx', () => {
  it('redirects unauthenticated callers without querying the database', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
    requireUserId.mockRejectedValueOnce(loginRedirect);

    const error = await loader(makeArgs('idea-1')).catch((e: unknown) => e);

    expect(error).toBe(loginRedirect);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the idea does not exist', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    findUnique.mockResolvedValueOnce(null);

    const error = await loader(makeArgs('missing')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
    expect(requireUserInPool).not.toHaveBeenCalled();
  });

  it('returns 404 when the idea has no linked wishlist item image', async () => {
    requireUserId.mockResolvedValueOnce('user-1');
    findUnique.mockResolvedValueOnce({
      poolId: 'pool-1',
      wishlistItem: null,
    });

    const error = await loader(makeArgs('idea-1')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
    expect(requireUserInPool).not.toHaveBeenCalled();
  });

  // The core fix: a pool contributor who joined via invite link is not
  // necessarily a friend or groupmate of the recipient, so this route must
  // authorize on pool contribution — never on wishlist friend/group access.
  it('404s a caller who is not a pool contributor, regardless of wishlist access', async () => {
    requireUserId.mockResolvedValueOnce('user-2');
    findUnique.mockResolvedValueOnce({
      poolId: 'pool-1',
      wishlistItem: { image: Buffer.from([1, 2, 3]) },
    });
    requireUserInPool.mockRejectedValueOnce(
      new Response('Not Found', { status: 404 }),
    );

    const error = await loader(makeArgs('idea-1')).catch((e: unknown) => e);

    expect(requireUserInPool).toHaveBeenCalledWith('user-2', 'pool-1');
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
  });

  it('serves the image for any pool contributor', async () => {
    requireUserId.mockResolvedValueOnce('user-2');
    const blob = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    findUnique.mockResolvedValueOnce({
      poolId: 'pool-1',
      wishlistItem: { image: blob },
    });
    requireUserInPool.mockResolvedValueOnce(undefined);

    const response = await loader(makeArgs('idea-1'));

    expect(requireUserInPool).toHaveBeenCalledWith('user-2', 'pool-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('content-length')).toBe(String(blob.byteLength));
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="idea-1.webp"',
    );
  });
});
