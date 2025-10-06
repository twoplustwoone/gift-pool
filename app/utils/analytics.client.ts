export function track(event: string, payload?: Record<string, unknown>) {
  try {
    // Optional: wire to real analytics. For now, no-op in production.
    if (typeof window !== 'undefined' && window.ENV?.MODE !== 'production') {
      console.debug('[analytics]', event, payload ?? {});
    }
  } catch {
    // ignore
  }
}
