/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const deleteMany = vi.fn();
const create = vi.fn();
const $transaction = vi.fn();
const processImageFromFile = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    userImage: {
      deleteMany: (...args: Array<unknown>) => deleteMany(...args),
      create: (...args: Array<unknown>) => create(...args),
    },
    $transaction: (...args: Array<unknown>) => $transaction(...args),
  },
}));

vi.mock('#app/utils/wishlist-images.server.ts', () => ({
  processImageFromFile: (...args: Array<unknown>) => processImageFromFile(...args),
}));

import { action } from './profile.photo.tsx';

function makeArgs(formData: FormData) {
  return {
    context: {},
    params: {},
    request: new Request('https://giftpool.app/settings/profile/photo', {
      method: 'POST',
      body: formData,
    }),
  } as never;
}

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  deleteMany.mockReset();
  create.mockReset();
  $transaction.mockReset().mockResolvedValue(undefined);
  processImageFromFile.mockReset();
});

describe('profile.photo action', () => {
  it('rejects an svg upload at the schema before any processing', async () => {
    const formData = new FormData();
    formData.set('intent', 'submit');
    formData.set(
      'photoFile',
      new File(['<svg><script>1</script></svg>'], 'x.svg', {
        type: 'image/svg+xml',
      }),
    );

    const response = await action(makeArgs(formData));

    // `data(...)` wrapper carries its status on `.init`, not `.status`.
    expect((response as { init?: ResponseInit }).init?.status).toBe(400);
    expect(processImageFromFile).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it('re-encodes a valid upload and stores the server-derived webp content type', async () => {
    processImageFromFile.mockResolvedValueOnce({
      data: Buffer.from([1, 2, 3]),
      contentType: 'image/webp',
    });
    const formData = new FormData();
    formData.set('intent', 'submit');
    formData.set(
      'photoFile',
      new File([Buffer.from([0xff, 0xd8, 0xff])], 'x.jpg', {
        type: 'image/jpeg',
      }),
    );

    const response = await action(makeArgs(formData));

    // Redirect on success.
    expect((response as Response).status).toBe(302);
    expect(processImageFromFile).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentType: 'image/webp' }),
      }),
    );
  });

  it('returns a validation error when processing fails (non-image bytes)', async () => {
    processImageFromFile.mockRejectedValueOnce(new Error('unsupported image'));
    const formData = new FormData();
    formData.set('intent', 'submit');
    // Passes the MIME allowlist but is not a real image; sharp will throw.
    formData.set(
      'photoFile',
      new File(['not an image'], 'x.png', { type: 'image/png' }),
    );

    const response = await action(makeArgs(formData));

    expect((response as { init?: ResponseInit }).init?.status).toBe(400);
    expect($transaction).not.toHaveBeenCalled();
  });
});
