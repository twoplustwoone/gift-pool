// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForChunkError } from './chunk-error.client.ts';

function makeTypeError(message: string, stack?: string): TypeError {
	const err = new TypeError(message);
	if (stack !== undefined) err.stack = stack;
	return err;
}

const ASSETS_STACK = 'TypeError\n    at https://example.com/assets/chunk-abc.js:1:1';
const API_STACK = 'TypeError\n    at https://example.com/api/wishlist:1:1';

describe('isChunkLoadError', () => {
	it('matches Vite dynamic import error string', () => {
		expect(
			isChunkLoadError(makeTypeError('error loading dynamically imported module')),
		).toBe(true);
	});

	it('matches "Load failed" when stack references /assets/', () => {
		expect(isChunkLoadError(makeTypeError('Load failed', ASSETS_STACK))).toBe(true);
	});

	it('matches "Failed to fetch" when stack references /assets/', () => {
		expect(isChunkLoadError(makeTypeError('Failed to fetch', ASSETS_STACK))).toBe(true);
	});

	it('does not match "Load failed" when stack is from an API route', () => {
		expect(isChunkLoadError(makeTypeError('Load failed', API_STACK))).toBe(false);
	});

	it('does not match "Failed to fetch" when stack is from an API route', () => {
		expect(isChunkLoadError(makeTypeError('Failed to fetch', API_STACK))).toBe(false);
	});

	it('does not match non-TypeErrors', () => {
		expect(isChunkLoadError(new Error('Load failed'))).toBe(false);
		expect(isChunkLoadError('Load failed')).toBe(false);
		expect(isChunkLoadError(null)).toBe(false);
	});

	it('does not match unrelated TypeErrors', () => {
		expect(isChunkLoadError(makeTypeError('Cannot read properties of undefined'))).toBe(false);
	});
});

describe('reloadOnceForChunkError', () => {
	const reloadMock = vi.fn();

	beforeEach(() => {
		sessionStorage.clear();
		vi.stubGlobal('location', { reload: reloadMock });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reloads on a chunk error', () => {
		reloadOnceForChunkError(makeTypeError('error loading dynamically imported module'));
		expect(reloadMock).toHaveBeenCalledOnce();
	});

	it('sets the sessionStorage guard after reloading', () => {
		reloadOnceForChunkError(makeTypeError('error loading dynamically imported module'));
		expect(sessionStorage.getItem('chunkReloadAttempted')).toBe('1');
	});

	it('does not reload a second time when the guard is set', () => {
		sessionStorage.setItem('chunkReloadAttempted', '1');
		reloadOnceForChunkError(makeTypeError('error loading dynamically imported module'));
		expect(reloadMock).not.toHaveBeenCalled();
	});

	it('does not reload for non-chunk errors', () => {
		reloadOnceForChunkError(makeTypeError('Failed to fetch', API_STACK));
		expect(reloadMock).not.toHaveBeenCalled();
	});

	it('does not reload for non-errors', () => {
		reloadOnceForChunkError(null);
		expect(reloadMock).not.toHaveBeenCalled();
	});
});
