/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchFriendshipUpdate } from '#app/utils/friendship-events.ts';
import FriendsRoute, {
  addFriendIfMissing,
  applyIncomingRelationshipTransition,
  applyOutgoingRelationshipTransition,
  buildFriendEntry,
  createOutgoingEntry,
  extractInviteUser,
  filterFriends,
  getActiveTab,
  getMutualGroupChips,
  getRequestMutationMessages,
  mapSearchResults,
  runBatchRequestMutation,
  runOptimisticRequestBatch,
  submitRequestMutation,
  syncFriendsForFriendshipEvent,
  syncIncomingForFriendshipEvent,
  syncOutgoingForFriendshipEvent,
  toRelationshipSnapshot,
  toggleSelection,
} from './friends.tsx';

const toastSuccess = vi.fn();
const toastError = vi.fn();
const setUnreadCount = vi.fn();
const friendPrefetchSpy = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: Array<unknown>) => toastSuccess(...args),
    error: (...args: Array<unknown>) => toastError(...args),
  },
}));

vi.mock('#app/components/notifications/notifications-context.tsx', () => ({
  useNotificationsStore: () => ({
    unreadCount: 0,
    setUnreadCount,
  }),
}));

vi.mock('#app/hooks/use-background-route-prefetch.ts', () => ({
  useFriendWishlistPrefetch: (...args: Array<unknown>) =>
    friendPrefetchSpy(...args),
}));

vi.mock('#app/components/friends/friend-summary.tsx', () => ({
  FriendSummary: ({
    displayName,
    extraGroupCount,
    mutualGroups,
    user,
  }: {
    displayName: string;
    extraGroupCount: number;
    mutualGroups: Array<{ id: string; name: string }>;
    user: { username: string };
  }) => (
    <div>
      <div>{displayName}</div>
      <div>@{user.username}</div>
      <div>{mutualGroups.map((group) => group.name).join(', ')}</div>
      <div>extra:{extraGroupCount}</div>
    </div>
  ),
}));

vi.mock('#app/components/friends/friend-action-button.tsx', () => ({
  FriendActionButton: ({
    onStateChange,
    relationship,
    targetUserId,
    targetUserName,
  }: {
    onStateChange?: (snapshot: {
      friendshipId: string | null;
      incomingRequestId: string | null;
      outgoingRequestId: string | null;
      state: 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING' | 'FRIENDS';
    }) => void;
    relationship: {
      friendshipId: string | null;
      incomingRequestId: string | null;
      outgoingRequestId: string | null;
      state: 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING' | 'FRIENDS';
    };
    targetUserId: string;
    targetUserName: string;
  }) => (
    <div data-testid={`friend-action-${targetUserId}`}>
      <span>{relationship.state}</span>
      <button
        type="button"
        onClick={() =>
          onStateChange?.({
            friendshipId: `friendship-${targetUserId}`,
            incomingRequestId: null,
            outgoingRequestId: null,
            state: 'FRIENDS',
          })
        }
      >
        become friends {targetUserName}
      </button>
      <button
        type="button"
        onClick={() =>
          onStateChange?.({
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
            state: 'NONE',
          })
        }
      >
        clear relationship {targetUserName}
      </button>
      <button
        type="button"
        onClick={() =>
          onStateChange?.({
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: `request-${targetUserId}`,
            state: 'PENDING_OUTGOING',
          })
        }
      >
        send request {targetUserName}
      </button>
    </div>
  ),
}));

vi.mock('#app/components/ui/avatar.tsx', () => ({
  Avatar: ({ user }: { user: { username: string } }) => (
    <div data-testid={`avatar-${user.username}`}>avatar</div>
  ),
}));

vi.mock('#app/components/ui/confirm-dialog.tsx', () => ({
  ConfirmDialog: ({
    children,
    onConfirm,
    title,
  }: {
    children: React.ReactNode;
    onConfirm: () => Promise<void> | void;
    title: string;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => void onConfirm()}>
        confirm {title}
      </button>
    </div>
  ),
}));

vi.mock('#app/components/ui/responsive-dialog.tsx', () => ({
  ResponsiveDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-open={open ? 'true' : 'false'}>
      <button type="button" onClick={() => onOpenChange?.(false)}>
        close dialog
      </button>
      {open === false ? null : children}
    </div>
  ),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  ResponsiveDialogDescription: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <p>{children}</p>,
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogClose: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('#app/components/ui/empty-state.tsx', () => ({
  EmptyState: ({
    action,
    description,
    title,
  }: {
    action?: React.ReactNode;
    description: string;
    title: string;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
      {action}
    </div>
  ),
}));

vi.mock('#app/components/ui/skeleton.tsx', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid={`skeleton-${className ?? 'default'}`} />
  ),
}));

vi.mock('#app/components/ui-kit/stack.tsx', () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#app/components/ui-kit/text.tsx', () => ({
  Text: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
}));

const qrcodeToDataURL = vi.fn();

vi.mock('qrcode', () => ({
  toDataURL: (...args: Array<unknown>) => qrcodeToDataURL(...args),
}));

type FriendUser = {
  id: string;
  image: { altText: string | null; id: string } | null;
  name: string | null;
  username: string;
  birthday: Date | null;
  birthdayVisibility: string;
};

function createUser(id: string, username: string, name = username): FriendUser {
  return {
    id,
    image: null,
    name,
    username,
    birthday: null,
    birthdayVisibility: 'FRIENDS',
  };
}

function createFriend(friendshipId: string, username: string, name = username) {
  return {
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
    friendshipId,
    user: createUser(`${friendshipId}-user`, username, name),
    mutualGroups: [] as Array<{ id: string; name: string }>,
  };
}

function createIncoming(id: string, username: string, name = username) {
  return {
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
    fromUser: createUser(`${id}-user`, username, name),
    fromUserId: `${id}-user`,
    id,
    notification: null,
    status: 'PENDING',
    toUserId: 'viewer-1',
    updatedAt: new Date('2026-03-31T00:00:00.000Z'),
  };
}

function createOutgoing(id: string, username: string, name = username) {
  return {
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
    fromUserId: 'viewer-1',
    id,
    notification: null,
    status: 'PENDING',
    toUser: createUser(`${id}-user`, username, name),
    toUserId: `${id}-user`,
    updatedAt: new Date('2026-03-31T00:00:00.000Z'),
  };
}

function applyStateUpdate<T>(updater: React.SetStateAction<T>, previous: T): T {
  return typeof updater === 'function'
    ? (updater as (prev: T) => T)(previous)
    : updater;
}

function renderFriendsRoute({
  entry = '/friends',
  data = {
    friends: [createFriend('friendship-1', 'alex', 'Alex')],
    incoming: [createIncoming('incoming-1', 'sam', 'Sam')],
    outgoing: [createOutgoing('outgoing-1', 'jules', 'Jules')],
  },
}: {
  data?: {
    friends: Array<ReturnType<typeof createFriend>>;
    incoming: Array<ReturnType<typeof createIncoming>>;
    outgoing: Array<ReturnType<typeof createOutgoing>>;
  };
  entry?: string;
} = {}) {
  const App = createRoutesStub([
    {
      Component: FriendsRoute,
      HydrateFallback: () => null,
      loader: async () => data,
      path: '/friends',
    },
  ]);

  return render(<App initialEntries={[entry]} />);
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  setUnreadCount.mockReset();
  friendPrefetchSpy.mockReset();
  qrcodeToDataURL.mockReset().mockResolvedValue('data:image/png;base64,qr');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/friends/invite')) {
        return new Response(
          JSON.stringify({
            inviteUrl: 'https://giftpool.app/friends/accept/abc',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/users/search')) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/friends/remove')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/friends route helpers', () => {
  it('normalizes tabs and ignores unknown values', () => {
    expect(getActiveTab(new URLSearchParams('tab=add'))).toBe('add');
    expect(getActiveTab(new URLSearchParams('tab=requests'))).toBe('requests');
    expect(getActiveTab(new URLSearchParams('tab=unknown'))).toBe('friends');
    expect(getActiveTab(new URLSearchParams())).toBe('friends');
  });

  it('builds and deduplicates friend entries', () => {
    const user = createUser('user-1', 'alex', 'Alex');
    const entry = buildFriendEntry('request-1', user);
    expect(entry.friendshipId).toBe('request-1');
    expect(addFriendIfMissing([], entry)).toEqual([entry]);
    expect(
      addFriendIfMissing([entry], buildFriendEntry('request-2', user)),
    ).toEqual([entry]);
  });

  it('derives birthdayVisible for optimistic entries so a NOBODY friend does not leak', () => {
    const hiddenUser = {
      ...createUser('user-2', 'sam', 'Sam'),
      birthdayVisibility: 'NOBODY',
    };
    expect(buildFriendEntry('request-3', hiddenUser).user.birthdayVisible).toBe(
      false,
    );

    const friendsUser = createUser('user-3', 'jo', 'Jo'); // birthdayVisibility: 'FRIENDS'
    expect(
      buildFriendEntry('request-4', friendsUser).user.birthdayVisible,
    ).toBe(true);
  });

  it('submits request mutations and batches failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ unreadCount: 5 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 })),
    );

    await expect(submitRequestMutation('request-1', 'accept')).resolves.toEqual(
      {
        ok: true,
        unreadCount: 5,
      },
    );
    await expect(submitRequestMutation('request-2', 'reject')).resolves.toEqual(
      {
        ok: false,
        unreadCount: null,
      },
    );
    await expect(submitRequestMutation('request-3', 'cancel')).resolves.toEqual(
      {
        ok: true,
        unreadCount: null,
      },
    );
  });

  it('collects failed batch ids and last unread count', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 7 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      runBatchRequestMutation(
        ['request-1', 'request-2', 'request-3'],
        'accept',
      ),
    ).resolves.toEqual({
      failedIds: ['request-2'],
      unreadCount: 7,
    });
  });

  it('optimistically removes requests and restores failures', async () => {
    const requests = [{ id: 'request-1' }, { id: 'request-2' }];
    const updates: Array<Array<{ id: string }>> = [];
    const setRequests: React.Dispatch<
      React.SetStateAction<Array<{ id: string }>>
    > = (updater) => {
      const next = applyStateUpdate(
        updater,
        updates.length === 0 ? requests : (updates.at(-1) ?? requests),
      );
      updates.push(next);
      return next;
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 4 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await runOptimisticRequestBatch(
      ['request-1', 'request-2'],
      'accept',
      requests,
      setRequests,
      setUnreadCount,
    );

    expect(updates[0]).toEqual([]);
    expect(updates[1]).toEqual([{ id: 'request-1' }]);
    expect(setUnreadCount).toHaveBeenCalledWith(4);
    expect(toastError).toHaveBeenCalledWith(
      'Some requests could not be accepted.',
    );
  });

  it('filters, toggles, maps, and transitions friend state', () => {
    const friends = [
      createFriend('friendship-1', 'alex', 'Alex'),
      createFriend('friendship-2', 'sam', 'Sam'),
    ];
    expect(filterFriends(friends, 'sa')).toEqual([friends[1]]);
    expect(filterFriends(friends, ' ')).toEqual(friends);
    expect(toggleSelection(new Set(['a']), 'b', true)).toEqual(
      new Set(['a', 'b']),
    );
    expect(toggleSelection(new Set(['a', 'b']), 'b', false)).toEqual(
      new Set(['a']),
    );

    const incoming = [createIncoming('request-1', 'sam', 'Sam')];
    const outgoing = [createOutgoing('request-2', 'jules', 'Jules')];
    expect(
      applyIncomingRelationshipTransition(incoming, 'request-1', {
        friendshipId: 'friendship-1',
        incomingRequestId: null,
        outgoingRequestId: null,
        state: 'FRIENDS',
      }),
    ).toEqual([]);
    expect(
      applyOutgoingRelationshipTransition(outgoing, 'request-2', {
        friendshipId: null,
        incomingRequestId: null,
        outgoingRequestId: null,
        state: 'NONE',
      }),
    ).toEqual([]);

    expect(getRequestMutationMessages('accept', 2)).toEqual({
      error: 'Some requests could not be accepted.',
      success: 'Accepted 2 requests.',
    });
    expect(getRequestMutationMessages('reject', 1).success).toBe(
      'Declined 1 request.',
    );
    expect(getRequestMutationMessages('cancel', 1).success).toBe(
      'Cancelled 1 request.',
    );

    expect(
      toRelationshipSnapshot({
        friendshipId: 'friendship-1',
        incomingRequestId: 'incoming-1',
        outgoingRequestId: 'outgoing-1',
        state: 'FRIENDS',
      }),
    ).toEqual({
      friendshipId: 'friendship-1',
      incomingRequestId: 'incoming-1',
      outgoingRequestId: 'outgoing-1',
      state: 'FRIENDS',
    });

    expect(
      getMutualGroupChips(
        {
          'user-1': {
            groups: [
              { id: 'group-1', name: 'Group 1' },
              { id: 'group-2', name: 'Group 2' },
              { id: 'group-3', name: 'Group 3' },
            ],
            more: 3,
          },
        },
        'user-1',
      ),
    ).toEqual({
      extraGroupCount: 3,
      mutualGroups: [
        { id: 'group-1', name: 'Group 1' },
        { id: 'group-2', name: 'Group 2' },
      ],
    });

    expect(
      mapSearchResults([
        {
          relationship: {
            friendship: { id: 'friendship-1' },
            incoming: { id: 'incoming-1' },
            outgoing: { id: 'outgoing-1' },
            state: 'PENDING_INCOMING',
          },
          user: createUser('user-1', 'alex', 'Alex'),
        },
      ]),
    ).toEqual([
      {
        relationship: {
          friendshipId: 'friendship-1',
          incomingRequestId: 'incoming-1',
          outgoingRequestId: 'outgoing-1',
          state: 'PENDING_INCOMING',
        },
        user: createUser('user-1', 'alex', 'Alex'),
      },
    ]);

    const outgoingEntry = createOutgoingEntry(
      'request-3',
      createUser('user-3', 'taylor', 'Taylor'),
    );
    expect(outgoingEntry.id).toBe('request-3');
    expect(outgoingEntry.toUser.username).toBe('taylor');
  });

  it('syncs incoming, outgoing, and existing friends from friendship events', () => {
    const addFriendEntry = vi.fn();
    const incomingUpdates: Array<unknown[]> = [];
    const outgoingUpdates: Array<unknown[]> = [];
    const friendUpdates: Array<Array<ReturnType<typeof createFriend>>> = [];

    syncIncomingForFriendshipEvent(
      {
        friendshipId: 'friendship-1',
        state: 'FRIENDS',
        userId: 'incoming-1-user',
      },
      addFriendEntry,
      (updater) => {
        const next = applyStateUpdate(updater, [
          createIncoming('incoming-1', 'sam', 'Sam'),
        ]);
        incomingUpdates.push(next as unknown[]);
        return incomingUpdates.at(-1) ?? [];
      },
    );

    syncOutgoingForFriendshipEvent(
      {
        friendshipId: 'friendship-2',
        state: 'FRIENDS',
        userId: 'outgoing-1-user',
      },
      addFriendEntry,
      (updater) => {
        const next = applyStateUpdate(updater, [
          createOutgoing('outgoing-1', 'jules', 'Jules'),
        ]);
        outgoingUpdates.push(next as unknown[]);
        return outgoingUpdates.at(-1) ?? [];
      },
    );

    syncFriendsForFriendshipEvent(
      {
        state: 'NONE',
        userId: 'friendship-1-user',
      },
      (updater) => {
        friendUpdates.push(
          applyStateUpdate(updater, [
            createFriend('friendship-1', 'alex', 'Alex'),
          ]),
        );
        return friendUpdates.at(-1) ?? [];
      },
    );

    syncFriendsForFriendshipEvent(
      {
        friendshipId: 'friendship-3',
        state: 'FRIENDS',
        user: createUser('user-9', 'pat', 'Pat'),
        userId: 'user-9',
      },
      (updater) => {
        friendUpdates.push(
          applyStateUpdate(updater, friendUpdates.at(-1) ?? []),
        );
        return friendUpdates.at(-1) ?? [];
      },
    );

    expect(addFriendEntry).toHaveBeenCalledTimes(2);
    expect(incomingUpdates[0]).toEqual([]);
    expect(outgoingUpdates[0]).toEqual([]);
    expect(friendUpdates[0]).toEqual([]);
    expect(friendUpdates[1]?.[0]?.user.username).toBe('pat');
    expect(
      extractInviteUser({
        state: 'FRIENDS',
        user: createUser('user-10', 'casey', 'Casey'),
        userId: 'user-10',
      }),
    ).toEqual(createUser('user-10', 'casey', 'Casey'));
  });
});

describe('/friends route rendering', () => {
  it('opens the Add friend dialog with invite link controls and QR', async () => {
    // The Add friends panel is now tucked behind a primary "Add friend"
    // button at the top of the page instead of being permanently expanded.
    renderFriendsRoute();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add friend' }),
    );
    await waitFor(() => {
      expect(friendPrefetchSpy).toHaveBeenCalledWith(['alex']);
    });

    expect(
      await screen.findByRole('textbox', { name: 'Friend invite link' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy invite link' }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://giftpool.app/friends/accept/abc',
    );

    await userEvent.click(screen.getByRole('button', { name: /show qr/i }));
    await waitFor(() => {
      expect(screen.getByAltText('Friend invite QR')).toBeInTheDocument();
    });
  });

  it('filters friends and renders every match in the grid', async () => {
    const manyFriends = Array.from({ length: 45 }, (_, index) =>
      createFriend(
        `friendship-${index + 1}`,
        `friend-${index + 1}`,
        `Friend ${index + 1}`,
      ),
    );

    renderFriendsRoute({
      data: {
        friends: manyFriends,
        incoming: [],
        outgoing: [],
      },
    });

    // The search input only renders when there are >8 friends.
    const filterInput = await screen.findByRole('textbox', {
      name: 'Search friends',
    });
    await userEvent.type(filterInput, 'friend 2');
    expect(screen.getByText('Friend 2')).toBeInTheDocument();
    expect(screen.queryByText('Friend 40')).not.toBeInTheDocument();

    await userEvent.clear(filterInput);
    // The list is no longer virtualized — clearing the filter brings every
    // friend back into the DOM rather than a scrolled window of them.
    const rows = screen.getAllByTestId('friend-row');
    expect(rows).toHaveLength(manyFriends.length);
  });

  it('reorders the list between birthday proximity and A–Z', async () => {
    // Zoe has a birthday in 5 days, so proximity sort floats her above the
    // alphabetically-earlier names.
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    const zoe = createFriend('friendship-z', 'zoe', 'Zoe');
    zoe.user.birthday = new Date(1990, soon.getMonth(), soon.getDate());

    renderFriendsRoute({
      data: {
        friends: [
          zoe,
          ...Array.from({ length: 9 }, (_, index) =>
            createFriend(
              `friendship-${index}`,
              `anna${index}`,
              `Anna ${index}`,
            ),
          ),
        ],
        incoming: [],
        outgoing: [],
      },
    });

    const namesInOrder = () =>
      screen
        .getAllByTestId('friend-row')
        .map((row) => row.textContent ?? '')
        .map((text) => text.trim());

    await waitFor(() => expect(namesInOrder()[0]).toContain('Zoe'));

    await userEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    await waitFor(() => expect(namesInOrder()[0]).toContain('Anna 0'));

    await userEvent.click(screen.getByRole('button', { name: 'By birthday' }));
    await waitFor(() => expect(namesInOrder()[0]).toContain('Zoe'));
  });

  it('hides the requests and Coming up sections while filtering', async () => {
    renderFriendsRoute({
      data: {
        friends: Array.from({ length: 9 }, (_, index) =>
          createFriend(
            `friendship-${index}`,
            `friend${index}`,
            `Friend ${index}`,
          ),
        ),
        incoming: [createIncoming('incoming-1', 'sam', 'Sam')],
        outgoing: [],
      },
    });

    expect(await screen.findByText('Friend requests')).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search friends' }),
      'Friend 3',
    );

    await waitFor(() =>
      expect(screen.queryByText('Friend requests')).not.toBeInTheDocument(),
    );
  });

  it('updates incoming/outgoing/friends state from interaction and friendship events', async () => {
    renderFriendsRoute();

    await screen.findByText('Alex');
    await userEvent.click(
      screen.getByRole('button', { name: 'become friends @sam' }),
    );
    expect(
      screen.queryByRole('button', { name: 'become friends @sam' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'clear relationship @jules' }),
    );
    expect(screen.queryByText('@jules')).not.toBeInTheDocument();

    dispatchFriendshipUpdate({
      friendshipId: 'friendship-2',
      state: 'FRIENDS',
      user: createUser('user-99', 'casey', 'Casey'),
      userId: 'user-99',
    });
    await waitFor(() => {
      expect(screen.getByText('Casey')).toBeInTheDocument();
    });

    dispatchFriendshipUpdate({
      state: 'NONE',
      userId: 'friendship-1-user',
    });
    await waitFor(() => {
      expect(screen.queryByText('Alex')).not.toBeInTheDocument();
    });
  });

  it('shows empty search results after the debounced lookup settles', async () => {
    renderFriendsRoute();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add friend' }),
    );

    const input = await screen.findByPlaceholderText('e.g. alice');
    await userEvent.type(input, 'zoe');
    await waitFor(
      () => {
        expect(
          screen.getByText('No users found for "zoe"'),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('shows the empty friends state when no friends exist', async () => {
    renderFriendsRoute({
      data: {
        friends: [],
        incoming: [],
        outgoing: [],
      },
    });

    expect(await screen.findByText('No friends yet')).toBeInTheDocument();
  });
});
