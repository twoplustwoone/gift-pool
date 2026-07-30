/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactModule from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';
import { NotificationBell } from './notification-bell.tsx';
import { NotificationsProvider } from './notifications-context.tsx';

const {
  dispatchFriendshipUpdate,
  fetchMock,
  navigate,
  toastError,
  toastSuccess,
  track,
} = vi.hoisted(() => ({
  dispatchFriendshipUpdate: vi.fn(),
  fetchMock: vi.fn<typeof fetch>(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  track: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: (...args: Array<unknown>) => toastError(...args),
    success: (...args: Array<unknown>) => toastSuccess(...args),
  },
}));

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/utils/friendship-events.ts', () => ({
  dispatchFriendshipUpdate: (...args: Array<unknown>) =>
    dispatchFriendshipUpdate(...args),
}));

vi.mock('#app/utils/i18n.tsx', () => ({
  formatRelativeTime: () => 'just now',
  sanitizeTranslationParams: (
    params: Record<string, unknown> | null | undefined,
  ) => params ?? undefined,
  useTranslation: () => ({
    locale: 'en',
    t: (key: string) =>
      ({
        'friends.acceptSuccess': 'Friend accepted',
        'friends.rejectSuccess': 'Friend rejected',
        'notifications.bellLabel': 'Notifications',
        'notifications.empty': 'No notifications',
        'notifications.error': 'Unable to load notifications',
        'notifications.loading': 'Loading notifications',
        'notifications.markAllRead': 'Mark all as read',
        'notifications.markAllReadSuccess': 'All notifications marked as read.',
        'notifications.poolInvitation.acceptSuccess': 'Pool joined',
        'notifications.poolInvitation.declineSuccess': 'Invitation declined',
        'notifications.title': 'Notifications',
        'notifications.viewMore': 'View more',
        'notifications.wishlistClaimConflict.keepSuccess':
          "Kept — you're still on gift duty for this one.",
        'notifications.wishlistClaimConflict.releaseSuccess':
          "Released — the group's got it from here. Thanks!",
        'notifications.wishlistClaimConflict.releaseStale':
          "That's out of date — your current claim on this item wasn't touched.",
        'toasts.genericError': 'Something went wrong',
      })[key] ?? key,
  }),
}));

vi.mock('#app/components/ui/popover.tsx', async () => {
  const React = await vi.importActual<typeof ReactModule>('react');

  const PopoverContext = React.createContext<{
    onOpenChange?: (open: boolean) => void;
    open: boolean;
  }>({
    open: false,
  });

  return {
    Popover: ({
      children,
      onOpenChange,
      open = false,
    }: {
      children: ReactModule.ReactNode;
      onOpenChange?: (open: boolean) => void;
      open?: boolean;
    }) => (
      <PopoverContext.Provider value={{ onOpenChange, open }}>
        {children}
      </PopoverContext.Provider>
    ),
    PopoverContent: ({ children }: { children: ReactModule.ReactNode }) => {
      const context = React.useContext(PopoverContext);
      return context.open ? <div role="dialog">{children}</div> : null;
    },
    PopoverTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: ReactModule.ReactElement;
    }) => {
      const context = React.useContext(PopoverContext);
      if (asChild) {
        return React.cloneElement(children, {
          onClick: (event: ReactModule.MouseEvent) => {
            children.props.onClick?.(event);
            context.onOpenChange?.(!context.open);
          },
        });
      }

      return (
        <button
          type="button"
          onClick={() => context.onOpenChange?.(!context.open)}
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock('#app/components/ui/tooltip.tsx', () => ({
  Tooltip: ({ children }: { children: ReactModule.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: ReactModule.ReactNode }) => (
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: ReactModule.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: ReactModule.ReactNode }) => (
    <>{children}</>
  ),
}));

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json',
    },
    status: 200,
    ...init,
  });
}

function renderBell(initialUnreadCount = 0) {
  return render(
    <NotificationsProvider initialUnreadCount={initialUnreadCount}>
      <NotificationBell />
    </NotificationsProvider>,
  );
}

beforeEach(() => {
  navigate.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  track.mockReset();
  dispatchFriendshipUpdate.mockReset();
  fetchMock.mockReset();
});

describe('NotificationBell', () => {
  it('loads notifications when opened and marks an unread notification as read before navigating', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: false,
          nextCursor: null,
          notifications: [
            {
              actions: [],
              createdAt: '2026-03-31T12:00:00.000Z',
              friendRequestId: null,
              id: 'notification-1',
              messageKey: 'notification.message',
              messageParams: null,
              metadata: null,
              status: 'UNREAD',
              targetUrl: '/wishlist',
              type: 'INFO',
            },
          ],
          unreadCount: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ unreadCount: 0 }));

    renderBell(1);
    window.dispatchEvent(new Event('notifications:open'));

    expect(await screen.findByText('notification.message')).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('notifications_opened');

    await userEvent.click(screen.getByText('notification.message'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/notification-1/read',
        expect.objectContaining({
          credentials: 'same-origin',
          method: 'POST',
        }),
      );
    });
    expect(track).toHaveBeenCalledWith('notification_clicked', {
      type: 'INFO',
    });
    expect(navigate).toHaveBeenCalledWith('/wishlist');
  });

  it('marks all notifications as read and shows a success toast', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: false,
          nextCursor: null,
          notifications: [
            {
              actions: [],
              createdAt: '2026-03-31T12:00:00.000Z',
              friendRequestId: null,
              id: 'notification-1',
              messageKey: 'notification.message',
              messageParams: null,
              metadata: null,
              status: 'UNREAD',
              targetUrl: null,
              type: 'INFO',
            },
          ],
          unreadCount: 2,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ unreadCount: 0 }));

    renderBell(2);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );

    await screen.findByText('notification.message');
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark all as read' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/read-all',
        expect.objectContaining({
          credentials: 'same-origin',
          method: 'POST',
        }),
      );
    });
    expect(track).toHaveBeenCalledWith('notifications_marked_all_read');
    expect(toastSuccess).toHaveBeenCalledWith(
      'All notifications marked as read.',
    );
  });

  it('accepts friend requests inline and dispatches the relationship update', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: false,
          nextCursor: null,
          notifications: [
            {
              actions: [{ kind: 'FRIEND_ACCEPT', label: 'Accept' }],
              createdAt: '2026-03-31T12:00:00.000Z',
              friendRequestId: 'request-1',
              id: 'notification-1',
              messageKey: 'friend.request.received',
              messageParams: null,
              metadata: { senderUserId: 'friend-1' },
              status: 'UNREAD',
              targetUrl: null,
              type: 'FRIEND_REQUEST',
            },
          ],
          unreadCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          relationship: {
            friendship: { id: 'friendship-1' },
            incoming: null,
            outgoing: null,
            state: 'FRIENDS',
          },
          unreadCount: 0,
        }),
      );

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );

    await screen.findByText('friend.request.received');
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(
        screen.queryByText('friend.request.received'),
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/friends/requests/request-1/accept',
      expect.objectContaining({
        credentials: 'same-origin',
        method: 'POST',
      }),
    );
    expect(dispatchFriendshipUpdate).toHaveBeenCalledWith({
      friendshipId: 'friendship-1',
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'FRIENDS',
      userId: 'friend-1',
    });
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'FRIEND_ACCEPT',
      success: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith('Friend accepted');
  });

  it('keeps a pool invitation visible until the server accepts it', async () => {
    let resolveAction: ((response: Response) => void) | undefined;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: false,
          nextCursor: null,
          notifications: [
            {
              actions: [
                { kind: 'POOL_INVITATION_ACCEPT', label: 'Accept' },
                { kind: 'POOL_INVITATION_DECLINE', label: 'Decline' },
              ],
              createdAt: '2026-03-31T12:00:00.000Z',
              friendRequestId: null,
              poolInvitationId: 'invitation-1',
              id: 'notification-1',
              messageKey: 'pool.invitation.received',
              messageParams: null,
              metadata: null,
              status: 'UNREAD',
              targetUrl: '/pools/invitations/invitation-1',
              type: 'POOL_INVITATION_RECEIVED',
            },
          ],
          unreadCount: 1,
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveAction = resolve;
          }),
      );

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('pool.invitation.received');
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByText('pool.invitation.received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    resolveAction?.(jsonResponse({ unreadCount: 0, poolId: 'pool-1' }));

    await waitFor(() => {
      expect(
        screen.queryByText('pool.invitation.received'),
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pool-invitations/invitation-1/accept',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(navigate).toHaveBeenCalledWith('/pools/pool-1');
    expect(toastSuccess).toHaveBeenCalledWith('Pool joined');
  });

  function wishlistClaimConflictListResponse() {
    return jsonResponse({
      hasMore: false,
      nextCursor: null,
      notifications: [
        {
          actions: [
            { kind: 'WISHLIST_CLAIM_KEEP', label: 'Keep it' },
            { kind: 'WISHLIST_CLAIM_RELEASE', label: 'Release it' },
          ],
          createdAt: '2026-03-31T12:00:00.000Z',
          friendRequestId: null,
          poolInvitationId: null,
          id: 'notification-1',
          messageKey: 'wishlist.claim.conflict',
          messageParams: null,
          metadata: { wishlistItemId: 'wish-9', claimId: 'claim-9' },
          status: 'UNREAD',
          targetUrl: '/users/taylor/wishlist',
          type: 'WISHLIST_CLAIM_CONFLICT',
        },
      ],
      unreadCount: 1,
    });
  }

  it('releases a wishlist claim inline through the same unpurchase path as the wishlist page, then dismisses the notification', async () => {
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, wishlistItemId: 'wish-9', claim: null }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, unreadCount: 0 }));

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Release it' }));

    await waitFor(() => {
      expect(
        screen.queryByText('wishlist.claim.conflict'),
      ).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/wishlist/purchase',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    // The release binds to the specific claim occurrence the notification
    // was raised about, not just the item id.
    const [, releaseInit] = fetchMock.mock.calls.find(
      ([url]) => url === '/wishlist/purchase',
    )!;
    const releaseBody = releaseInit?.body as FormData;
    expect(releaseBody.get('claimId')).toBe('claim-9');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/notification-1/delete',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_RELEASE',
      success: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Released — the group's got it from here. Thanks!",
    );
  });

  it('shows a distinct message and rolls back when the release targets a stale claim occurrence', async () => {
    // The notification's claimId no longer matches the item's current
    // claim (e.g. the user released elsewhere and re-claimed the same item)
    // — the server rejects with reason: 'stale', and the bell must say so
    // rather than showing the generic error.
    testConsole.error.mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: false, reason: 'stale', claim: { claimedByUserId: 'someone-else' } },
          { status: 400 },
        ),
      );

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Release it' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "That's out of date — your current claim on this item wasn't touched.",
      );
    });
    // Rolled back: nothing committed, so the notification (and its Release
    // action) is still there for the user to reconsider.
    expect(await screen.findByText('wishlist.claim.conflict')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/notifications/notification-1/delete',
      expect.anything(),
    );
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_RELEASE',
      success: false,
    });
  });

  it('keeps a wishlist claim by dismissing only — never calls the purchase route', async () => {
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockResolvedValueOnce(jsonResponse({ success: true, unreadCount: 0 }));

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => {
      expect(
        screen.queryByText('wishlist.claim.conflict'),
      ).not.toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/wishlist/purchase',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/notification-1/delete',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_KEEP',
      success: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Kept — you're still on gift duty for this one.",
    );
  });

  it('surfaces an error and rolls back — never reports success — when Keep fails to dismiss', async () => {
    // Regression: Keep has no irreversible side effect — dismissal IS the
    // whole action. The swallow-dismiss-failures behavior only exists to
    // protect an already-committed Release; applied to Keep it let a failed
    // dismissal report success while the notification lived on server-side.
    testConsole.error.mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockRejectedValueOnce(new Error('network down'));

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Something went wrong');
    });
    // Rolled back: the notification (with its Keep/Release actions) is back
    // rather than falsely reported as dismissed.
    expect(await screen.findByText('wishlist.claim.conflict')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep it' }),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_KEEP',
      success: false,
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('does not roll back a committed release when the dismissal request fails', async () => {
    // Regression: a release that succeeds server-side (the claim is gone,
    // possibly transferred to the pool) must not be undone in the UI just
    // because the follow-up dismiss call fails. Rolling back would restore
    // the "Release it" button for a claim the user no longer holds — a
    // button that can only fail forever if pressed again.
    testConsole.error.mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, wishlistItemId: 'wish-9', claim: null }),
      )
      .mockRejectedValueOnce(new Error('network down'));

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Release it' }));

    // The release call landed...
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/wishlist/purchase',
        expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
      );
    });
    // ...and even though the dismiss call rejected, the notification (and
    // its "Release it" button) must stay gone rather than reappear.
    await waitFor(() => {
      expect(
        screen.queryByText('wishlist.claim.conflict'),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Release it' }),
    ).not.toBeInTheDocument();

    // The already-committed release is still reported as a success, not
    // rolled back and surfaced as a generic failure.
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_RELEASE',
      success: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Released — the group's got it from here. Thanks!",
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic dismissal when the release call itself fails', async () => {
    // Contrast case for the regression above: when the release never
    // committed, the existing rollback-on-failure behavior must still hold
    // — the notification (with its Keep/Release actions) reappears so the
    // user can retry.
    testConsole.error.mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(wishlistClaimConflictListResponse())
      .mockResolvedValueOnce(jsonResponse({ ok: false }, { status: 409 }));

    renderBell(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    await screen.findByText('wishlist.claim.conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Release it' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Something went wrong');
    });
    // Rolled back: the notification — and its Release action — is back.
    expect(await screen.findByText('wishlist.claim.conflict')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Release it' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/notifications/notification-1/delete',
      expect.anything(),
    );
    expect(track).toHaveBeenCalledWith('notification_action_completed', {
      kind: 'WISHLIST_CLAIM_RELEASE',
      success: false,
    });
  });
});
