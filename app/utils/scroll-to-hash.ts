/**
 * Where a navigation should leave the scroll container.
 *
 * Window scrolling is disabled app-wide (`body` is `overflow-hidden`; the page
 * scrolls inside `[data-testid="app-scroll-area"]`), which has two
 * consequences that together broke every anchor link:
 *
 *  - React Router's `ScrollRestoration` calls `scrollIntoView` on the element,
 *    which works — but the root's scroll-reset effect then ran in a
 *    `requestAnimationFrame`, i.e. AFTER that layout effect, and scrolled the
 *    container back to the top.
 *  - The reset's cache key includes the hash, so arriving at `#notes` counted
 *    as a fresh navigation and triggered exactly that reset.
 *
 * So the container owns both behaviours: a hash scrolls its target into view,
 * and everything else goes to the top.
 */
export function scrollForNavigation({
  container,
  hash,
  doc = document,
}: {
  container: HTMLElement | null;
  /** `location.hash`, with or without its leading `#`. */
  hash: string;
  doc?: Document;
}): 'anchor' | 'top' | 'none' {
  if (!container) return 'none';
  const id = hash.replace(/^#/, '');
  if (id) {
    const target = doc.getElementById(decodeURIComponent(id));
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      return 'anchor';
    }
    // A dangling anchor falls through to the top rather than leaving the page
    // wherever the previous route happened to be.
  }
  container.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  return 'top';
}
