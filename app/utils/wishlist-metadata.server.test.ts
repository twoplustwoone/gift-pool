/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookup = vi.fn();
const fetchMock = vi.fn();

// Outbound HTML fetches go through undici (IP-pinned dispatcher); mock it.
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

const { extractMetadataWithLlm, isLlmEnrichmentEnabled } = vi.hoisted(() => ({
  extractMetadataWithLlm: vi.fn(),
  isLlmEnrichmentEnabled: vi.fn(() => false),
}));

vi.mock('#app/utils/wishlist-metadata-llm.server.ts', () => ({
  extractMetadataWithLlm,
  isLlmEnrichmentEnabled,
}));

import {
  extractUrlMetadata,
  parseMetadataFromHtml,
  parsePriceToCents,
} from './wishlist-metadata.server.ts';

const BASE_URL = 'https://shop.example.com/products/widget';

function htmlPage(head: string, body = '') {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function jsonLd(payload: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

beforeEach(() => {
  dnsLookup.mockReset();
  fetchMock.mockReset();
  extractMetadataWithLlm.mockReset();
  isLlmEnrichmentEnabled.mockReset().mockReturnValue(false);
});

describe('parsePriceToCents', () => {
  it.each([
    ['19.99', 1999],
    ['$19.99', 1999],
    ['1,299.99', 129999],
    ['$1,299', 129900],
    ['19,99', 1999], // EU decimal comma
    ['1.299,00', 129900], // EU thousands + decimal comma
    [19.99, 1999],
    [25, 2500],
    ['free', null],
    ['', null],
    ['0', null],
    ['0.00', null],
    [-5, null],
    [null, null],
    [undefined, null],
    ['999999999999', null], // absurd value
  ])('parses %j as %j', (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });
});

describe('parseMetadataFromHtml', () => {
  it('extracts title, image, and price from a JSON-LD Product', () => {
    const html = htmlPage(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Acme Widget',
        image: 'https://cdn.example.com/widget.jpg',
        offers: {
          '@type': 'Offer',
          price: '49.99',
          priceCurrency: 'USD',
        },
      }),
    );

    expect(parseMetadataFromHtml(html, BASE_URL)).toEqual({
      title: 'Acme Widget',
      imageUrl: 'https://cdn.example.com/widget.jpg',
      priceCents: 4999,
      currency: 'USD',
      source: 'structured',
    });
  });

  it('finds Product nodes nested inside @graph', () => {
    const html = htmlPage(
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'Shop' },
          {
            '@type': 'Product',
            name: 'Graph Widget',
            offers: { price: 12.5, priceCurrency: 'EUR' },
          },
        ],
      }),
    );

    const result = parseMetadataFromHtml(html, BASE_URL);
    expect(result.title).toBe('Graph Widget');
    expect(result.priceCents).toBe(1250);
    expect(result.currency).toBe('EUR');
  });

  it('reads the first priced offer from an offers array and AggregateOffer lowPrice', () => {
    const offersArray = parseMetadataFromHtml(
      htmlPage(
        jsonLd({
          '@type': 'Product',
          name: 'Multi Offer',
          offers: [
            { availability: 'OutOfStock' },
            { price: '5.00', priceCurrency: 'GBP' },
          ],
        }),
      ),
      BASE_URL,
    );
    expect(offersArray.priceCents).toBe(500);
    expect(offersArray.currency).toBe('GBP');

    const aggregate = parseMetadataFromHtml(
      htmlPage(
        jsonLd({
          '@type': 'Product',
          name: 'Aggregate',
          offers: {
            '@type': 'AggregateOffer',
            lowPrice: '9.99',
            priceCurrency: 'USD',
          },
        }),
      ),
      BASE_URL,
    );
    expect(aggregate.priceCents).toBe(999);
  });

  it('ignores malformed JSON-LD blocks and falls back to og tags', () => {
    const html = htmlPage(
      `<script type="application/ld+json">{not valid json</script>
       <meta property="og:title" content="OG Widget" />
       <meta property="og:image" content="/images/widget.png" />
       <meta property="product:price:amount" content="29.95" />
       <meta property="product:price:currency" content="usd" />`,
    );

    expect(parseMetadataFromHtml(html, BASE_URL)).toEqual({
      title: 'OG Widget',
      imageUrl: 'https://shop.example.com/images/widget.png',
      priceCents: 2995,
      currency: 'USD',
      source: 'structured',
    });
  });

  it('prefers a priced Product node over an unpriced one', () => {
    const html = htmlPage(
      jsonLd([
        { '@type': 'Product', name: 'No Price' },
        {
          '@type': 'Product',
          name: 'Priced',
          offers: { price: '15.00', priceCurrency: 'USD' },
        },
      ]),
    );
    expect(parseMetadataFromHtml(html, BASE_URL).title).toBe('Priced');
  });

  it('falls back to the document title when nothing else exists', () => {
    const html = htmlPage('<title>  Plain Title Page  </title>');
    const result = parseMetadataFromHtml(html, BASE_URL);
    expect(result.title).toBe('Plain Title Page');
    expect(result.priceCents).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.source).toBe('structured');
  });

  it('returns all nulls with source "none" for a page with no metadata', () => {
    const result = parseMetadataFromHtml(
      '<!doctype html><html><head></head><body><p>hi</p></body></html>',
      BASE_URL,
    );
    expect(result).toEqual({
      title: null,
      imageUrl: null,
      priceCents: null,
      currency: null,
      source: 'none',
    });
  });

  it('reads a ProductGroup ("see options") price from its variants', () => {
    const html = htmlPage(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        name: 'Goalkeeper Gloves',
        hasVariant: [
          { '@type': 'Product', name: 'Size 8' },
          {
            '@type': 'Product',
            name: 'Size 9',
            image: 'https://cdn.example.com/glove.jpg',
            offers: { '@type': 'Offer', price: '50.49', priceCurrency: 'USD' },
          },
        ],
      }),
    );

    expect(parseMetadataFromHtml(html, BASE_URL)).toEqual({
      title: 'Goalkeeper Gloves',
      imageUrl: 'https://cdn.example.com/glove.jpg',
      priceCents: 5049,
      currency: 'USD',
      source: 'structured',
    });
  });

  it('reads a price nested in priceSpecification or an AggregateOffer offer list', () => {
    const spec = parseMetadataFromHtml(
      htmlPage(
        jsonLd({
          '@type': 'Product',
          name: 'Spec Widget',
          offers: {
            '@type': 'Offer',
            priceSpecification: { price: '31.50', priceCurrency: 'CAD' },
          },
        }),
      ),
      BASE_URL,
    );
    expect(spec.priceCents).toBe(3150);
    expect(spec.currency).toBe('CAD');

    const nested = parseMetadataFromHtml(
      htmlPage(
        jsonLd({
          '@type': 'Product',
          name: 'Nested Widget',
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'USD',
            offers: [{ '@type': 'Offer', price: '7.25' }],
          },
        }),
      ),
      BASE_URL,
    );
    expect(nested.priceCents).toBe(725);
    expect(nested.currency).toBe('USD');
  });

  it('prefers a priced JSON-LD block over an earlier unpriced one', () => {
    const html = htmlPage(
      `${jsonLd({ '@type': 'Product', name: 'Unpriced First' })}
       ${jsonLd({
         '@type': 'Product',
         name: 'Priced Second',
         offers: { price: '8.00', priceCurrency: 'USD' },
       })}`,
    );
    expect(parseMetadataFromHtml(html, BASE_URL).title).toBe('Priced Second');
  });

  it('keeps trying image sources when the first one is unusable', () => {
    const result = parseMetadataFromHtml(
      htmlPage(
        `<meta name="og:title" content="Name-attribute Widget" />
         <meta property="og:image" content="data:image/gif;base64,R0lGOD" />
         <meta name="twitter:image" content="https://cdn.example.com/fallback.jpg" />`,
      ),
      BASE_URL,
    );
    expect(result.title).toBe('Name-attribute Widget');
    expect(result.imageUrl).toBe('https://cdn.example.com/fallback.jpg');
  });

  it('drops non-http image URLs and never returns currency without a price', () => {
    const result = parseMetadataFromHtml(
      htmlPage(
        `<meta property="og:title" content="Widget" />
         <meta property="og:image" content="javascript:alert(1)" />
         <meta property="og:price:currency" content="USD" />`,
      ),
      BASE_URL,
    );
    expect(result.imageUrl).toBeNull();
    expect(result.currency).toBeNull();
  });
});

describe('amazon adapter', () => {
  const AMAZON_URL = 'https://www.amazon.com/dp/B09JQMJHXY';
  // Amazon product pages ship no og/JSON-LD — title only, data in the body.
  const amazonHtml = (body = '') =>
    htmlPage(
      '<title>Amazon.com: Apple AirPods Pro with MagSafe Case : Electronics</title>',
      body,
    );

  it('fills price, image, and a cleaned title from amazon markup', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        amazonHtml(
          `<span class="a-price"><span class="a-offscreen">$205.97</span></span>
           <img id="landingImage" src="https://m.media-amazon.com/images/I/71bhWgQK.jpg" />`,
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(AMAZON_URL);
    expect(result).toMatchObject({
      ok: true,
      llmAttempted: false,
      metadata: {
        title: 'Apple AirPods Pro with MagSafe Case',
        priceCents: 20597,
        currency: 'USD',
        imageUrl: 'https://m.media-amazon.com/images/I/71bhWgQK.jpg',
        source: 'structured',
      },
    });
  });

  it('finds the image in the hiRes JSON blob when no landingImage exists', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        amazonHtml(
          `<span class="a-offscreen">£19.99</span>
           <script>var data = {"hiRes":"https://m.media-amazon.com/images/I/81xyz.jpg","thumb":"x"};</script>`,
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(
      'https://www.amazon.co.uk/dp/B0ABC',
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        priceCents: 1999,
        currency: 'GBP',
        imageUrl: 'https://m.media-amazon.com/images/I/81xyz.jpg',
      },
    });
  });

  it('does not apply amazon heuristics to other hosts', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage(
          '<title>Amazon.com: Not Really</title>',
          '<span class="a-offscreen">$9.99</span>',
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(
      'https://shop.example.com/lookalike',
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Amazon.com: Not Really', // untouched
        priceCents: null,
        imageUrl: null,
      },
    });
  });

  it('degrades to title-only when the page carries no product markup', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(amazonHtml('<p>Enter the characters you see below</p>'), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const result = await extractUrlMetadata(AMAZON_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Apple AirPods Pro with MagSafe Case',
        priceCents: null,
        imageUrl: null,
      },
    });
  });
});

describe('amazon short links and variation pages', () => {
  const htmlResponse = (body: string) =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

  it('adapts the page a mobile a.co share link redirects to', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'https://www.amazon.com/dp/B0C1234567' },
        }),
      )
      .mockResolvedValueOnce(
        htmlResponse(
          htmlPage(
            '<title>Amazon.com: Renegade GK Goalkeeper Gloves : Sports</title>',
            `<div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">$50.49</span></span></div>
             <img id="landingImage" src="https://m.media-amazon.com/images/I/71glove.jpg" />`,
          ),
        ),
      );

    const result = await extractUrlMetadata('https://a.co/d/05xLJBFR');
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Renegade GK Goalkeeper Gloves',
        priceCents: 5049,
        currency: 'USD',
        imageUrl: 'https://m.media-amazon.com/images/I/71glove.jpg',
      },
    });
  });

  it('reads the range low price and dynamic image on a "see options" page', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      htmlResponse(
        htmlPage(
          '<title>Amazon.com: Renegade GK Gloves, 6 sizes : Sports</title>',
          `<span class="a-price-range"><span class="a-offscreen">$45.99</span><span class="a-offscreen">$59.99</span></span>
           <img id="landingImage" src="data:image/gif;base64,R0lGOD" data-a-dynamic-image='{"https://m.media-amazon.com/images/I/small.jpg":[500,500],"https://m.media-amazon.com/images/I/big.jpg":[1500,1500]}' />`,
        ),
      ),
    );

    const result = await extractUrlMetadata(
      'https://www.amazon.com/dp/B0PARENT',
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Renegade GK Gloves, 6 sizes',
        priceCents: 4599,
        currency: 'USD',
        // The placeholder data: URI must not consume the image slot.
        imageUrl: 'https://m.media-amazon.com/images/I/big.jpg',
      },
    });
  });

  it('skips screen-reader text that is not a price', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      htmlResponse(
        htmlPage(
          '<title>Amazon.com: Widget : Tools</title>',
          `<span class="a-offscreen">Select the department you want to search in</span>
           <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$12.34</span></span></div>`,
        ),
      ),
    );

    const result = await extractUrlMetadata(
      'https://www.amazon.com/dp/B0WIDGET',
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: { priceCents: 1234, currency: 'USD' },
    });
  });

  it('reports blocked_bot instead of prefilling a captcha page', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      htmlResponse(
        htmlPage(
          '<title>Amazon.com</title>',
          `<form action="/errors/validateCaptcha"><input id="captchacharacters" /></form>`,
        ),
      ),
    );

    const result = await extractUrlMetadata(
      'https://www.amazon.com/dp/B0BLOCK',
    );
    expect(result).toEqual({ ok: false, outcome: 'blocked_bot' });
    expect(extractMetadataWithLlm).not.toHaveBeenCalled();
  });

  it('treats a bare marketplace title as a bot wall', async () => {
    isLlmEnrichmentEnabled.mockReturnValue(true);
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      htmlResponse(
        htmlPage('<title>Amazon.com. Spend less. Smile more.</title>'),
      ),
    );

    const result = await extractUrlMetadata('https://www.amazon.com/dp/B0WALL');
    expect(result).toEqual({ ok: false, outcome: 'blocked_bot' });
    // No point paying for an LLM read of an interstitial.
    expect(extractMetadataWithLlm).not.toHaveBeenCalled();
  });
});

describe('etsy adapter', () => {
  const ETSY_URL = 'https://www.etsy.com/listing/1234567890/personalised-mug';

  it('strips the marketplace suffix and reads the buy-box price', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage(
          `<title>Personalised Mug - Etsy</title>
           <meta property="og:title" content="Personalised Mug | Etsy Canada" />
           <meta property="og:image" content="https://i.etsystatic.com/1/mug.jpg" />`,
          `<div data-buy-box-region="price">
             <span class="currency-symbol">$</span><span class="currency-value">50.49</span>
           </div>`,
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(ETSY_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Personalised Mug',
        priceCents: 5049,
        currency: 'USD',
        imageUrl: 'https://i.etsystatic.com/1/mug.jpg',
      },
    });
  });

  it('falls back to the listing carousel when og:image is missing', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage(
          '<meta property="og:title" content="Hand Knitted Scarf – Etsy UK" />',
          `<div class="listing-page-image-carousel-component">
             <img data-src="https://i.etsystatic.com/2/scarf.jpg" />
           </div>`,
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(ETSY_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        title: 'Hand Knitted Scarf',
        imageUrl: 'https://i.etsystatic.com/2/scarf.jpg',
      },
    });
  });
});

describe('extractUrlMetadata', () => {
  it('fetches and parses a product page', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage(
          jsonLd({
            '@type': 'Product',
            name: 'Fetched Widget',
            offers: { price: '10.00', priceCurrency: 'USD' },
          }),
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: { title: 'Fetched Widget', priceCents: 1000 },
    });
  });

  it('classifies private-address targets as blocked_url', async () => {
    dnsLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const result = await extractUrlMetadata('https://internal.example.com/');
    expect(result).toEqual({ ok: false, outcome: 'blocked_url' });
  });

  it('classifies HTTP errors as fetch_failed', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toEqual({ ok: false, outcome: 'fetch_failed' });
  });

  it('classifies aborts as timeout', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockRejectedValue(
      Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      }),
    );

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toEqual({ ok: false, outcome: 'timeout' });
  });

  it('never calls the LLM when structured data is complete', async () => {
    isLlmEnrichmentEnabled.mockReturnValue(true);
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage(
          jsonLd({
            '@type': 'Product',
            name: 'Complete Widget',
            offers: { price: '10.00', priceCurrency: 'USD' },
          }),
        ),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({ ok: true, llmAttempted: false });
    expect(extractMetadataWithLlm).not.toHaveBeenCalled();
  });

  it('merges LLM fields deterministic-wins when structured data is partial', async () => {
    isLlmEnrichmentEnabled.mockReturnValue(true);
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage('<meta property="og:title" content="Structured Title" />'),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );
    extractMetadataWithLlm.mockResolvedValue({
      title: 'LLM Title',
      priceCents: 2599,
      currency: 'USD',
    });

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({
      ok: true,
      llmAttempted: true,
      llmFailed: false,
      metadata: {
        title: 'Structured Title', // deterministic wins
        priceCents: 2599, // LLM fills the gap
        currency: 'USD',
        source: 'mixed',
      },
    });
  });

  it('marks source llm when only the LLM found anything', async () => {
    isLlmEnrichmentEnabled.mockReturnValue(true);
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response('<html><body><p>just text</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    extractMetadataWithLlm.mockResolvedValue({
      title: 'LLM Only',
      priceCents: 500,
      currency: null,
    });

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: { title: 'LLM Only', priceCents: 500, source: 'llm' },
    });
  });

  it('reports llmFailed without breaking the structured result', async () => {
    isLlmEnrichmentEnabled.mockReturnValue(true);
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(
        htmlPage('<meta property="og:title" content="Still Works" />'),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );
    extractMetadataWithLlm.mockResolvedValue(null);

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({
      ok: true,
      llmAttempted: true,
      llmFailed: true,
      metadata: { title: 'Still Works' },
    });
  });

  it('truncates oversized pages instead of failing, keeping head metadata', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const head = `<meta property="og:title" content="Huge Page Widget" />`;
    const padding = 'x'.repeat(2 * 1024 * 1024 + 1024); // past the 2MB metadata cap
    fetchMock.mockResolvedValue(
      new Response(htmlPage(head, padding), {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'content-length': String(2 * 1024 * 1024 + 2048),
        },
      }),
    );

    const result = await extractUrlMetadata(BASE_URL);
    expect(result).toMatchObject({
      ok: true,
      metadata: { title: 'Huge Page Widget' },
    });
  });
});
