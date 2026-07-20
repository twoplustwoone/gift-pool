/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const requireUserId = vi.fn();
const findMany = vi.fn();
const loaderDataSnapshot: {
  groups: Array<{
    createdAtDisplay: string;
    description?: string | null;
    id: string;
    memberCount: number;
    myRole: 'ADMIN' | 'MEMBER' | 'OWNER';
    name: string;
  }>;
} = {
  groups: [],
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useNavigate: () => navigate,
  };
});

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    giftGroup: {
      findMany: (...args: Array<unknown>) => findMany(...args),
    },
  },
}));

vi.mock('#app/components/ui/responsive-dialog.tsx', () => ({
  ResponsiveDialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('./__group-editor.tsx', () => ({
  CreateGroupCompactForm: () => <form aria-label="Create group form" />,
}));

import GroupsIndex, { loader } from './index.tsx';

beforeEach(() => {
  navigate.mockReset();
  requireUserId.mockReset();
  findMany.mockReset();
  loaderDataSnapshot.groups = [];
  document.cookie = 'CH-time-zone=America%2FNew_York; path=/';
});

function renderGroupsRoute(groups: Array<{
  createdAtDisplay: string;
  description?: string | null;
  id: string;
  memberCount: number;
  myRole: 'ADMIN' | 'MEMBER' | 'OWNER';
  name: string;
}>) {
  loaderDataSnapshot.groups = groups;

  return render(
    <MemoryRouter initialEntries={['/groups']}>
      <GroupsIndex />
    </MemoryRouter>,
  );
}

describe('app/routes/groups+/index.tsx', () => {
  it('maps group membership data for the current user', async () => {
    requireUserId.mockResolvedValue('user-123');
    findMany.mockResolvedValue([
      {
        _count: { groupMembers: 3 },
        createdAt: new Date('2026-03-31T01:00:00.000Z'),
        description: 'Birthday planning',
        groupMembers: [{ role: 'OWNER' }],
        id: 'group-1',
        name: 'Family',
      },
      {
        _count: { groupMembers: 2 },
        createdAt: new Date('2026-02-01T01:00:00.000Z'),
        description: null,
        groupMembers: [{ role: 'NOT_A_REAL_ROLE' }],
        id: 'group-2',
        name: 'Friends',
      },
    ]);

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://example.com/groups', {
          headers: { Cookie: 'CH-time-zone=America%2FNew_York' },
        }),
      } as never),
    ).resolves.toEqual({
      groups: [
        {
          createdAtDisplay: 'March 30, 2026',
          description: 'Birthday planning',
          id: 'group-1',
          memberCount: 3,
          myRole: 'OWNER',
          name: 'Family',
        },
        {
          createdAtDisplay: 'January 31, 2026',
          description: null,
          id: 'group-2',
          memberCount: 2,
          myRole: 'MEMBER',
          name: 'Friends',
        },
      ],
    });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: {
        _count: { select: { groupMembers: true } },
        createdAt: true,
        description: true,
        groupMembers: {
          select: { role: true },
          where: { userId: 'user-123' },
        },
        id: true,
        name: true,
      },
      where: {
        groupMembers: {
          some: {
            userId: 'user-123',
          },
        },
      },
    });
  });

  it('renders the empty state and create group affordances', () => {
    renderGroupsRoute([]);

    expect(
      screen.getByText('You don’t have any groups yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Create your first group to start planning together.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /create group/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('form', { name: 'Create group form' }).length,
    ).toBeGreaterThan(0);
  });

  it('renders group cards and navigates to the selected group', async () => {
    renderGroupsRoute([
      {
        createdAtDisplay: 'March 30, 2026',
        description: 'Birthday planning',
        id: 'group-1',
        memberCount: 3,
        myRole: 'ADMIN',
        name: 'Family',
      },
      {
        createdAtDisplay: 'March 29, 2026',
        description: null,
        id: 'group-2',
        memberCount: 5,
        myRole: 'MEMBER',
        name: 'Work',
      },
    ]);

    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.getByText('Birthday planning')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(
      screen.queryByText('You don’t have any groups yet.'),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Open group Family' }));

    expect(navigate).toHaveBeenCalledWith('/groups/group-1');
  });
});
