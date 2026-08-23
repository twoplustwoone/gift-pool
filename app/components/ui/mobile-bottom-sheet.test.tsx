/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetTitle,
} from './mobile-bottom-sheet';

/**
 * The sheet slides up over ~200ms, and until it arrives the overlay still
 * covers the strip it is heading for — so a tap aimed at a field lands
 * outside the content and Radix dismisses (#561). These cover the guard that
 * vetoes outside-dismissal for the length of the enter animation.
 *
 * jsdom runs no CSS animations, so the animationstart/animationend events
 * that arm and disarm the guard are dispatched directly. That is the same
 * signal the browser sends; only the trigger is synthetic.
 */
async function renderSheet(
  props: Partial<React.ComponentProps<typeof MobileBottomSheetContent>> = {},
  onOpenChange = vi.fn(),
) {
  render(
    <MobileBottomSheet open onOpenChange={onOpenChange}>
      <MobileBottomSheetContent {...props}>
        <MobileBottomSheetTitle>Sheet</MobileBottomSheetTitle>
        <input aria-label="Field" />
      </MobileBottomSheetContent>
    </MobileBottomSheet>,
  );
  // Radix registers its outside-pointerdown listener in a setTimeout(0);
  // firing before that flushes means nothing dismisses and every assertion
  // about "did not dismiss" passes for the wrong reason.
  // No React state update happens on that tick — Radix only registers a
  // listener — so this needs a bare macrotask, not act().
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { content: screen.getByRole('dialog'), onOpenChange };
}

const startEnterAnimation = (content: HTMLElement) => {
  // Radix stamps data-state="open"; the guard only arms for the enter run.
  fireEvent.animationStart(content, { animationName: 'slide-in-from-bottom' });
};

describe('MobileBottomSheetContent dismissal guard', () => {
  it('ignores an outside pointer down while the sheet is still animating in', async () => {
    const { content, onOpenChange } = await renderSheet();
    startEnterAnimation(content);

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('dismisses on an outside pointer down once the sheet has settled', async () => {
    const { content, onOpenChange } = await renderSheet();
    startEnterAnimation(content);
    fireEvent.animationEnd(content, { animationName: 'slide-in-from-bottom' });

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dismisses on an outside pointer down when no enter animation ran', async () => {
    // Reduced motion: the sheet is already in place, so the guard never arms.
    const { onOpenChange } = await renderSheet();

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not arm the guard for an animation bubbling up from a child', async () => {
    const { onOpenChange } = await renderSheet();
    fireEvent.animationStart(screen.getByLabelText('Field'), {
      animationName: 'some-child-animation',
    });

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('still forwards the animation and dismissal handlers a caller passes', async () => {
    const onAnimationStart = vi.fn();
    const onAnimationEnd = vi.fn();
    const onPointerDownOutside = vi.fn();
    const onInteractOutside = vi.fn();
    const { content } = await renderSheet({
      onAnimationStart,
      onAnimationEnd,
      onPointerDownOutside,
      onInteractOutside,
    });

    startEnterAnimation(content);
    expect(onAnimationStart).toHaveBeenCalled();

    fireEvent.animationEnd(content, { animationName: 'slide-in-from-bottom' });
    expect(onAnimationEnd).toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onPointerDownOutside).toHaveBeenCalled();
    expect(onInteractOutside).toHaveBeenCalled();
  });
});
