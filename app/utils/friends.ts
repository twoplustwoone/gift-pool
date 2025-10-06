export type FriendRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
  notificationId?: string | null;
}

export interface Friendship {
  id?: string;
  userAId: string;
  userBId: string;
  createdAt: string;
}

export type RelationshipState =
  | 'NONE'
  | 'PENDING_INCOMING'
  | 'PENDING_OUTGOING'
  | 'FRIENDS';

// In-memory helpers for friend management. In the real application these
// would be backed by database calls. The helpers mutate the provided arrays so
// tests can assert on the resulting state.

export function sendFriendRequest(
  requests: FriendRequest[],
  friendships: Friendship[],
  fromUserId: string,
  toUserId: string,
): FriendRequest {
  // cannot send request if already friends or pending either direction
  if (
    friendships.some(
      (f) =>
        (f.userAId === fromUserId && f.userBId === toUserId) ||
        (f.userAId === toUserId && f.userBId === fromUserId),
    )
  ) {
    throw new Error('Users are already friends');
  }
  if (
    requests.some(
      (r) =>
        r.status === 'PENDING' &&
        ((r.fromUserId === fromUserId && r.toUserId === toUserId) ||
          (r.fromUserId === toUserId && r.toUserId === fromUserId)),
    )
  ) {
    throw new Error('There is already a pending request');
  }
  const now = new Date().toISOString();
  const request: FriendRequest = {
    id: crypto.randomUUID(),
    fromUserId,
    toUserId,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  requests.push(request);
  return request;
}

export function acceptFriendRequest(
  requests: FriendRequest[],
  friendships: Friendship[],
  requestId: string,
): void {
  const req = requests.find((r) => r.id === requestId);
  if (!req || req.status !== 'PENDING') {
    throw new Error('Pending request not found');
  }
  req.status = 'ACCEPTED';
  req.updatedAt = new Date().toISOString();
  friendships.push({
    userAId: req.fromUserId,
    userBId: req.toUserId,
    createdAt: new Date().toISOString(),
  });
}

export function rejectFriendRequest(
  requests: FriendRequest[],
  requestId: string,
): void {
  const req = requests.find((r) => r.id === requestId);
  if (!req || req.status !== 'PENDING') {
    throw new Error('Pending request not found');
  }
  req.status = 'REJECTED';
  req.updatedAt = new Date().toISOString();
}

export function removeFriendship(
  friendships: Friendship[],
  userAId: string,
  userBId: string,
): void {
  const index = friendships.findIndex(
    (f) =>
      (f.userAId === userAId && f.userBId === userBId) ||
      (f.userAId === userBId && f.userBId === userAId),
  );
  if (index >= 0) {
    friendships.splice(index, 1);
  }
}

export function getRelationshipState(
  requests: FriendRequest[],
  friendships: Friendship[],
  currentUserId: string,
  otherUserId: string,
): RelationshipState {
  if (
    friendships.some(
      (f) =>
        (f.userAId === currentUserId && f.userBId === otherUserId) ||
        (f.userAId === otherUserId && f.userBId === currentUserId),
    )
  ) {
    return 'FRIENDS';
  }
  const incoming = requests.find(
    (r) =>
      r.status === 'PENDING' &&
      r.fromUserId === otherUserId &&
      r.toUserId === currentUserId,
  );
  if (incoming) return 'PENDING_INCOMING';
  const outgoing = requests.find(
    (r) =>
      r.status === 'PENDING' &&
      r.fromUserId === currentUserId &&
      r.toUserId === otherUserId,
  );
  if (outgoing) return 'PENDING_OUTGOING';
  return 'NONE';
}
