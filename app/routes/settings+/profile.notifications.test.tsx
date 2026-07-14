/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const getUserId = vi.fn();
const requireUserId = vi.fn();
const verifyPreferenceToken = vi.fn();
const getCentralNotificationSettings = vi.fn();
const setGlobalChannelPreference = vi.fn();
const setCategoryChannelPreference = vi.fn();
const setTopicChannelPreference = vi.fn();
const setNotificationPreference = vi.fn();
const disableEmailForAll = vi.fn();
const submit = vi.fn();

const loaderDataSnapshot = {
  canEdit: true,
  isAuthenticated: true,
  targetUserId: 'user-1',
  tokenValid: false,
  settings: {
    channels: {
      IN_APP: { enabled: true, source: 'application_default' },
      EMAIL: { enabled: true, source: 'application_default' },
      WEB_PUSH: { enabled: true, source: 'application_default' },
    },
    topics: [
      {
        topic: 'FRIEND_REQUESTS',
        category: 'SOCIAL',
        channels: {
          IN_APP: { enabled: true },
          EMAIL: { enabled: true },
          WEB_PUSH: { enabled: false },
        },
      },
      {
        topic: 'BIRTHDAY_REMINDERS',
        category: 'OCCASIONS',
        channels: {
          IN_APP: { enabled: true },
          EMAIL: { enabled: false },
          WEB_PUSH: { enabled: false },
        },
      },
    ],
  },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: ({ children }: React.ComponentProps<'form'>) => (
        <form onSubmit={(event) => event.preventDefault()}>{children}</form>
      ),
      data: undefined,
      formData: undefined,
      state: 'idle',
      submit,
    }),
    useLoaderData: () => loaderDataSnapshot,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
  };
});

vi.mock('#app/hooks/use-web-push.ts', () => ({
  useWebPush: () => ({
    status: 'unsupported',
    isBusy: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/notification-preference-token.server.ts', () => ({
  verifyPreferenceToken: (...args: Array<unknown>) =>
    verifyPreferenceToken(...args),
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  disableEmailForAll: (...args: Array<unknown>) => disableEmailForAll(...args),
  getCentralNotificationSettings: (...args: Array<unknown>) =>
    getCentralNotificationSettings(...args),
  setCategoryChannelPreference: (...args: Array<unknown>) =>
    setCategoryChannelPreference(...args),
  setGlobalChannelPreference: (...args: Array<unknown>) =>
    setGlobalChannelPreference(...args),
  setNotificationPreference: (...args: Array<unknown>) =>
    setNotificationPreference(...args),
  setTopicChannelPreference: (...args: Array<unknown>) =>
    setTopicChannelPreference(...args),
}));

import NotificationsSettingsRoute, {
  action,
  loader,
} from './profile.notifications.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  loaderDataSnapshot.canEdit = true;
  loaderDataSnapshot.isAuthenticated = true;
  loaderDataSnapshot.targetUserId = 'user-1';
  loaderDataSnapshot.tokenValid = false;
  getCentralNotificationSettings.mockResolvedValue(loaderDataSnapshot.settings);
});

describe('notification settings route', () => {
  it('redirects anonymous visitors without a valid preference token', async () => {
    getUserId.mockResolvedValue(null);
    verifyPreferenceToken.mockReturnValue(null);

    await expect(
      loader(
        toLoaderArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/settings/profile/notifications',
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('loads a valid token view as read-only', async () => {
    getUserId.mockResolvedValue(null);
    verifyPreferenceToken.mockReturnValue({ uid: 'user-2' });

    await expect(
      loader(
        toLoaderArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/settings/profile/notifications?token=valid',
          ),
        }),
      ),
    ).resolves.toMatchObject({
      canEdit: false,
      isAuthenticated: false,
      targetUserId: 'user-2',
      tokenValid: true,
    });
    expect(getCentralNotificationSettings).toHaveBeenCalledWith('user-2');
  });

  it('handles global, category, and topic mutations', async () => {
    requireUserId.mockResolvedValue('user-1');
    const cases = [
      {
        fields: { intent: 'global-channel', channel: 'EMAIL' },
        fn: setGlobalChannelPreference,
        expected: { channel: 'EMAIL' },
      },
      {
        fields: {
          intent: 'category-channel',
          category: 'SOCIAL',
          channel: 'IN_APP',
        },
        fn: setCategoryChannelPreference,
        expected: { category: 'SOCIAL', channel: 'IN_APP' },
      },
      {
        fields: {
          intent: 'topic-channel',
          topic: 'BIRTHDAY_REMINDERS',
          channel: 'WEB_PUSH',
        },
        fn: setTopicChannelPreference,
        expected: { topic: 'BIRTHDAY_REMINDERS', channel: 'WEB_PUSH' },
      },
    ] as const;

    for (const testCase of cases) {
      await action(
        toActionArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/settings/profile/notifications',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                ...testCase.fields,
                enabled: 'false',
              }).toString(),
            },
          ),
        }),
      );
      expect(testCase.fn).toHaveBeenCalledWith({
        userId: 'user-1',
        enabled: false,
        source: 'settings:notifications',
        ...testCase.expected,
      });
    }

    const invalid = await action(
      toActionArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/settings/profile/notifications',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ intent: 'unknown' }).toString(),
          },
        ),
      }),
    );
    expect(getRouteResultStatus(invalid)).toBe(400);
  });
});

describe('notification settings UI', () => {
  it('shows one topic control for the shared friend-request topic', () => {
    render(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Friend requests')).toHaveLength(1);
    expect(screen.getByText('Delivery channels')).toBeInTheDocument();
    expect(screen.getByText('Upcoming birthdays')).toBeInTheDocument();
  });

  it('submits account-level channel switches optimistically', async () => {
    render(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    await userEvent.click(
      screen.getByRole('switch', { name: 'Email notifications' }),
    );
    const formData = submit.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toMatchObject({
      intent: 'global-channel',
      channel: 'EMAIL',
      enabled: 'false',
    });
  });

  it('disables every preference control in token view and offers sign-in', () => {
    loaderDataSnapshot.canEdit = false;
    loaderDataSnapshot.isAuthenticated = false;
    loaderDataSnapshot.tokenValid = true;
    render(
      <MemoryRouter>
        <NotificationsSettingsRoute />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', {
        name: /sign in to edit notification preferences/i,
      }),
    ).toBeInTheDocument();
    for (const control of screen.getAllByRole('switch')) {
      expect(control).toBeDisabled();
    }
    expect(
      screen.queryByText(/enable on this device/i),
    ).not.toBeInTheDocument();
  });
});
