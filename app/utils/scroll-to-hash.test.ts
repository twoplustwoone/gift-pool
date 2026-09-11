/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

import { scrollForNavigation } from './scroll-to-hash.ts';

function setup() {
  document.body.innerHTML = `
    <div data-testid="app-scroll-area">
      <div id="notes">the thread</div>
    </div>
  `;
  const container = document.querySelector<HTMLElement>(
    '[data-testid="app-scroll-area"]',
  )!;
  container.scrollTo = vi.fn();
  const target = document.getElementById('notes')!;
  target.scrollIntoView = vi.fn();
  return { container, target };
}

describe('scrollForNavigation', () => {
  it('lands on the anchor a deep link asked for, and leaves the top alone', () => {
    const { container, target } = setup();
    expect(scrollForNavigation({ container, hash: '#notes' })).toBe('anchor');
    expect(target.scrollIntoView).toHaveBeenCalled();
    // The bug this exists to prevent: scrolling the container back to the top
    // immediately after the anchor was reached.
    expect(container.scrollTo).not.toHaveBeenCalled();
  });

  it('goes to the top for an ordinary navigation', () => {
    const { container, target } = setup();
    expect(scrollForNavigation({ container, hash: '' })).toBe('top');
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('goes to the top when the anchor does not exist', () => {
    // `/friends#incoming-requests` shipped for months pointing at nothing.
    const { container } = setup();
    expect(scrollForNavigation({ container, hash: '#nope' })).toBe('top');
    expect(container.scrollTo).toHaveBeenCalled();
  });

  it('accepts a hash with or without its leading #, and decodes it', () => {
    const { container, target } = setup();
    expect(scrollForNavigation({ container, hash: 'notes' })).toBe('anchor');
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(scrollForNavigation({ container, hash: '#%6Eotes' })).toBe('anchor');
  });

  it('does nothing before the container exists', () => {
    setup();
    expect(scrollForNavigation({ container: null, hash: '#notes' })).toBe(
      'none',
    );
  });
});
