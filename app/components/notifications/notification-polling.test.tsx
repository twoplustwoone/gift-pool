/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPolling } from './notification-polling.tsx';

const useNotificationPolling = vi.fn();
vi.mock('#app/hooks/use-notification-polling.ts', () => ({
  useNotificationPolling: () => useNotificationPolling(),
}));

describe('NotificationPolling', () => {
  it('runs the polling hook and renders nothing', () => {
    const { container } = render(<NotificationPolling />);
    expect(useNotificationPolling).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
