// Affiliate link rewriting. Each network is a registry entry; networks are
// inert until their env var is configured, so the app works untagged out of
// the box. The /out redirect route is the only caller — links never carry
// affiliate tags in rendered pages or copied URLs.

type AffiliateNetwork = {
  name: string;
  enabled: () => boolean;
  matches: (url: URL) => boolean;
  rewrite: (url: URL) => URL;
};

// amazon.com, amazon.co.uk, amazon.de, www.amazon.com.au, …
// (amzn.to short links are deliberately untagged — resolving them would need
// an extra outbound request per click.)
const AMAZON_HOST = /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/i;

const networks: AffiliateNetwork[] = [
  {
    name: 'amazon',
    enabled: () => Boolean(process.env.AMAZON_AFFILIATE_TAG),
    matches: (url) => AMAZON_HOST.test(url.hostname),
    rewrite: (url) => {
      // set() replaces any pre-existing tag so another associate's tag in a
      // pasted URL never wins over ours.
      url.searchParams.set('tag', process.env.AMAZON_AFFILIATE_TAG!);
      return url;
    },
  },
  // Future networks (e.g. Sovrn/Skimlinks wrapper redirects) slot in here.
];

export function applyAffiliateTags(rawUrl: string): {
  url: string;
  network: string | null;
} {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: rawUrl, network: null };
    }
    const network = networks.find((n) => n.enabled() && n.matches(parsed));
    if (!network) return { url: rawUrl, network: null };
    return { url: network.rewrite(parsed).toString(), network: network.name };
  } catch {
    return { url: rawUrl, network: null };
  }
}
