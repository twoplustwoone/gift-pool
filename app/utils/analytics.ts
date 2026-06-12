export const ANALYTIC_EVENT_NAMES = [
  'user_registered',
  'user_logged_in',
  'wishlist_viewed',
  'wishlist_item_added',
  'wishlist_item_archived',
  // Phase 1.5 — gifting workflow instrumentation
  'pool_created',
  'pool_contributor_joined',
  'pool_vote_called',
  'pool_vote_cast',
  'pool_decided',
  'pool_purchased',
  'pool_delivered',
  'pool_cancelled',
  'friend_request_sent',
  'friend_request_accepted',
  'friend_request_rejected',
  'friend_removed',
  'wishlist_purchase_recorded',
  // Phase 2 — admin actions
  'admin_role_granted',
  'admin_role_revoked',
  'admin_sessions_revoked',
  // Feedback — submitter may be anonymous, so this is NOT a user-required event.
  'feedback_submitted',
  // Link enrichment — fired on every unfurl attempt, success or failure, with
  // an `outcome` property discriminating why (see api.wishlist.unfurl).
  'wishlist_unfurl_completed',
  // Gift-idea proposals — `fromWishlist` measures smart-link adoption.
  'pool_idea_proposed',
  // Outbound clicks through /out — fired for anonymous public-share viewers
  // too, so this is NOT a user-required event. `tagged` powers the affiliate
  // reconciliation view in admin analytics.
  'wishlist_link_clicked',
  // Phase 3 — drop-off instrumentation. These previously existed as client
  // track() calls with unregistered names (silently dropped); registered as
  // part of the friction investigation.
  'notifications_opened',
  'notification_clicked',
  'notifications_marked_all_read',
  // Outcome-coded (like wishlist_unfurl_completed): fires on success AND
  // failure with `kind` + `success` properties.
  'notification_action_completed',
  'wishlist_item_removed',
  'wishlist_item_undo_clicked',
  'wishlist_item_undo_expired',
  'group_budget_saved',
  // Marketing-page CTA clicks (`cta` property). Anonymous visitors, so NOT
  // user-required.
  'home_cta_clicked',
  // Funnel-entry events. Each pairs with an existing completion event so the
  // admin drop-off view can compute started → completed conversion. All are
  // anonymous-capable (joined via `visitorId`), so NOT user-required:
  // - signup_submitted / signup_email_verified → user_registered
  // - invite_landed (`inviteType: group|pool|friend`) → group_joined /
  //   pool_contributor_joined / friend_request_accepted
  // - wishlist_share_viewed → wishlist_link_clicked
  'signup_submitted',
  'signup_email_verified',
  'invite_landed',
  'wishlist_share_viewed',
  // Completion event for group invite-code joins (was previously untracked).
  'group_joined',
  // Funnel entry for wishlist_item_added — measures open-then-abandon.
  'wishlist_editor_opened',
] as const;

export type AnalyticEventName = (typeof ANALYTIC_EVENT_NAMES)[number];

export const ANALYTIC_EVENT_SET = new Set<string>(ANALYTIC_EVENT_NAMES);

export const USER_REQUIRED_EVENTS: Set<AnalyticEventName> = new Set([
  'user_registered',
  'user_logged_in',
  'wishlist_item_added',
  'wishlist_item_archived',
  'wishlist_viewed',
  // Phase 1.5 — every workflow event has a known actor (the acting user).
  'pool_created',
  'pool_contributor_joined',
  'pool_vote_called',
  'pool_vote_cast',
  'pool_decided',
  'pool_purchased',
  'pool_delivered',
  'pool_cancelled',
  'friend_request_sent',
  'friend_request_accepted',
  'friend_request_rejected',
  'friend_removed',
  'wishlist_purchase_recorded',
  // Notification + wishlist-undo interactions only exist for signed-in users.
  'notifications_opened',
  'notification_clicked',
  'notifications_marked_all_read',
  'notification_action_completed',
  'wishlist_item_removed',
  'wishlist_item_undo_clicked',
  'wishlist_item_undo_expired',
  'group_budget_saved',
  // Admin actions: the acting admin is always a known user.
  'admin_role_granted',
  'admin_role_revoked',
  'admin_sessions_revoked',
  // Unfurl requires an authenticated user (the route 401s anonymous callers).
  'wishlist_unfurl_completed',
  // Proposing an idea requires being an authenticated pool contributor.
  'pool_idea_proposed',
  // Joining a group and opening the wishlist editor require a session.
  'group_joined',
  'wishlist_editor_opened',
]);
