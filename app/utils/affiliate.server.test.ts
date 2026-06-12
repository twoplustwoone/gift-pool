/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAffiliateTags } from './affiliate.server.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('applyAffiliateTags', () => {
  it('passes every URL through untouched when no network is configured', () => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', '');
    expect(
      applyAffiliateTags('https://www.amazon.com/dp/B0ABC123'),
    ).toEqual({ url: 'https://www.amazon.com/dp/B0ABC123', network: null });
  });

  it.each([
    'https://www.amazon.com/dp/B0ABC123',
    'https://amazon.co.uk/dp/B0ABC123',
    'https://www.amazon.de/dp/B0ABC123',
    'https://www.amazon.com.au/dp/B0ABC123',
  ])('tags %s when the Amazon tag is configured', (url) => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    const result = applyAffiliateTags(url);
    expect(result.network).toBe('amazon');
    expect(new URL(result.url).searchParams.get('tag')).toBe('giftpool-20');
  });

  it('replaces a pre-existing tag instead of appending a second one', () => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    const result = applyAffiliateTags(
      'https://www.amazon.com/dp/B0ABC123?tag=someoneelse-21&th=1',
    );
    const params = new URL(result.url).searchParams;
    expect(params.get('tag')).toBe('giftpool-20');
    expect(params.get('th')).toBe('1');
    expect(result.url.match(/tag=/g)).toHaveLength(1);
  });

  it.each([
    'https://example.com/amazon.com/fake',
    'https://notamazon.com/dp/B0ABC123',
    'https://amazon.com.evil.net/dp/B0ABC123',
    'https://amzn.to/abc',
  ])('does not tag non-Amazon host %s', (url) => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    expect(applyAffiliateTags(url)).toEqual({ url, network: null });
  });

  it('passes through malformed and non-http URLs', () => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    expect(applyAffiliateTags('not a url')).toEqual({
      url: 'not a url',
      network: null,
    });
    expect(applyAffiliateTags('javascript:alert(1)')).toEqual({
      url: 'javascript:alert(1)',
      network: null,
    });
  });
});
