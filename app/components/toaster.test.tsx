/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type Toast } from '#app/utils/toast.server.ts';
import { resetToastHistory, useToast } from './toaster.tsx';

vi.mock('sonner', () => {
  const success = vi.fn();
  const error = vi.fn();
  const message = vi.fn();

  return {
    toast: { success, error, message },
  };
});

beforeEach(() => {
  resetToastHistory();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const TestToast = ({ toast }: { toast: Toast }) => {
  useToast(toast);
  return null;
};

describe('useToast', () => {
  test('deduplicates identical toasts across instances', () => {
    vi.useFakeTimers();
    const toast: Toast = {
      id: 'toast-1',
      type: 'success',
      title: 'Item added',
      description: 'Wishlist item added.',
    };

    render(
      <>
        <TestToast toast={toast} />
        <TestToast toast={toast} />
      </>,
    );

    vi.runAllTimers();
    vi.useRealTimers();

    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
    expect(sonnerToast.success).toHaveBeenCalledWith(toast.title, {
      description: toast.description,
      id: toast.id,
    });
  });

  test('shows new toasts when the id changes', () => {
    vi.useFakeTimers();
    const firstToast: Toast = {
      id: 'toast-1',
      type: 'success',
      title: 'First',
      description: 'First toast',
    };
    const secondToast: Toast = {
      id: 'toast-2',
      type: 'success',
      title: 'Second',
      description: 'Second toast',
    };

    render(
      <>
        <TestToast toast={firstToast} />
        <TestToast toast={secondToast} />
      </>,
    );

    vi.runAllTimers();
    vi.useRealTimers();

    expect(sonnerToast.success).toHaveBeenCalledTimes(2);
    expect(sonnerToast.success).toHaveBeenNthCalledWith(1, firstToast.title, {
      description: firstToast.description,
      id: firstToast.id,
    });
    expect(sonnerToast.success).toHaveBeenNthCalledWith(2, secondToast.title, {
      description: secondToast.description,
      id: secondToast.id,
    });
  });
});
