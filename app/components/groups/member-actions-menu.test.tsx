/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type GroupRole } from '#app/utils/group-role.ts';

const submit = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      submit,
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      state: 'idle',
      data: undefined,
    }),
  };
});

// Radix primitives are unreliable in jsdom — mock to plain elements so the
// permission/confirmation logic is what's under test (mirrors the
// friend-action-button test approach).
vi.mock('#app/components/ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: (e: { preventDefault: () => void }) => void;
  }) => (
    <button type="button" onClick={() => onSelect?.({ preventDefault() {} })}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Render only the trigger for the mobile sheet so action buttons don't
// duplicate the desktop dropdown items.
vi.mock('#app/components/ui/mobile-bottom-sheet.tsx', () => ({
  MobileBottomSheet: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MobileBottomSheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  MobileBottomSheetContent: () => null,
  MobileBottomSheetClose: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  MobileBottomSheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MobileBottomSheetDescription: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div>{children}</div>,
}));

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogClose: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { MemberActionsMenu } from './member-actions-menu.tsx';

function renderMenu({
  viewerRole,
  targetRole,
  isViewer = false,
}: {
  viewerRole: GroupRole;
  targetRole: GroupRole;
  isViewer?: boolean;
}) {
  return render(
    <MemberActionsMenu
      giftGroupId="group-1"
      viewerRole={viewerRole}
      isViewer={isViewer}
      member={{
        user: { id: 'naomi', username: 'naomi', name: 'Naomi', image: null },
        role: targetRole,
      }}
      birthdayLabel="Birthday Jul 19"
    />,
  );
}

const triggers = () => screen.queryAllByRole('button', { name: /actions for/i });

describe('<MemberActionsMenu /> — permission matrix', () => {
  beforeEach(() => submit.mockReset());

  it('shows no menu to a member viewer', () => {
    renderMenu({ viewerRole: 'MEMBER', targetRole: 'MEMBER' });
    expect(triggers()).toHaveLength(0);
    renderMenu({ viewerRole: 'MEMBER', targetRole: 'ADMIN' });
    expect(triggers()).toHaveLength(0);
  });

  it('shows no menu on your own row or on the owner row', () => {
    renderMenu({ viewerRole: 'OWNER', targetRole: 'OWNER', isViewer: true });
    expect(triggers()).toHaveLength(0);
    renderMenu({ viewerRole: 'ADMIN', targetRole: 'OWNER' });
    expect(triggers()).toHaveLength(0);
  });

  it('lets an admin act on member rows only', () => {
    renderMenu({ viewerRole: 'ADMIN', targetRole: 'MEMBER' });
    expect(triggers().length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Remove from group' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote to admin' }),
    ).not.toBeInTheDocument();
  });

  it('shows no menu to an admin on an admin row', () => {
    renderMenu({ viewerRole: 'ADMIN', targetRole: 'ADMIN' });
    expect(triggers()).toHaveLength(0);
  });

  it('offers promote+remove to the owner on a member row', () => {
    renderMenu({ viewerRole: 'OWNER', targetRole: 'MEMBER' });
    expect(
      screen.getByRole('button', { name: 'Promote to admin' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove from group' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Demote to member' }),
    ).not.toBeInTheDocument();
  });

  it('offers demote+remove to the owner on an admin row', () => {
    renderMenu({ viewerRole: 'OWNER', targetRole: 'ADMIN' });
    expect(
      screen.getByRole('button', { name: 'Demote to member' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove from group' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote to admin' }),
    ).not.toBeInTheDocument();
  });
});

describe('<MemberActionsMenu /> — confirmation before firing', () => {
  beforeEach(() => submit.mockReset());

  it('requires a confirm step and posts the matching intent', async () => {
    renderMenu({ viewerRole: 'OWNER', targetRole: 'MEMBER' });

    // Choosing the action does not fire it — it opens a confirm step.
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove from group' }),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Remove Naomi from the group?'),
    ).toBeInTheDocument();

    // Confirming posts the member-remove intent to the settings action.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(submit).toHaveBeenCalledTimes(1);
    const [formData, options] = submit.mock.calls[0] as [
      FormData,
      { method: string; action: string },
    ];
    expect(formData.get('intent')).toBe('member-remove');
    expect(formData.get('memberUserId')).toBe('naomi');
    expect(formData.get('giftGroupId')).toBe('group-1');
    expect(options).toMatchObject({
      method: 'post',
      action: '/groups/group-1/settings',
    });
  });

  it('posts member-promote-admin when promoting is confirmed', async () => {
    renderMenu({ viewerRole: 'OWNER', targetRole: 'MEMBER' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Promote to admin' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Promote' }));
    const [formData] = submit.mock.calls[0] as [FormData];
    expect(formData.get('intent')).toBe('member-promote-admin');
  });
});
