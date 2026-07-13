// Beat 2 of the retention loop ("surface occasions proactively") — the one
// piece of the four-beat loop that had nothing built at all (see
// docs/product/giftpool-vision-spine.md and giftpool-state-of-reality.md).
// This module is the daily sweep: find users with a birthday inside the lead
// window, work out who should be reminded of it (their direct friends and
// shareBirthday groupmates, each still checked against the single
// birthday-visibility source of truth in birthday-visibility.server.ts — do
// not re-derive the visibility rule here), and hand each (recipient,
// birthdayUser) pair to notifyUser. Idempotency (so re-running the sweep, or
// missing a day, never double-sends on any channel) lives in notifyUser's
// NotificationDelivery ledger claim — see notifyUpcomingBirthday in
// notification-service.server.tsx.
import * as Sentry from '@sentry/react-router';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import {
  canViewBirthday,
  type BirthdayVisibilityFacts,
} from '#app/utils/birthday-visibility.server.ts';
import { getUpcomingBirthday } from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts';
import { notifyUser } from '#app/utils/notification-service.server.tsx';
import { getRequestContext } from '#app/utils/request-context.server.ts';

// Fixed for v1. Configurable per-user/per-group lead time is a real future
// ask (raised when scoping this), but adding it now means schema + UI work
// before the reminder loop itself is proven to bring anyone back — exactly
// the "build the cool bounded thing before validating the assumption"
// pattern flagged in giftpool-state-of-reality.md. Revisit once there's
// usage data showing the reminder drives a return visit at all.
export const UPCOMING_BIRTHDAY_LEAD_DAYS = 7;

type BirthdayOwner = {
  id: string;
  name: string | null;
  username: string;
  birthdayVisibility: string;
};

export type UpcomingBirthdayOwner = {
  user: BirthdayOwner;
  daysUntil: number;
  // The birthday's calendar date from getUpcomingBirthday — passed through to
  // delivery so the dedupe key is pinned here, once, and can't shift if the
  // sweep spans local midnight.
  date: Date;
};

// All users whose next birthday falls within [0, leadDays] days from today.
// Inclusive of 0 (today) so a late-running or missed sweep still catches it,
// and inclusive of the full window (not just `=== leadDays`) so a sweep that
// misses a day doesn't skip anyone — notifyUser's sourceIdentifier dedupe
// means re-entering the window on a later day is harmless.
export async function findUpcomingBirthdayOwners(
  leadDays: number = UPCOMING_BIRTHDAY_LEAD_DAYS,
): Promise<UpcomingBirthdayOwner[]> {
  const users = await prisma.user.findMany({
    where: { birthday: { not: null } },
    select: {
      id: true,
      name: true,
      username: true,
      birthday: true,
      birthdayVisibility: true,
    },
  });

  const owners: UpcomingBirthdayOwner[] = [];
  for (const user of users) {
    const upcoming = getUpcomingBirthday(user.birthday);
    if (!upcoming) continue;
    if (upcoming.daysUntil < 0 || upcoming.daysUntil > leadDays) continue;
    owners.push({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        birthdayVisibility: user.birthdayVisibility,
      },
      daysUntil: upcoming.daysUntil,
      date: upcoming.date,
    });
  }
  return owners;
}

async function getDirectFriendIds(userId: string): Promise<Set<string>> {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  return new Set(
    friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId)),
  );
}

// Co-members of any active group where `birthdayUserId` has opted into
// per-group `shareBirthday` — mirrors queryGroupMembers in
// group-overview.server.ts, but in the opposite direction (all viewers of
// one target, not one viewer's view of many targets).
async function getSharedBirthdayGroupMemberIds(
  birthdayUserId: string,
): Promise<Set<string>> {
  const memberships = await prisma.usersInGiftGroups.findMany({
    where: { userId: birthdayUserId, removedAt: null, shareBirthday: true },
    select: { giftGroupId: true },
  });
  const groupIds = memberships.map((m) => m.giftGroupId);
  if (groupIds.length === 0) return new Set();

  const coMembers = await prisma.usersInGiftGroups.findMany({
    where: {
      giftGroupId: { in: groupIds },
      userId: { not: birthdayUserId },
      removedAt: null,
    },
    select: { userId: true },
  });
  return new Set(coMembers.map((m) => m.userId));
}

// Reminder recipients = (direct friends ∪ shareBirthday co-members) who also
// pass canViewBirthday. "Can view the birthday" alone is deliberately NOT
// the audience: under EVERYONE visibility every account in the app may view
// it, but proactively pinging strangers is spam, not a reminder. So the
// relationship set (friends + groupmates) bounds WHO gets pinged, and
// canViewBirthday — the same rule the profile and group-overview surfaces
// consult — still decides whether each of them MAY see it (so NOBODY, or an
// unrecognised visibility value, drops everyone but groupmates the owner
// explicitly shared with). Mutual-friend-only viewers under
// FRIENDS_OF_FRIENDS can view the birthday on the profile but are not
// proactively notified, for the same can-view ≠ should-be-pinged reason.
export async function getBirthdayReminderRecipientIds(
  birthdayUser: Pick<BirthdayOwner, 'id' | 'birthdayVisibility'>,
): Promise<string[]> {
  if (birthdayUser.birthdayVisibility === 'NOBODY') return [];

  const [directFriendIds, sharedGroupMemberIds] = await Promise.all([
    getDirectFriendIds(birthdayUser.id),
    getSharedBirthdayGroupMemberIds(birthdayUser.id),
  ]);

  const candidateIds = new Set([...directFriendIds, ...sharedGroupMemberIds]);
  const recipientIds: string[] = [];
  for (const candidateId of candidateIds) {
    const facts: BirthdayVisibilityFacts = {
      isDirectFriend: directFriendIds.has(candidateId),
      // Never true here: someone who is only a friend-of-friend is not in
      // the candidate set at all.
      isMutualFriend: false,
      sharesActiveBirthdayGroup: sharedGroupMemberIds.has(candidateId),
    };
    if (canViewBirthday(birthdayUser, facts)) {
      recipientIds.push(candidateId);
    }
  }
  return recipientIds;
}

// Click-through half of the occasion-reminder funnel: the upcoming-birthday
// email tags its profile link with `?src=` OCCASION_REMINDER_EMAIL_SRC, and
// the profile loader calls this to attribute the visit (pairing documented in
// analytics.ts). No-op for any other traffic. Lives here (not inline in the
// route) so it's unit-testable with a plain Request.
export async function trackOccasionReminderEmailClick(
  request: Request,
  { viewerId, birthdayUserId }: { viewerId: string; birthdayUserId: string },
) {
  const url = new URL(request.url);
  if (url.searchParams.get('src') !== OCCASION_REMINDER_EMAIL_SRC) return;
  const { requestId, sessionId } = await getRequestContext(request);
  queueLogEvent({
    name: 'occasion_reminder_email_clicked',
    source: 'server',
    userId: viewerId,
    requestId,
    sessionId,
    properties: { birthdayUserId },
  });
}

export type OccasionReminderSweepSummary = {
  birthdayOwnersConsidered: number;
  // Recipients with ≥1 channel NEWLY delivered this run (ledger no-ops don't
  // count — a mid-window re-sweep reports 0 notified, N skipped).
  viewersNotified: number;
  // Recipients where every enabled channel was already claimed (or none
  // enabled): the idempotent no-op path.
  viewersSkipped: number;
  // Recipients where a channel send failed after its claim (at-most-once, in
  // Sentry) or notifyUser threw before claiming (retried tomorrow).
  viewersFailed: number;
};

export async function runOccasionReminderSweep(
  leadDays: number = UPCOMING_BIRTHDAY_LEAD_DAYS,
): Promise<OccasionReminderSweepSummary> {
  const owners = await findUpcomingBirthdayOwners(leadDays);
  let viewersNotified = 0;
  let viewersSkipped = 0;
  let viewersFailed = 0;

  for (const owner of owners) {
    const recipientIds = await getBirthdayReminderRecipientIds(owner.user);
    for (const recipientId of recipientIds) {
      try {
        // sourceIdentifier deliberately omitted: notifyUpcomingBirthday
        // derives the canonical `birthday:<owner>:<yyyy-mm-dd>` base key
        // next to the per-channel ledger claims that consume it.
        const outcome = await notifyUser({
          userId: recipientId,
          type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
          payload: {
            targetUserId: recipientId,
            birthdayUserId: owner.user.id,
            birthdayUsername: owner.user.username,
            birthdayDisplayName: owner.user.name ?? owner.user.username,
            daysUntil: owner.daysUntil,
            birthdayDate: owner.date,
          },
        });
        if (outcome && outcome.failedChannels.length > 0) {
          viewersFailed++;
        } else if (outcome && outcome.deliveredChannels.length > 0) {
          viewersNotified++;
        } else {
          viewersSkipped++;
        }
      } catch (error) {
        // A throw here happened before any channel claim (prefs lookup, DB),
        // so tomorrow's run retries it. Channel-send failures are handled
        // inside notifyUpcomingBirthday (per-channel, at-most-once) and
        // surface via failedChannels above — Sentry is the signal either way.
        viewersFailed++;
        Sentry.captureException(error);
      }
    }
  }

  return {
    birthdayOwnersConsidered: owners.length,
    viewersNotified,
    viewersSkipped,
    viewersFailed,
  };
}
