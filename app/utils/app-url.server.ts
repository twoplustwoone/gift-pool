function normalizeBaseUrl(raw?: string | null) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const withProtocol = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

export function getAppBaseUrl() {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.APP_URL,
    process.env.BASE_URL,
    process.env.ORIGIN,
  ];
  for (const c of candidates) {
    const n = normalizeBaseUrl(c);
    if (n) return n;
  }
  return 'http://localhost:3000';
}

export function buildAppUrl(pathname: string) {
  const base = getAppBaseUrl();
  try {
    return new URL(pathname, base).toString();
  } catch {
    try {
      return new URL(pathname, 'http://localhost:3000').toString();
    } catch {
      return pathname;
    }
  }
}
