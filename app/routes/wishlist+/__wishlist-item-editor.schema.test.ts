/**
 * @vitest-environment node
 *
 * Schema-level tests for WishlistItemSchema.
 * Uses the node environment so that z.string().url() has an unmodified
 * URL constructor (the jsdom test file stubs URL.createObjectURL which
 * can break Zod's URL validation).
 */
import { describe, expect, it } from 'vitest';
import { WishlistItemSchema } from './__wishlist-item-editor';

function parse(fields: Record<string, unknown>) {
  return WishlistItemSchema.safeParse({
    title: 'Test item',
    imageAction: 'none',
    type: 'text',
    ...fields,
  });
}

describe('WishlistItemSchema — URL required for list links', () => {
  it('fails when type is wishlist and URL is absent', () => {
    const result = parse({ type: 'wishlist' });
    expect(result.success).toBe(false);
    const urlErrors = result.error?.flatten().fieldErrors.url;
    expect(urlErrors).toContain('A URL is required for list links');
  });

  it('fails when type is wishlist and URL is undefined (mirrors Conform coercion of empty string)', () => {
    const result = parse({ type: 'wishlist', url: undefined });
    expect(result.success).toBe(false);
    const urlErrors = result.error?.flatten().fieldErrors.url;
    expect(urlErrors).toContain('A URL is required for list links');
  });

  it('passes when type is wishlist and a valid URL is supplied', () => {
    const result = parse({
      type: 'wishlist',
      url: 'https://www.amazon.com/hz/wishlist/ls/abc',
    });
    expect(result.success).toBe(true);
  });

  it('passes when type is text and no URL is supplied', () => {
    const result = parse({ type: 'text' });
    expect(result.success).toBe(true);
  });

  it('passes when type is link and no URL is supplied', () => {
    const result = parse({ type: 'link' });
    expect(result.success).toBe(true);
  });
});
