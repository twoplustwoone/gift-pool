/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATIONS_REFRESH_EVENT } from '#app/utils/web-push.client.ts';
import { useNotificationPolling } from './use-notification-polling.ts';

const setUnreadCount = vi.fn();
vi.mock('#app/components/notifications/notifications-context.tsx', () => ({
  useNotificationsStore: () => ({ unreadCount: 0, setUnreadCount }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setUnreadCount.mockReset();
  fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ unreadCount: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useNotificationPolling', () => {
  it('refreshes the unread count when the SW relay event fires', async () => {
    renderHook(() => useNotificationPolling());

    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));

    await waitFor(() => expect(setUnreadCount).toHaveBeenCalledWith(7));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/unread-count',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('refreshes when the tab regains focus', async () => {
    renderHook(() => useNotificationPolling());

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(setUnreadCount).toHaveBeenCalledWith(7));
  });
});
