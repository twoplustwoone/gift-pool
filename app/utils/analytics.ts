export const CLIENT_ENVIRONMENT_EVENT_NAME = 'client_environment_observed';

export const PWA_ANALYTIC_EVENT_NAMES = [
  'pwa_prompt_available',
  'pwa_install_clicked',
  'pwa_install_accepted',
  'pwa_install_dismissed',
  'pwa_appinstalled',
  'pwa_launched_standalone',
] as const;

export const ANALYTIC_EVENT_NAMES = [
  'user_registered',
  'user_logged_in',
  'wishlist_viewed',
  'wishlist_item_added',
  'wishlist_item_archived',
  // Phase 1.5 — gifting workflow instrumentation
  'pool_created',
  'pool_contributor_joined',
  'pool_invitation_sent',
  'pool_invitation_accepted',
  'pool_invitation_declined',
  'pool_vote_called',
  'pool_vote_cast',
  'pool_decided',
  'pool_purchased',
  'pool_delivered',
  'pool_cancelled',
  'pool_purchaser_assigned',
  'pool_deliverer_assigned',
  // Automatic pool activity fanout. Fires per recipient only when at least one
  // channel newly delivers; properties contain type, pool id, and channels.
  'pool_activity_notification_sent',
  // Pool-backed wishlist claims. The conflict/transfer pair is the measurement
  // of whether this actually prevents duplicate gifts:
  //   wishlist_claim_conflict_shown → wishlist_claim_released → wishlist_claim_transferred
  'wishlist_claim_granted',
  'wishlist_claim_conflict_shown',
  'wishlist_claim_released',
  'wishlist_claim_transferred',
  // Preset task-bound organizer reminders. Fires per recipient only after at
  // least one channel delivers; repeated requests remain queryable from the
  // OrganizerNudge audit rows without putting recipient lists in analytics.
  'organizer_reminder_sent',
  // A send action that did not create an OrganizerNudge audit row. `reason`
  // distinguishes preference/task suppression from cooldown and weekly-limit
  // enforcement, so admin observability does not infer blocked attempts from
  // page views or availability checks.
  'organizer_reminder_skipped',
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
  // Web Push opt-in funnel.
  'push_subscribed',
  'push_unsubscribed',
  'push_permission_denied',
  'push_prompt_dismissed',
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
  // Public share page CTA clicks (`placement: banner|footer_card`). Sits
  // between wishlist_share_viewed and signup_submitted in the share-reach
  // funnel; anonymous visitors fire it, so NOT user-required.
  'share_cta_clicked',
  // Occasion reminders (the daily birthday sweep). `occasion_reminder_sent`
  // fires server-side per recipient when ≥1 channel newly delivers
  // (`channels`, `daysUntil`, `birthdayUserId` properties). Its click-through
  // completions: notification_clicked (`type: UPCOMING_BIRTHDAY`) for the
  // bell, occasion_reminder_email_clicked for the email (the profile link
  // carries `?src=` OCCASION_REMINDER_EMAIL_SRC and the profile loader logs
  // it). Both sides require a signed-in user, so both are user-required.
  'occasion_reminder_sent',
  'occasion_reminder_email_clicked',
  // Person surface — circle-private memory write paths. All require an acting
  // user (the viewer), so all are user-required below.
  'gift_list_item_saved',
  'person_note_created',
  'occasion_declined',
  'occasion_decline_undone',
  'solo_gift_committed',
  'gift_outcome_recorded',
  'saved_idea_promoted',
  // Browser/device/PWA environment snapshot. Anonymous-capable and deduped
  // daily by visitor id in analytics.server.ts.
  CLIENT_ENVIRONMENT_EVENT_NAME,
  ...PWA_ANALYTIC_EVENT_NAMES,
] as const;

export type AnalyticEventName = (typeof ANALYTIC_EVENT_NAMES)[number];

// `src` query-param value the upcoming-birthday email appends to its profile
// link; the profile loader fires occasion_reminder_email_clicked when it sees
// it. Lives here (client-safe, no deps) so the email builder and the loader
// share one definition.
export const OCCASION_REMINDER_EMAIL_SRC = 'birthday-reminder-email';

export const ANALYTIC_EVENT_SET = new Set<string>(ANALYTIC_EVENT_NAMES);

export const ANALYTICS_EXPLORER_DAY_OPTIONS = [7, 30, 90] as const;
export type AnalyticsExplorerDays =
  (typeof ANALYTICS_EXPLORER_DAY_OPTIONS)[number];

export const ANALYTICS_EXPLORER_GROUP_BY_OPTIONS = [
  'event',
  'source',
  'browser',
  'os',
  'device',
  'viewport',
  'displayMode',
  'standalone',
] as const;
export type AnalyticsExplorerGroupBy =
  (typeof ANALYTICS_EXPLORER_GROUP_BY_OPTIONS)[number];
export type AnalyticsExplorerEventFilter = AnalyticEventName | 'all';

export type AnalyticsExplorerSeriesRow = {
  date: string;
  count: number;
};

export type AnalyticsExplorerBreakdownRow = {
  label: string;
  count: number;
  percent: number;
};

export type AnalyticsExplorerRecentEvent = {
  id: string;
  eventId: string;
  name: string;
  source: string;
  createdAt: string;
  userId: string | null;
  visitorId: string | null;
  propertiesPreview: string;
};

export type AnalyticsExplorerResult = {
  days: AnalyticsExplorerDays;
  eventName: AnalyticsExplorerEventFilter;
  groupBy: AnalyticsExplorerGroupBy;
  totalEvents: number;
  uniqueUsers: number;
  uniqueVisitors: number;
  series: AnalyticsExplorerSeriesRow[];
  breakdown: AnalyticsExplorerBreakdownRow[];
  recentEvents: AnalyticsExplorerRecentEvent[];
};

export const USER_REQUIRED_EVENTS: Set<AnalyticEventName> = new Set([
  'user_registered',
  'user_logged_in',
  'wishlist_item_added',
  'wishlist_item_archived',
  'wishlist_viewed',
  // Phase 1.5 — every workflow event has a known actor (the acting user).
  'pool_created',
  'pool_contributor_joined',
  'pool_invitation_sent',
  'pool_invitation_accepted',
  'pool_invitation_declined',
  'pool_vote_called',
  'pool_vote_cast',
  'pool_decided',
  'pool_purchased',
  'pool_delivered',
  'pool_cancelled',
  'pool_purchaser_assigned',
  'pool_deliverer_assigned',
  'pool_activity_notification_sent',
  // Pool-backed wishlist claims: the actor is always the authenticated
  // decider (grant/conflict) or claim holder (release/transfer).
  'wishlist_claim_granted',
  'wishlist_claim_conflict_shown',
  'wishlist_claim_released',
  'wishlist_claim_transferred',
  'organizer_reminder_sent',
  'organizer_reminder_skipped',
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
  'push_subscribed',
  'push_unsubscribed',
  'push_permission_denied',
  'push_prompt_dismissed',
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
  // Occasion reminders: the recipient (sent) and the clicking viewer (email
  // click) are always signed-in users.
  'occasion_reminder_sent',
  'occasion_reminder_email_clicked',
  // Person-surface memory writes all have a known acting viewer.
  'gift_list_item_saved',
  'person_note_created',
  'occasion_declined',
  'occasion_decline_undone',
  'solo_gift_committed',
  'gift_outcome_recorded',
  'saved_idea_promoted',
]);
