import { describe, expect, it } from 'vitest';
import { requireFormData } from './form-data.server.ts';

const post = (body: BodyInit, contentType: string) =>
  new Request('https://giftpool.app/login', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

describe('requireFormData', () => {
  it('parses url-encoded and multipart bodies', async () => {
    const encoded = await requireFormData(
      post('username=kody', 'application/x-www-form-urlencoded'),
    );
    expect(encoded.get('username')).toBe('kody');

    const multipart = new FormData();
    multipart.set('username', 'kody');
    const parsed = await requireFormData(
      new Request('https://giftpool.app/login', {
        method: 'POST',
        body: multipart,
      }),
    );
    expect(parsed.get('username')).toBe('kody');
  });

  it('answers a non-form body with a 400, not a 500 (GIFTPOOL-UI-38)', async () => {
    const thrown: unknown = await requireFormData(
      post('{"username":"kody"}', 'application/json'),
    ).catch((error: unknown) => error);

    // React Router turns a thrown data() into a 400 route error response.
    expect(thrown).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 400 },
    });
  });
});
