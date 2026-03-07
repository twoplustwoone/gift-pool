import '@remix-run/server-runtime';

declare module '@remix-run/server-runtime' {
  interface Future {
    v3_singleFetch: true;
  }
}
