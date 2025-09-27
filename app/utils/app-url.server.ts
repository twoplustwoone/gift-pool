export function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ??
    process.env.APP_URL ??
    process.env.ORIGIN ??
    'http://localhost:3000'
  );
}

export function buildAppUrl(pathname: string) {
  return new URL(pathname, getAppBaseUrl()).toString();
}
