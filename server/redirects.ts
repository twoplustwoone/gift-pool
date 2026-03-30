const SAFE_REDIRECT_BASE_URL = 'http://localhost';
const SAFE_REDIRECT_HOST = 'localhost';

function parseRequestTarget(requestTarget: string) {
  try {
    return new URL(requestTarget, SAFE_REDIRECT_BASE_URL);
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string) {
  const normalizedPathname = pathname.replaceAll(/\/+/g, '/');

  if (!normalizedPathname || normalizedPathname === '/') {
    return '/';
  }

  return normalizedPathname.endsWith('/')
    ? normalizedPathname.slice(0, -1) || '/'
    : normalizedPathname;
}

export function buildSafeAppRedirectTarget(requestTarget: string) {
  const url = parseRequestTarget(requestTarget);

  if (!url) {
    return '/';
  }

  if (url.host !== SAFE_REDIRECT_HOST) {
    return url.search ? `/${url.search}` : '/';
  }

  const normalizedPathname = normalizePathname(url.pathname);
  const redirectTarget = `${normalizedPathname}${url.search}`;

  return redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
    ? redirectTarget
    : '/';
}

export function getCanonicalRedirectTarget(requestTarget: string) {
  const url = parseRequestTarget(requestTarget);
  if (!url) {
    return '/';
  }
  const currentTarget =
    url.host === SAFE_REDIRECT_HOST ? `${url.pathname}${url.search}` : null;
  const redirectTarget = buildSafeAppRedirectTarget(requestTarget);

  return currentTarget === redirectTarget ? null : redirectTarget;
}
