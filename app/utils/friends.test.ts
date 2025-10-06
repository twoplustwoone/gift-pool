import { describe, expect, it } from 'vitest';
import {
  acceptFriendRequest,
  getRelationshipState,
  rejectFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type FriendRequest,
  type Friendship,
} from './friends.ts';
import {
  createFriendRequestNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from './notifications.ts';

describe('friend lifecycle', () => {
  it('request -> accept -> remove', () => {
    const requests: FriendRequest[] = [];
    const friendships: Friendship[] = [];
    const req = sendFriendRequest(requests, friendships, 'a', 'b');
    expect(getRelationshipState(requests, friendships, 'a', 'b')).toBe(
      'PENDING_OUTGOING',
    );
    expect(getRelationshipState(requests, friendships, 'b', 'a')).toBe(
      'PENDING_INCOMING',
    );
    acceptFriendRequest(requests, friendships, req.id);
    expect(getRelationshipState(requests, friendships, 'a', 'b')).toBe(
      'FRIENDS',
    );
    removeFriendship(friendships, 'a', 'b');
    expect(getRelationshipState(requests, friendships, 'a', 'b')).toBe('NONE');
  });

  it('reject flow', () => {
    const requests: FriendRequest[] = [];
    const friendships: Friendship[] = [];
    const req = sendFriendRequest(requests, friendships, 'a', 'b');
    rejectFriendRequest(requests, req.id);
    expect(getRelationshipState(requests, friendships, 'a', 'b')).toBe('NONE');
  });
});

describe('notifications', () => {
  it('creates and marks read', () => {
    const list: Notification[] = [];
    const n1 = createFriendRequestNotification({
      toUserId: 'b',
      from: { id: 'a', displayName: 'Alice' },
    });
    list.push(n1);
    expect(list[0]!.status).toBe('UNREAD');
    markNotificationRead(list, n1.id);
    expect(list[0]!.status).toBe('READ');
    const n2 = createFriendRequestNotification({
      toUserId: 'c',
      from: { id: 'd', displayName: 'Dan' },
    });
    list.push(n2);
    markAllNotificationsRead(list);
    expect(list.every((n) => n.status === 'READ')).toBe(true);
  });
});
