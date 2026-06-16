/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const getUserId = vi.fn();
const requireUserId = vi.fn();
const verifyPreferenceToken = vi.fn();
const ensureNotificationPreferencesForUser = vi.fn();
const getNotificationPreferences = vi.fn();
const setNotificationPreference = vi.fn();
const disableEmailForAll = vi.fn();

const loaderDataSnapshot = {
  isAuthenticated: true,
  preferences: [
    {
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
      type: 'FRIEND_REQUEST_RECEIVED',
    },
    {
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: false,
      type: 'FRIEND_REQUEST_ACCEPTED',
    },
  ],
  targetUserId: 'user-1' as string | null,
  tokenValid: false,
  viewerUserId: 'user-1' as string | null,
};

const toggleFetcherState = {
  data: undefined as undefined | { ok?: boolean; requestId?: string | null },
  state: 'idle' as 'idle' | 'submitting',
  submit: vi.fn(),
};

const disableFetcherState = {
  data: undefined as undefined | { ok?: boolean; requestId?: string | null },
  state: 'idle' as 'idle' | 'submitting',
  submit: vi.fn(),
};

let useFetcherCallCount = 0;

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => {
      useFetcherCallCount += 1;
      const state = useFetcherCallCount % 2 === 1 ? toggleFetcherState : disableFetcherState;
      return {
        Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
        data: state.data,
        state: state.state,
        submit: state.submit,
      };
    },
    useLoaderData: () => loaderDataSnapshot,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
  };
});

const webPushState = {
  status: 'unsupported' as string,
  isBusy: false,
  subscribe: vi.fn().mockResolvedValue(true),
  unsubscribe: vi.fn().mockResolvedValue(true),
  refresh: vi.fn(),
};

vi.mock('#app/hooks/use-web-push.ts', () => ({
  useWebPush: () => webPushState,
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/notification-preference-token.server.ts', () => ({
  verifyPreferenceToken: (...args: Array<unknown>) => verifyPreferenceToken(...args),
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  disableEmailForAll: (...args: Array<unknown>) => disableEmailForAll(...args),
  ensureNotificationPreferencesForUser: (...args: Array<unknown>) =>
    ensureNotificationPreferencesForUser(...args),
  getNotificationPreferences: (...args: Array<unknown>) =>
    getNotificationPreferences(...args),
  setNotificationPreference: (...args: Array<unknown>) =>
    setNotificationPreference(...args),
}));

vi.mock('#app/components/ui/checkbox.tsx', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange?: (next: boolean) => void;
  }) => (
    <input
      checked={checked}
      disabled={disabled}
      onChange={() => onCheckedChange?.(!checked)}
      type="checkbox"
    />
  ),
}));

import NotificationsSettingsRoute, {
  action,
  loader,
} from './profile.notifications.tsx';

function renderRoute() {
  return render(
    <MemoryRouter>
      <NotificationsSettingsRoute />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getUserId.mockReset();
  requireUserId.mockReset();
  verifyPreferenceToken.mockReset();
  ensureNotificationPreferencesForUser.mockReset();
  ensureNotificationPreferencesForUser.mockResolvedValue(undefined);
  getNotificationPreferences.mockReset();
  setNotificationPreference.mockReset();
  disableEmailForAll.mockReset();
  toggleFetcherState.data = undefined;
  toggleFetcherState.state = 'idle';
  toggleFetcherState.submit.mockReset();
  disableFetcherState.data = undefined;
  disableFetcherState.state = 'idle';
  disableFetcherState.submit.mockReset();
  useFetcherCallCount = 0;
  webPushState.status = 'unsupported';
  webPushState.subscribe.mockClear();
  webPushState.unsubscribe.mockClear();

  loaderDataSnapshot.isAuthenticated = true;
  loaderDataSnapshot.preferences = [
    {
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
      type: 'FRIEND_REQUEST_RECEIVED',
    },
    {
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: false,
      type: 'FRIEND_REQUEST_ACCEPTED',
    },
  ];
  loaderDataSnapshot.targetUserId = 'user-1';
  loaderDataSnapshot.tokenValid = false;
  loaderDataSnapshot.viewerUserId = 'user-1';
});

describe('settings notifications route module', () => {
  it('redirects anonymous users without a token and hydrates authenticated preferences', async () => {
    getUserId.mockResolvedValueOnce(null);
    verifyPreferenceToken.mockReturnValue(null);

    await expect(
      loader(
        toLoaderArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/settings/profile/notifications'),
        }),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const preferenceMap = new Map([
      ['FRIEND_REQUEST_RECEIVED', { emailEnabled: false, inAppEnabled: true }],
    ]);
    getUserId.mockResolvedValueOnce('user-1');
    verifyPreferenceToken.mockReturnValue(null);
    getNotificationPreferences.mockResolvedValue(preferenceMap);

    const result = await loader(
      toLoaderArgs({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/settings/profile/notifications'),
      }),
    );

    expect(result).toEqual({
      isAuthenticated: true,
      preferences: [
        {
          emailEnabled: false,
          inAppEnabled: true,
          type: 'FRIEND_REQUEST_RECEIVED',
        },
      ],
      targetUserId: 'user-1',
      tokenValid: false,
      viewerUserId: 'user-1',
    });
  });

  it('allows token-based preference viewing when the token is valid', async () => {
    const preferenceMap = new Map([
      ['FRIEND_REQUEST_ACCEPTED', { emailEnabled: true, inAppEnabled: false }],
    ]);
    getUserId.mockResolvedValue(null);
    verifyPreferenceToken.mockReturnValue({ uid: 'user-2' });
    getNotificationPreferences.mockResolvedValue(preferenceMap);

    const result = await loader(
      toLoaderArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/settings/profile/notifications?token=abc',
        ),
      }),
    );

    expect(result).toEqual({
      isAuthenticated: false,
      preferences: [
        {
          emailEnabled: true,
          inAppEnabled: false,
          type: 'FRIEND_REQUEST_ACCEPTED',
        },
      ],
      targetUserId: 'user-2',
      tokenValid: true,
      viewerUserId: null,
    });
  });

  it('handles toggle, disable-email, and invalid action payloads', async () => {
    requireUserId.mockResolvedValue('user-1');

    const toggleResult = await action(
        toActionArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/settings/profile/notifications', {
            body: new URLSearchParams({
              channel: 'EMAIL',
              enabled: 'false',
              intent: 'toggle',
              requestId: 'toggle-1',
              type: 'FRIEND_REQUEST_RECEIVED',
            }).toString(),
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
          method: 'POST',
        }),
      }),
    );

    expect(setNotificationPreference).toHaveBeenCalledWith(
      'user-1',
      'FRIEND_REQUEST_RECEIVED',
      'EMAIL',
      false,
      'settings:notifications',
    );
    expect(toggleResult).toEqual({
      ok: true,
      requestId: 'toggle-1',
    });

    const disableResult = await action(
        toActionArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/settings/profile/notifications', {
            body: new URLSearchParams({
              intent: 'disable-email',
              requestId: 'disable-1',
            }).toString(),
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
          method: 'POST',
        }),
      }),
    );

    expect(disableEmailForAll).toHaveBeenCalledWith(
      'user-1',
      'settings:notifications',
    );
    expect(disableResult).toEqual({
      ok: true,
      requestId: 'disable-1',
    });

    const invalidIntent = await action(
        toActionArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/settings/profile/notifications', {
            body: new URLSearchParams({
              intent: 'unknown',
              requestId: 'invalid-1',
            }).toString(),
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
          method: 'POST',
        }),
      }),
    );

    expect(getRouteResultStatus(invalidIntent)).toBe(400);
    await expect(getRouteResultData(invalidIntent)).resolves.toEqual({
      ok: false,
      requestId: 'invalid-1',
    });

    await expect(
      action(
        toActionArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/settings/profile/notifications',
            {
              body: new URLSearchParams({
                channel: 'EMAIL',
                enabled: 'true',
                intent: 'toggle',
                type: 'NOT_A_REAL_TYPE',
              }).toString(),
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
              },
              method: 'POST',
            },
          ),
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('settings notifications route component', () => {
  it('shows the one-time link prompt and disables updates when unauthenticated', () => {
    loaderDataSnapshot.isAuthenticated = false;
    loaderDataSnapshot.viewerUserId = null;
    loaderDataSnapshot.tokenValid = true;

    renderRoute();

    expect(
      screen.getByText('You are viewing notification preferences with a one-time link.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /sign in to update your preferences/i }),
    ).toHaveAttribute('href', '/login?redirectTo=/settings/profile/notifications');
    expect(
      screen.getAllByRole('checkbox', { name: /enable email/i })[0],
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /turn off all email notifications/i }),
    ).not.toBeInTheDocument();
  });

  it('optimistically toggles a preference and rolls it back when the request fails', async () => {
    const { rerender } = renderRoute();

    const emailToggle = screen.getAllByRole('checkbox', {
      name: /enable email/i,
    })[0];
    if (!emailToggle) throw new Error('expected email toggle');

    expect(emailToggle).toBeChecked();
    await userEvent.click(emailToggle);

    expect(emailToggle).not.toBeChecked();
    const toggleFormData = toggleFetcherState.submit.mock.calls[0]?.[0] as
      | FormData
      | undefined;
    const toggleRequestId = toggleFormData?.get('requestId');

    toggleFetcherState.state = 'submitting';
    toggleFetcherState.data = undefined;
    useFetcherCallCount = 0;
    rerender(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    toggleFetcherState.state = 'idle';
    toggleFetcherState.data = {
      ok: false,
      requestId:
        typeof toggleRequestId === 'string' ? toggleRequestId : 'toggle-request',
    };
    useFetcherCallCount = 0;
    rerender(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox', { name: /enable email/i })[0]).toBeChecked();
    });
    expect(toggleFetcherState.submit).toHaveBeenCalledTimes(1);
  });

  it('optimistically disables all email notifications and keeps the change on success', async () => {
    const { rerender } = renderRoute();

    await userEvent.click(
      screen.getByRole('button', { name: /turn off all email notifications/i }),
    );

    expect(
      screen.getAllByRole('checkbox', { name: /enable email/i }).every(
        (checkbox) => !(checkbox as HTMLInputElement).checked,
      ),
    ).toBe(true);
    const disableFormData = disableFetcherState.submit.mock.calls[0]?.[0] as
      | FormData
      | undefined;
    const disableRequestId = disableFormData?.get('requestId');

    disableFetcherState.state = 'submitting';
    useFetcherCallCount = 0;
    rerender(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    disableFetcherState.state = 'idle';
    disableFetcherState.data = {
      ok: true,
      requestId:
        typeof disableRequestId === 'string'
          ? disableRequestId
          : 'disable-request',
    };
    useFetcherCallCount = 0;
    rerender(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole('checkbox', { name: /enable email/i }).every(
          (checkbox) => !(checkbox as HTMLInputElement).checked,
        ),
      ).toBe(true);
    });
    expect(disableFetcherState.submit).toHaveBeenCalledTimes(1);
  });

  describe('push column', () => {
    it('shows the Push column and "on" banner when subscribed', () => {
      webPushState.status = 'subscribed';
      renderRoute();
      expect(
        screen.getByRole('columnheader', { name: 'Push' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/push notifications are on for this device/i),
      ).toBeInTheDocument();
    });

    it('offers the enable button when push is available but off', () => {
      webPushState.status = 'default';
      renderRoute();
      expect(
        screen.getByRole('button', { name: /enable push notifications/i }),
      ).toBeInTheDocument();
    });

    it('guides iOS users to install first', () => {
      webPushState.status = 'ios-needs-install';
      renderRoute();
      expect(
        screen.getByText(/add giftpool to your home screen/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /how to install/i }),
      ).toBeInTheDocument();
    });

    it('hides the Push column entirely when unsupported', () => {
      webPushState.status = 'unsupported';
      renderRoute();
      expect(
        screen.queryByRole('columnheader', { name: 'Push' }),
      ).not.toBeInTheDocument();
    });
  });
});
