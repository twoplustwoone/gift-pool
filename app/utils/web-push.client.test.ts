/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './web-push.client.ts';

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key into the raw bytes', () => {
    // "hello" base64url-encoded (no padding) is "aGVsbG8".
    const result = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(result)).toEqual([
      ...new TextEncoder().encode('hello'),
    ]);
  });

  it('handles base64url-specific characters (- and _)', () => {
    // Bytes [0xff, 0xfe] base64url-encode to "__4" (standard base64 "//4=").
    const result = urlBase64ToUint8Array('__4');
    expect(Array.from(result)).toEqual([0xff, 0xfe]);
  });

  it('produces an ArrayBuffer-backed array (valid applicationServerKey)', () => {
    const result = urlBase64ToUint8Array('aGVsbG8');
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
