/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clipboardWriteText = vi.fn();
const toastSuccess = vi.fn();

const fetcherState = {
  data: undefined as undefined | { inviteUrl?: string },
  state: 'idle' as 'idle' | 'submitting',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherState.data,
      state: fetcherState.state,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: (...args: Array<unknown>) => toastSuccess(...args) },
}));

import { GroupInviteButton } from './group-invite-button.tsx';

beforeEach(() => {
  clipboardWriteText.mockReset().mockResolvedValue(undefined);
  toastSuccess.mockReset();
  fetcherState.data = undefined;
  fetcherState.state = 'idle';
  vi.stubGlobal('navigator', {
    clipboard: { writeText: clipboardWriteText },
  });
});

describe('GroupInviteButton', () => {
  it('copies an existing invite link and toasts', async () => {
    render(
      <GroupInviteButton giftGroupId="g1" inviteLink="https://x/join/abc" />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Invite to group' }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith('https://x/join/abc');
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Invite link copied'),
    );
  });

  it('renders a create-invite-link submit when there is no link yet', () => {
    render(<GroupInviteButton giftGroupId="g1" inviteLink={null} />);

    const button = screen.getByRole('button', { name: 'Invite to group' });
    expect(button).toBeInTheDocument();
    // Reuses the existing create-invite-link action — no new mechanism.
    const form = button.closest('form');
    expect(form?.querySelector('input[name="intent"]')).toHaveValue(
      'create-invite-link',
    );
  });

  it('copies a freshly created link silently (server toast covers it)', async () => {
    // The action has settled and returned a new invite URL.
    fetcherState.data = { inviteUrl: 'https://x/join/new' };
    fetcherState.state = 'idle';

    render(<GroupInviteButton giftGroupId="g1" inviteLink={null} />);

    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith('https://x/join/new'),
    );
    // No client-side toast on the create path — avoids doubling the server one.
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
