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
      pushTitle: 'New friend request',
      fallbackName: 'Someone',
      accept: 'Accept',
      reject: 'Reject',
      acceptAria: 'Accept friend request from {{name}}',
      rejectAria: 'Reject friend request from {{name}}',
    },
    friendRequestAccepted: {
      message: '{{name}} accepted your friend request',
      pushTitle: 'Friend request accepted',
      fallbackName: 'Someone',
    },
    poolInvitation: {
      message: '{{name}} invited you to join {{pool}}',
      pushTitle: 'New pool invitation',
      accept: 'Accept',
      decline: 'Decline',
      acceptSuccess: 'You joined the pool.',
      declineSuccess: 'Invitation declined.',
    },
    upcomingBirthday: {
      // `when` is 'today' | 'tomorrow' | 'on Jul 18' — date-based so the
      // message can't go stale while it sits in the bell for the rest of the
      // lead window (see formatBirthdayWhen in
      // notification-events.server.tsx).
      message: "{{name}}'s birthday is {{when}}",
      pushTitle: 'Upcoming birthday',
    },
    poolVoteStarted: {
      message: 'Voting has started in {{pool}}',
      pushTitle: 'Voting started',
    },
    poolGiftChosen: {
      message: '{{idea}} was chosen for {{pool}}',
      pushTitle: 'Gift chosen',
    },
    poolCancelled: {
      message: '{{pool}} was cancelled',
      pushTitle: 'Pool cancelled',
    },
    poolPurchaserAssigned: {
      message: "You're the purchaser for {{pool}}",
      pushTitle: 'Purchase assignment',
    },
    poolDelivererAssigned: {
      message: "You're delivering the gift for {{pool}}",
      pushTitle: 'Delivery assignment',
    },
    poolContributionReminder: {
      message: '{{sender}} reminded you to set your contribution in {{pool}}',
      pushTitle: 'Contribution reminder',
    },
    poolVoteReminder: {
      message: '{{sender}} reminded you to vote in {{pool}}',
      pushTitle: 'Voting reminder',
    },
    poolPurchaseReminder: {
      message: '{{sender}} reminded you to buy the gift for {{pool}}',
      pushTitle: 'Purchase reminder',
    },
    poolDeliveryReminder: {
      message: '{{sender}} reminded you to deliver the gift for {{pool}}',
      pushTitle: 'Delivery reminder',
    },
    wishlistClaimConflict: {
      message:
        'A group has also decided to get {{item}} for {{recipient}}. Are you still getting it yourself?',
      pushTitle: 'Still getting this?',
      keep: 'Keep it',
      release: 'Release it',
      keepSuccess: "Kept — you're still on gift duty for this one.",
      releaseSuccess: "Released — the group's got it from here. Thanks!",
    },
    markAllReadSuccess: 'All notifications marked as read.',
  },
  friends: {
    add: 'Add Friend',
    accept: 'Accept',
    reject: 'Reject',
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
      'Friends can see your wishlist and chip in on group gifts. Share an invite link or search by username.',
    emptyCta: 'Add friend',
    noMatchTitle: 'No friends match your search',
    noMatchDescription: 'Try a different name or @username.',
    incomingRequests: 'Incoming requests',
    outgoingRequests: 'Outgoing requests',
    removeSuccess: '{{name}} removed from friends.',
    acceptSuccess: 'Friend request accepted.',
    rejectSuccess: 'Friend request rejected.',
    cancelSuccess: 'Friend request cancelled.',
    sendSuccess: 'Friend request sent.',
    viewProfile: 'View profile',
    viewWishlist: 'View wishlist',
    accessRequiredTitle: 'Add {{name}} as a friend to continue',
    accessRequiredProfile:
      "Send a friend request to view {{name}}'s profile details.",
    accessRequiredWishlist:
      'You need to be friends with {{name}} to see their wishlist.',
    navigateAway: 'Go to friends',
    gateNoneTitleProfile: "See {{name}}'s profile",
    gateNoneTitleWishlist: "See {{name}}'s wishlist",
    gateNoneDescriptionProfile:
      'Send a friend request to view their profile and activity.',
    gateNoneDescriptionWishlist:
      'Send a friend request to view their full wishlist.',
    gateOutgoingTitle: 'Waiting for {{name}} to accept',
    gateOutgoingDescriptionProfile:
      "Once {{name}} accepts, you'll see their profile here.",
    gateOutgoingDescriptionWishlist:
      "Once {{name}} accepts, you'll see their wishlist here.",
    gateIncomingTitle: '{{name}} wants to be friends',
    gateIncomingDescriptionProfile:
      'Accept their request to view their profile and activity.',
    gateIncomingDescriptionWishlist:
      'Accept their request to view their wishlist.',
  },
  time: {
    justNow: 'just now',
  },
  toasts: {
    genericError: 'Something went wrong. Try again.',
  },
} as const;

export type EnDictionary = typeof en;
