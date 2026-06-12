/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parse, captureException } = vi.hoisted(() => ({
  parse: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { parse };
  },
}));
vi.mock('@sentry/react-router', () => ({ captureException }));

import {
  extractMetadataWithLlm,
  isLlmEnrichmentEnabled,
} from './wishlist-metadata-llm.server.ts';

beforeEach(() => {
  parse.mockReset();
  captureException.mockClear();
  vi.unstubAllEnvs();
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
});

describe('wishlist-metadata-llm.server.ts', () => {
  it('is disabled without an API key and never constructs a client', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(isLlmEnrichmentEnabled()).toBe(false);
    await expect(
      extractMetadataWithLlm('some text', 'https://example.com'),
    ).resolves.toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('extracts and converts a parsed product to cents', async () => {
    parse.mockResolvedValue({
      parsed_output: { title: '  Acme Widget  ', price: 19.99, currency: 'usd' },
    });

    const result = await extractMetadataWithLlm(
      'page text',
      'https://shop.example.com/widget',
    );

    expect(result).toEqual({
      title: 'Acme Widget',
      priceCents: 1999,
      currency: 'USD',
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
      }),
    );
  });

  it('nulls out invalid prices and non-ISO currencies', async () => {
    parse.mockResolvedValue({
      parsed_output: { title: 'Widget', price: -3, currency: 'dollars' },
    });

    await expect(
      extractMetadataWithLlm('text', 'https://example.com'),
    ).resolves.toEqual({ title: 'Widget', priceCents: null, currency: null });
  });

  it('returns null when the model produced no parseable output', async () => {
    parse.mockResolvedValue({ parsed_output: null });
    await expect(
      extractMetadataWithLlm('text', 'https://example.com'),
    ).resolves.toBeNull();
  });

  it('swallows API errors into Sentry and returns null', async () => {
    parse.mockRejectedValue(new Error('rate limited'));
    await expect(
      extractMetadataWithLlm('text', 'https://example.com'),
    ).resolves.toBeNull();
    expect(captureException).toHaveBeenCalled();
  });

  it('caps the page text sent to the model', async () => {
    parse.mockResolvedValue({ parsed_output: null });
    await extractMetadataWithLlm('x'.repeat(50_000), 'https://example.com');

    const call = parse.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0]!.content.length).toBeLessThan(11_000);
  });
});
