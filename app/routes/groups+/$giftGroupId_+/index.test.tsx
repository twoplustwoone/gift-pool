/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clipboardWriteText = vi.fn();
const track = vi.fn();

const loaderDataSnapshot = {
  canInvite: true,
  giftGroup: {
    createdAt: '2026-03-31T12:00:00.000Z',
    description: 'Birthday planning',
    id: 'group-1',
    name: 'Family',
  },
  inviteLink: 'https://giftpool.app/groups/join/invite-1' as string | null,
  viewer: {
    contributionCents: 1500,
  },
};

const fetcherState = {
  data: undefined as undefined | { inviteUrl?: string; status?: string },
  formData: undefined as FormData | undefined,
  state: 'idle' as 'idle' | 'submitting',
  submit: vi.fn(),
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherState.data,
      formData: fetcherState.formData,
      state: fetcherState.state,
      submit: fetcherState.submit,
    }),
    useRouteLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import GroupsDetailOverview from './index.tsx';

beforeEach(() => {
  clipboardWriteText.mockReset();
  track.mockReset();
  fetcherState.data = undefined;
  fetcherState.formData = undefined;
  fetcherState.state = 'idle';
  fetcherState.submit.mockReset();

  loaderDataSnapshot.canInvite = true;
  loaderDataSnapshot.giftGroup.description = 'Birthday planning';
  loaderDataSnapshot.inviteLink = 'https://giftpool.app/groups/join/invite-1';
  loaderDataSnapshot.viewer.contributionCents = 1500;

  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: clipboardWriteText,
    },
  });
});

describe('group detail overview route', () => {
  it('renders an existing invite link and copies it on demand', async () => {
    clipboardWriteText.mockResolvedValue(undefined);

    render(<GroupsDetailOverview />);

    expect(screen.getByText('Group Information')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.getByText('Birthday planning')).toBeInTheDocument();
    expect(screen.getByTestId('budget-amount')).toHaveTextContent('$15.00');

    await userEvent.click(
      screen.getByRole('button', { name: /copy invite link/i }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith(
      'https://giftpool.app/groups/join/invite-1',
    );
  });

  it('renders the create invite flow and updates after the fetcher succeeds', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    loaderDataSnapshot.inviteLink = null;

    const { rerender } = render(<GroupsDetailOverview />);

    expect(
      screen.getByRole('button', { name: /create & copy invite link/i }),
    ).toBeInTheDocument();

    const pendingFormData = new FormData();
    pendingFormData.set('intent', 'create-invite-link');
    fetcherState.formData = pendingFormData;
    fetcherState.state = 'submitting';
    rerender(<GroupsDetailOverview />);

    expect(
      screen.getByRole('button', { name: /creating\.\.\./i }),
    ).toBeDisabled();

    fetcherState.state = 'idle';
    fetcherState.data = {
      inviteUrl: 'https://giftpool.app/groups/join/invite-2',
    };
    rerender(<GroupsDetailOverview />);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://giftpool.app/groups/join/invite-2',
      );
    });
    expect(
      screen.getByRole('button', { name: /copy invite link/i }),
    ).toBeInTheDocument();
  });

  it('does not throw when clipboard.writeText rejects after fetcher resolves', async () => {
    clipboardWriteText.mockRejectedValue(
      new DOMException(
        'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
        'NotAllowedError',
      ),
    );
    loaderDataSnapshot.inviteLink = null;

    const { rerender } = render(<GroupsDetailOverview />);

    fetcherState.state = 'idle';
    fetcherState.data = {
      inviteUrl: 'https://giftpool.app/groups/join/invite-3',
    };
    rerender(<GroupsDetailOverview />);

    // The clipboard rejection should be swallowed — the component must remain mounted
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://giftpool.app/groups/join/invite-3',
      );
    });

    // Component is still functional after the rejection
    expect(
      screen.getByRole('button', { name: /copy invite link/i }),
    ).toBeInTheDocument();
  });

  it('shows the admin-only fallback when invite creation is unavailable', () => {
    loaderDataSnapshot.canInvite = false;
    loaderDataSnapshot.inviteLink = null;

    render(<GroupsDetailOverview />);

    expect(
      screen.getByText('No active invite link. Ask an admin to create one.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create & copy invite link/i }),
    ).not.toBeInTheDocument();
  });
});
