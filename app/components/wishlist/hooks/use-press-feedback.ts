import * as React from 'react';

type PressHandlers = {
  onClick?: React.MouseEventHandler;
};

export function usePressFeedback<T extends HTMLElement>(
  { onClick }: PressHandlers = {},
  moveTolerance = 10, // px
) {
  const [pressed, setPressed] = React.useState(false);
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const cancelled = React.useRef(false);

  const onPointerDown: React.PointerEventHandler<T> = (e) => {
    if (e.pointerType === 'touch') {
      start.current = { x: e.clientX, y: e.clientY };
      cancelled.current = false;
      setPressed(true);
    }
  };

  const onPointerMove: React.PointerEventHandler<T> = (e) => {
    if (!start.current) return;
    const dx = Math.abs(e.clientX - start.current.x);
    const dy = Math.abs(e.clientY - start.current.y);
    if (dx > moveTolerance || dy > moveTolerance) {
      // treat as scroll -> cancel press
      cancelled.current = true;
      setPressed(false);
    }
  };

  const clear = () => {
    start.current = null;
    setPressed(false);
  };

  const onPointerUp: React.PointerEventHandler<T> = (e) => {
    const wasCancelled = cancelled.current;
    clear();
    if (!wasCancelled && onClick) {
      // synthesize click for touch taps
      // (the real onClick will also fire; either is fine)
      onClick(e as unknown as React.MouseEvent<T, MouseEvent>);
    }
  };

  const onPointerCancel: React.PointerEventHandler<T> = () => {
    cancelled.current = true;
    clear();
  };

  // Keyboard support: show pressed on Space/Enter
  const onKeyDown: React.KeyboardEventHandler<T> = (e) => {
    if (e.key === ' ' || e.key === 'Enter') setPressed(true);
  };
  const onKeyUp: React.KeyboardEventHandler<T> = () => setPressed(false);

  return {
    pressed,
    rowProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
      onKeyUp,
    } as React.HTMLAttributes<T>,
  };
}
