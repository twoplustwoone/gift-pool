import { expect, test, vi } from 'vitest';
import { createRootErrorReporter } from './root-error-reporter.ts';

test('errors raised before the reporter connects are delivered in order once it does', () => {
  const { onRootError, connect } = createRootErrorReporter();
  const first = new Error('hydration mismatch');
  const second = new Error('render crash');

  onRootError(first, { componentStack: 'in h1' });
  onRootError(second, { componentStack: 'in main' });

  const report = vi.fn();
  connect(report);

  expect(report.mock.calls).toEqual([
    [first, { componentStack: 'in h1' }],
    [second, { componentStack: 'in main' }],
  ]);
});

test('errors raised after the reporter connects go straight to it, once each', () => {
  const { onRootError, connect } = createRootErrorReporter();
  const report = vi.fn();
  connect(report);

  const error = new Error('late crash');
  onRootError(error, { componentStack: 'in footer' });

  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(error, { componentStack: 'in footer' });
});
