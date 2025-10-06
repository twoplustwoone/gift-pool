import { type RelationshipState } from './friends.ts';

export const FRIENDSHIP_UPDATED_EVENT = 'friendship:updated';

export interface FriendshipEventDetail {
  userId: string;
  state: RelationshipState;
  friendshipId?: string | null;
  incomingRequestId?: string | null;
  outgoingRequestId?: string | null;
  user?: {
    id: string;
    username: string;
    name: string | null;
    image: { id: string; altText: string | null } | null;
  };
}

export function dispatchFriendshipUpdate(detail: FriendshipEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FRIENDSHIP_UPDATED_EVENT, { detail }));
}

export function subscribeToFriendshipUpdates(
  userId: string,
  callback: (detail: FriendshipEventDetail) => void,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<FriendshipEventDetail>;
    if (customEvent.detail.userId === userId) {
      callback(customEvent.detail);
    }
  };
  window.addEventListener(FRIENDSHIP_UPDATED_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(
      FRIENDSHIP_UPDATED_EVENT,
      handler as EventListener,
    );
}
