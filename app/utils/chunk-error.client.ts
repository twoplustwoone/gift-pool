// Detects stale-deployment chunk errors: when a new build is deployed while a
// user is browsing, dynamic import() calls for old chunk URLs start failing.
// Safari surfaces these as "Load failed"; Chrome as "Failed to fetch". We
// detect only TypeErrors that originate from Vite /assets/ chunks (or Vite's
// own import error string) to avoid false-positive reloads on API failures.
//
// The sessionStorage guard ensures we reload at most once per tab session,
// preventing infinite loops when the server itself is down.

const CHUNK_RELOAD_KEY = 'chunkReloadAttempted';

export function isChunkLoadError(error: unknown): error is TypeError {
	if (!(error instanceof TypeError)) return false;
	const msg = error.message;
	const stack = error.stack ?? '';
	return (
		msg.includes('error loading dynamically imported module') ||
		((msg.includes('Load failed') || msg.includes('Failed to fetch')) &&
			stack.includes('/assets/'))
	);
}

export function reloadOnceForChunkError(error: unknown): void {
	if (!isChunkLoadError(error)) return;
	if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
		sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
		window.location.reload();
	}
}
