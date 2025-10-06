export const en = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    error: 'Something went wrong. Try again.',
  },
  notifications: {
    bellLabel: 'Notifications',
    badge: {
      singular: 'You have 1 unread notification.',
      plural: 'You have {{count}} unread notifications.',
      none: 'No unread notifications.',
    },
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    empty: 'No notifications',
    viewMore: 'View more',
    loading: 'Loading notifications...',
    error: 'Unable to load notifications.',
    menuItem: 'Notifications',
    friendRequest: {
      message: '{{name}} sent you a friend request',
      fallbackName: 'Someone',
      accept: 'Accept',
      reject: 'Reject',
      acceptAria: 'Accept friend request from {{name}}',
      rejectAria: 'Reject friend request from {{name}}',
    },
    friendRequestAccepted: {
      message: '{{name}} accepted your friend request',
      fallbackName: 'Someone',
    },
    markAllReadSuccess: 'All notifications marked as read.',
  },
  friends: {
    add: 'Add Friend',
    accept: 'Accept',
    reject: 'Reject',
    requestSent: 'Request sent',
    cancelRequest: 'Cancel request',
    friends: 'Friends',
    remove: 'Remove friend',
    removeAria: 'Remove {{name}} from friends',
    removeConfirmTitle: 'Remove friend',
    removeConfirmDescription:
      'Are you sure you want to remove {{name}} from your friends list?',
    removeConfirmCancel: 'Keep friend',
    removeConfirmConfirm: 'Remove',
    listTitle: 'Friends',
    listDescription: 'See the people you have connected with across GiftPool.',
    emptyTitle: 'No friends yet',
    emptyDescription:
      'Find people in your groups and send them a friend request.',
    emptyCta: 'Browse groups',
    incomingRequests: 'Incoming requests',
    outgoingRequests: 'Outgoing requests',
    removeSuccess: '{{name}} removed from friends.',
    acceptSuccess: 'Friend request accepted.',
    rejectSuccess: 'Friend request rejected.',
    cancelSuccess: 'Friend request cancelled.',
    sendSuccess: 'Friend request sent.',
    viewProfile: 'View profile',
    viewWishlist: 'View wishlist',
  },
  time: {
    justNow: 'just now',
  },
  toasts: {
    genericError: 'Something went wrong. Try again.',
  },
} as const;

export type EnDictionary = typeof en;
