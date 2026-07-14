/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submit = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      data: undefined,
      formData: undefined,
      state: 'idle',
      submit,
    }),
  };
});

vi.mock('#app/components/ui/responsive-dialog.tsx', () => ({
  ResponsiveDialog: ({ children }: { children: React.ReactNode }) => children,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogDescription: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <p>{children}</p>,
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import {
  ContextNotificationAwarenessNotice,
  ContextNotificationControl,
} from './context-notification-controls.tsx';

const baseAwareness = {
  notificationOff: false,
  reason: null,
  noticeVisible: false,
  preference: {
    activityLevel: 'IMPORTANT_ONLY' as const,
    source: 'application_default' as const,
    customTopics: [],
  },
};

beforeEach(() => {
  submit.mockReset();
});

describe('context notification controls', () => {
  it('shows a personal activity control and hides Custom with no contextual topics', () => {
    render(
      <MemoryRouter>
        <ContextNotificationControl
          context={{ kind: 'GROUP', groupId: 'group-1' }}
          contextLabel="Family"
          awareness={baseAwareness}
          availableTopics={[]}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', {
        name: 'Notifications for Family: Important',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Custom topics')).not.toBeInTheDocument();
  });

  it('explains inherited pool settings and allows a local important override', async () => {
    render(
      <MemoryRouter>
        <ContextNotificationControl
          context={{ kind: 'POOL', poolId: 'pool-1' }}
          contextLabel="Birthday pool"
          inheritedFromLabel="Family"
          awareness={{
            notificationOff: true,
            reason: 'inherited_mute',
            noticeVisible: true,
            preference: {
              activityLevel: 'MUTED',
              source: 'group_override',
              customTopics: [],
            },
          }}
          availableTopics={[]}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/using the notification setting from/i),
    ).toHaveTextContent('Family');
    await userEvent.click(
      screen.getByRole('radio', { name: /important only/i }),
    );
    const formData = submit.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toMatchObject({
      intent: 'set-activity',
      contextKind: 'POOL',
      contextId: 'pool-1',
      activityLevel: 'IMPORTANT_ONLY',
    });
  });

  it('keeps the muted indicator while letting the reason notice be dismissed', async () => {
    const awareness = {
      notificationOff: true,
      reason: 'explicit_mute' as const,
      noticeVisible: true,
      preference: {
        activityLevel: 'MUTED' as const,
        source: 'group_override' as const,
        customTopics: [],
      },
    };
    render(
      <MemoryRouter>
        <ContextNotificationControl
          context={{ kind: 'GROUP', groupId: 'group-1' }}
          contextLabel="Family"
          awareness={awareness}
          availableTopics={[]}
        />
        <ContextNotificationAwarenessNotice
          context={{ kind: 'GROUP', groupId: 'group-1' }}
          contextLabel="Family"
          awareness={awareness}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Notifications for Family: Muted' }),
    ).toBeInTheDocument();
    expect(screen.getByText('You muted Family')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: /dismiss notification settings notice/i,
      }),
    );
    const formData = submit.mock.calls.at(-1)?.[0] as FormData;
    expect(Object.fromEntries(formData)).toMatchObject({
      intent: 'dismiss-notice',
      contextKind: 'GROUP',
      contextId: 'group-1',
    });
  });

  it('labels a context Off when every account delivery channel is disabled', () => {
    render(
      <MemoryRouter>
        <ContextNotificationControl
          context={{ kind: 'GROUP', groupId: 'group-1' }}
          contextLabel="Family"
          awareness={{
            ...baseAwareness,
            notificationOff: true,
            reason: 'no_channels',
            noticeVisible: true,
          }}
          availableTopics={[]}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Notifications for Family: Off' }),
    ).toBeInTheDocument();
  });
});
