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
  'wishlist_purchase_recorded',
  // Phase 2 — admin actions
  'admin_role_granted',
  'admin_role_revoked',
  'admin_sessions_revoked',
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
  'wishlist_purchase_recorded',
  // Admin actions: the acting admin is always a known user.
  'admin_role_granted',
  'admin_role_revoked',
  'admin_sessions_revoked',
]);
