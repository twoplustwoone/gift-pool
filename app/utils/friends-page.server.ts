import {
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  listFriends,
} from './friends.server.ts';

export async function loadFriendsPageData(userId: string) {
  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(userId),
    getIncomingFriendRequests(userId),
    getOutgoingFriendRequests(userId),
  ]);

  return {
    friends,
    incoming,
    outgoing,
  };
}
