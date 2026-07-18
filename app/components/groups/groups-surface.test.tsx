/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetcherSubmit = vi.fn();
const toastSuccess = vi.fn();
const clipboardWriteText = vi.fn();
const pressState = {
  pressed: false,
  rowProps: {},
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: undefined,
      load: vi.fn(),
      state: 'idle',
      submit: fetcherSubmit,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: (...args: Array<unknown>) => toastSuccess(...args),
  },
}));

vi.mock('#app/components/wishlist/hooks/use-press-feedback.ts', () => ({
  usePressFeedback: () => pressState,
}));

vi.mock('#app/components/ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault() {} })}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { GroupActions } from './GroupActions.tsx';
import { GroupCard } from './GroupCard.tsx';
import { GroupHeaderCard } from './GroupHeaderCard.tsx';
import { InviteCard } from './InviteCard.tsx';

beforeEach(() => {
  fetcherSubmit.mockReset();
  toastSuccess.mockReset();
  clipboardWriteText.mockReset();
  pressState.pressed = false;
  pressState.rowProps = {};
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: clipboardWriteText,
    },
  });
});

function renderWithRouter(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

describe('group surface components', () => {
  it('renders group cards, supports click and keyboard open, and shows manage settings for non-members', async () => {
    const onOpen = vi.fn();

    renderWithRouter(
      <GroupCard
        g={{
          createdAtDisplay: 'March 30, 2026',
          description: 'Birthday planning',
          id: 'group-1',
          memberCount: 4,
          myRole: 'ADMIN',
          name: 'Family',
        }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText('Birthday planning')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('March 30, 2026')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /manage/i }),
    ).toHaveAttribute('href', '/groups/group-1');

    await userEvent.click(screen.getByRole('link', { name: 'Open group Family' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('link', { name: 'Open group Family' }), {
      key: 'Enter',
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('marks the card as pressed and hides manage settings for members', () => {
    pressState.pressed = true;

    renderWithRouter(
      <GroupCard
        g={{
          createdAtDisplay: 'March 30, 2026',
          description: null,
          id: 'group-2',
          memberCount: 2,
          myRole: 'MEMBER',
          name: 'Friends',
        }}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open group Friends' })).toHaveAttribute(
      'data-pressed',
      'true',
    );
    expect(
      screen.queryByRole('link', { name: /manage group/i }),
    ).not.toBeInTheDocument();
  });

  it('submits leave and delete intents from the group actions menu', async () => {
    renderWithRouter(
      <GroupActions
        canDelete
        canLeave
        canSettings
        extraItems={<div>Extra action</div>}
        giftGroupId="group-42"
      />,
    );

    expect(
      screen.getByRole('link', { name: /settings/i }),
    ).toHaveAttribute('href', '/groups/group-42/settings');
    expect(screen.getByText('Extra action')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /leave group/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete group/i }));

    expect(fetcherSubmit).toHaveBeenCalledTimes(2);

    const leaveCall = fetcherSubmit.mock.calls[0];
    if (!leaveCall) {
      throw new Error('expected leave call');
    }
    const leaveData = leaveCall[0] as FormData;
    expect(leaveData.get('giftGroupId')).toBe('group-42');
    expect(leaveData.get('intent')).toBe('leave-gift-group');
    expect(leaveCall[1]).toEqual({
      action: '/groups/group-42',
      method: 'post',
    });

    const deleteCall = fetcherSubmit.mock.calls[1];
    if (!deleteCall) {
      throw new Error('expected delete call');
    }
    const deleteData = deleteCall[0] as FormData;
    expect(deleteData.get('intent')).toBe('delete-gift-group');
  });

  it('shows the invite helper when there is no active invite url', () => {
    render(<InviteCard url={null} />);

    expect(
      screen.getByText('Use the Invite button in the header to create a link.'),
    ).toBeInTheDocument();
  });

  it('copies the invite link and renders optional footer content', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    const onCopy = vi.fn();

    render(
      <InviteCard
        footer={<div>Invite footer</div>}
        onCopy={onCopy}
        url="https://example.com/invite/abc123"
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy invite link' }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith(
      'https://example.com/invite/abc123',
    );
    expect(toastSuccess).toHaveBeenCalledWith('Invite link copied');
    expect(onCopy).toHaveBeenCalled();
    expect(screen.getByText('Invite footer')).toBeInTheDocument();
  });

  it('renders the group header stats and optional actions', () => {
    render(
      <GroupHeaderCard
        actions={<button type="button">Open menu</button>}
        description="Plan shared gifts"
        name="Family"
        stats={[
          { label: 'Members', value: 4 },
          { label: 'Open gifts', value: 2 },
          { label: 'Upcoming', value: '3 birthdays' },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
    expect(screen.getByText('Plan shared gifts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Open gifts')).toBeInTheDocument();
    expect(screen.getByText('3 birthdays')).toBeInTheDocument();
  });
});
