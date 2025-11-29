export function track(event: string, payload?: Record<string, unknown>) {
  try {
    // Optional: wire to real analytics. For now, no-op in production.
    if (typeof window !== 'undefined' && window.ENV?.MODE !== 'production') {
      // Intentionally left blank: add analytics wiring here when ready.
    }
  } catch {
    // ignore
  }
}
