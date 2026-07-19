/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  canManageSettings: false,
  canDelete: false,
  canLeave: true,
  viewerMember: {
    userId: 'viewer-1',
    role: 'MEMBER',
    contributionCents: 3000,
    shareWishlist: true,
    shareBirthday: true,
  },
  giftGroup: {
    id: 'group-1',
    name: 'The Crew',
    description: 'Birthday pooling squad',
    groupMembers: [] as Array<unknown>,
    reminders: [] as Array<{ id: string; offsetDays: number }>,
  },
};

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    useLoaderData: () => loaderDataSnapshot,
    useActionData: () => undefined,
    useFetchers: () => [],
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: undefined,
      state: 'idle',
      submit: vi.fn(),
    }),
  };
});

import GroupSettingsRoute from './settings.tsx';

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/groups/group-1/settings']}>
      <GroupSettingsRoute />
    </MemoryRouter>,
  );
}

describe('group settings route', () => {
  beforeEach(() => {
    loaderDataSnapshot.canManageSettings = false;
    loaderDataSnapshot.canDelete = false;
    loaderDataSnapshot.canLeave = true;
    loaderDataSnapshot.viewerMember.role = 'MEMBER';
    loaderDataSnapshot.viewerMember.shareWishlist = true;
    loaderDataSnapshot.viewerMember.shareBirthday = true;
    loaderDataSnapshot.giftGroup.groupMembers = [];
  });

  it('shows a plain member their preferences but no admin sections (P7.5)', () => {
    renderRoute();
    expect(
      screen.getByRole('heading', { name: 'Your preferences' }),
    ).toBeInTheDocument();
    // Admin-only surfaces must not render for a member.
    expect(
      screen.queryByRole('heading', { name: 'Group settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Member Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    // Leaving is a member action — still available.
    expect(
      screen.getByRole('button', { name: /leave group/i }),
    ).toBeInTheDocument();
  });

  it('shows managers the admin sections alongside their preferences', () => {
    loaderDataSnapshot.canManageSettings = true;
    loaderDataSnapshot.canDelete = true;
    loaderDataSnapshot.viewerMember.role = 'OWNER';
    renderRoute();
    expect(
      screen.getByRole('heading', { name: 'Your preferences' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Group settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Member Actions')).toBeInTheDocument();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
  });

  it('opens preferences in read mode and reveals the form on Edit', () => {
    renderRoute();
    // Read mode shows current sharing state, no checkboxes yet.
    expect(screen.getAllByText('Shared with group').length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(
      screen.getByRole('checkbox', { name: /share my wishlist/i }),
    ).toBeInTheDocument();
  });

  it('lets a member turn sharing OFF — unchecking persists false', () => {
    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const readHidden = () =>
      (
        document.querySelector(
          'input[type="hidden"][name="shareWishlist"]',
        ) as HTMLInputElement
      ).value;
    expect(readHidden()).toBe('true');

    const checkbox = screen.getByRole('checkbox', {
      name: /share my wishlist/i,
    }) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(readHidden()).toBe('false');
  });

  const asOwnerViewing = (
    members: Array<{ userId: string; role: string; username: string }>,
  ) => {
    loaderDataSnapshot.canManageSettings = true;
    loaderDataSnapshot.viewerMember.role = 'OWNER';
    loaderDataSnapshot.giftGroup.groupMembers = members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: {
        id: m.userId,
        username: m.username,
        name: m.username,
        image: null,
      },
    }));
  };

  it('offers every non-owner member (not just admins) in Transfer Ownership', () => {
    // A group with no admins — the owner and two plain members. The dropdown
    // used to filter to ADMIN only and render empty; every member is eligible.
    asOwnerViewing([
      { userId: 'viewer-1', role: 'OWNER', username: 'wade' },
      { userId: 'm2', role: 'MEMBER', username: 'np' },
    ]);
    renderRoute();
    expect(screen.getByText('Transfer Ownership')).toBeInTheDocument();
    // Non-empty branch: the select + Transfer button render.
    expect(screen.getByText('Select member')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Transfer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invite another member/i),
    ).not.toBeInTheDocument();
  });

  it('shows a guidance message instead of an empty Transfer dropdown when the owner is alone', () => {
    asOwnerViewing([{ userId: 'viewer-1', role: 'OWNER', username: 'wade' }]);
    renderRoute();
    expect(screen.getByText(/invite another member/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Transfer' }),
    ).not.toBeInTheDocument();
  });

  it('renders the shared actions menu per manageable member row', () => {
    asOwnerViewing([
      { userId: 'viewer-1', role: 'OWNER', username: 'wade' },
      { userId: 'm2', role: 'MEMBER', username: 'np' },
    ]);
    renderRoute();
    // A manageable member gets the three-dot menu (desktop + mobile triggers).
    expect(screen.getAllByLabelText('Actions for np').length).toBeGreaterThan(
      0,
    );
    // The owner's own row has no actions available, so no menu renders.
    expect(screen.queryByLabelText('Actions for wade')).not.toBeInTheDocument();
  });
});
