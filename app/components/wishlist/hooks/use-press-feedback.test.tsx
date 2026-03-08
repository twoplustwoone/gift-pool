/**
 * @vitest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePressFeedback } from './use-press-feedback';

if (typeof PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      Object.defineProperty(this, 'pointerId', {
        value: props.pointerId ?? 0,
        enumerable: true,
      });
      Object.defineProperty(this, 'pointerType', {
        value: props.pointerType ?? '',
        enumerable: true,
      });
    }
  }
  // @ts-expect-error - jsdom polyfill
  global.PointerEvent = MockPointerEvent;
}

const TestRow = ({ onClick }: { onClick?: React.MouseEventHandler }) => {
  const { pressed, rowProps } = usePressFeedback<HTMLDivElement>({ onClick });

  return (
    <div
      data-testid="press-row"
      data-pressed={pressed ? 'true' : 'false'}
      {...rowProps}
    >
      Row
    </div>
  );
};

const dispatchPointerEvent = (
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: PointerEventInit,
) => {
  act(() => {
    element.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, ...init }),
    );
  });
};

describe('usePressFeedback', () => {
  it('triggers the click handler for a simple touch tap', async () => {
    const handleClick = vi.fn();
    render(<TestRow onClick={handleClick} />);

    const row = screen.getByTestId('press-row');

    dispatchPointerEvent(row, 'pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    });

    await waitFor(() => expect(row.getAttribute('data-pressed')).toBe('true'));

    dispatchPointerEvent(row, 'pointerup', {
      pointerId: 1,
      pointerType: 'touch',
    });

    await waitFor(() => expect(handleClick).toHaveBeenCalledTimes(1));
    expect(row.getAttribute('data-pressed')).toBe('false');
  });

  it('cancels the press when movement exceeds tolerance', async () => {
    const handleClick = vi.fn();
    render(<TestRow onClick={handleClick} />);

    const row = screen.getByTestId('press-row');

    dispatchPointerEvent(row, 'pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    });
    dispatchPointerEvent(row, 'pointermove', {
      pointerId: 2,
      clientX: 20,
      clientY: 0,
    });

    await waitFor(() => expect(row.getAttribute('data-pressed')).toBe('false'));

    dispatchPointerEvent(row, 'pointerup', {
      pointerId: 2,
      pointerType: 'touch',
    });
    await waitFor(() => expect(handleClick).not.toHaveBeenCalled());
  });
});
