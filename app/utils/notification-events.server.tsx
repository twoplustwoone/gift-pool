import { type ReactElement } from 'react';
import { ExchangeActivityEmail } from '#app/emails/exchange-activity.tsx';
import { FriendRequestAcceptedEmail } from '#app/emails/friend-request-accepted.tsx';
import { FriendRequestReceivedEmail } from '#app/emails/friend-request-received.tsx';
import { PoolActivityEmail } from '#app/emails/pool-activity.tsx';
import { PoolInvitationReceivedEmail } from '#app/emails/pool-invitation-received.tsx';
import { UpcomingBirthdayEmail } from '#app/emails/upcoming-birthday.tsx';
import { WishlistClaimConflictEmail } from '#app/emails/wishlist-claim-conflict.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import { formatBirthdayWhen } from '#app/utils/birthday.ts';
import { translate } from '#app/utils/i18n.tsx';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  isOrganizerNudgeNotificationType,
  isPoolActivityNotificationType,
  type NotificationChannel,
  type ExchangeNotificationType,
  type NotificationIntent,
  type OrganizerNudgeNotificationType,
  type PoolActivityNotificationType,
} from '#app/utils/notification-catalog.ts';
import {
  createPreferenceToken,
  getPreferenceManagementUrl,
} from '#app/utils/notification-preference-token.server.ts';
import { type WebPushMessage } from '#app/utils/web-push.server.ts';

const appName = 'GiftPool';

export type InAppNotificationMessage = {
  status: 'UNREAD';
  messageKey: string;
  messageParams?: string | null;
  targetUrl?: string | null;
  metadata?: string | null;
  actions?: string | null;
  friendRequestId?: string | null;
  poolInvitationId?: string | null;
};

export type EmailNotificationMessage = {
  subject: string;
  react: ReactElement;
};

export type NotificationChannelMessageMap = {
  [NOTIFICATION_CHANNELS.IN_APP]: InAppNotificationMessage;
  [NOTIFICATION_CHANNELS.EMAIL]: EmailNotificationMessage;
  [NOTIFICATION_CHANNELS.WEB_PUSH]: WebPushMessage;
};

function formatLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getNotificationOccurrenceKey(
  intent: NotificationIntent,
): string {
  if (intent.sourceIdentifier) return intent.sourceIdentifier;

  switch (intent.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return `friend-request:${intent.payload.friendRequestId}:received`;
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return `friend-request:${intent.payload.friendRequestId}:accepted`;
    case NOTIFICATION_TYPES.POOL_INVITATION_RECEIVED:
      return `pool-invitation:${intent.payload.invitationId}:received`;
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      return `birthday:${intent.payload.birthdayUserId}:${formatLocalDateKey(intent.payload.birthdayDate)}`;
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
    case NOTIFICATION_TYPES.POOL_CANCELLED:
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
    // Both wishlist-claim events are always queued with an explicit
    // `sourceIdentifier` (see queueWishlistClaimConflictNotification and
    // queueWishlistClaimTransferredNotification in pool.server.ts), so the
    // early return above always catches them — this case exists only so the
    // switch stays exhaustive.
    case NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT:
    case NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED:
      throw new Error(
        `Notification ${intent.type} requires a sourceIdentifier.`,
      );
    // One occurrence per exchange per moment. The same key is used whether the
    // reveal was pressed or timed out, so nobody can tell which it was.
    case NOTIFICATION_TYPES.EXCHANGE_STARTED:
      return `exchange:${intent.payload.exchangeId}:started`;
    case NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN:
      return `exchange:${intent.payload.exchangeId}:drawn`;
    case NOTIFICATION_TYPES.EXCHANGE_REVEALED:
      return `exchange:${intent.payload.exchangeId}:revealed`;
    case NOTIFICATION_TYPES.EXCHANGE_CANCELLED:
      return `exchange:${intent.payload.exchangeId}:cancelled`;
    // Keyed on the batch, not the note: everything that landed this morning
    // is one line, so three notes don't buzz three times.
    case NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED:
      return `exchange-note:${intent.payload.noteId}`;
  }
}

export async function renderNotificationChannel<C extends NotificationChannel>(
  intent: NotificationIntent,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  switch (intent.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return renderFriendRequestReceived(intent, channel);
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return renderFriendRequestAccepted(intent, channel);
    case NOTIFICATION_TYPES.POOL_INVITATION_RECEIVED:
      return renderPoolInvitationReceived(intent, channel);
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      return renderUpcomingBirthday(intent, channel);
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
    case NOTIFICATION_TYPES.POOL_CANCELLED:
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
      return renderPoolActivity(intent, channel);
    case NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT:
      return renderWishlistClaimConflict(intent, channel);
    case NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED:
      return renderWishlistClaimTransferred(intent, channel);
    case NOTIFICATION_TYPES.EXCHANGE_STARTED:
    case NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN:
    case NOTIFICATION_TYPES.EXCHANGE_REVEALED:
    case NOTIFICATION_TYPES.EXCHANGE_CANCELLED:
    case NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED:
      return renderExchangeEvent(intent, channel);
  }
}

type ExchangeIntent = NotificationIntent<ExchangeNotificationType>;

type ExchangeCopy = {
  messageKey:
    | 'notifications.exchangeStarted.message'
    | 'notifications.exchangeNamesDrawn.message'
    | 'notifications.exchangeRevealed.message'
    | 'notifications.exchangeFinished.message'
    | 'notifications.exchangeCancelled.message'
    | 'notifications.exchangeNoteReceived.message';
  pushTitleKey:
    | 'notifications.exchangeStarted.pushTitle'
    | 'notifications.exchangeNamesDrawn.pushTitle'
    | 'notifications.exchangeRevealed.pushTitle'
    | 'notifications.exchangeFinished.pushTitle'
    | 'notifications.exchangeCancelled.pushTitle'
    | 'notifications.exchangeNoteReceived.pushTitle';
  messageParams: Record<string, string>;
  emailBody: string;
  buttonLabel: string;
};

function getExchangeCopy(intent: ExchangeIntent): ExchangeCopy {
  const exchange = intent.payload.exchangeTitle;
  switch (intent.type) {
    case NOTIFICATION_TYPES.EXCHANGE_STARTED:
      return {
        messageKey: 'notifications.exchangeStarted.message',
        pushTitleKey: 'notifications.exchangeStarted.pushTitle',
        messageParams: {
          organizer: intent.payload.organizerDisplayName,
          exchange,
        },
        emailBody:
          'Everyone draws one person and gives to them in secret. Join before the names are drawn — after that nobody can be added.',
        buttonLabel: 'See the exchange',
      };
    case NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN:
      return {
        messageKey: 'notifications.exchangeNamesDrawn.message',
        pushTitleKey: 'notifications.exchangeNamesDrawn.pushTitle',
        messageParams: { exchange },
        emailBody:
          "Your person is waiting behind a card only you can open. Pick a moment when nobody's reading over your shoulder.",
        buttonLabel: 'See who you drew',
      };
    case NOTIFICATION_TYPES.EXCHANGE_REVEALED:
      return intent.payload.finalStatus === 'FINISHED'
        ? {
            messageKey: 'notifications.exchangeFinished.message',
            pushTitleKey: 'notifications.exchangeFinished.pushTitle',
            messageParams: { exchange },
            emailBody:
              'This exchange was set to stay secret forever, so the pairings are never shown — but the guesses are scored.',
            buttonLabel: 'See the guesses',
          }
        : {
            messageKey: 'notifications.exchangeRevealed.message',
            pushTitleKey: 'notifications.exchangeRevealed.pushTitle',
            messageParams: { exchange },
            emailBody:
              'The whole loop is out: who had you, who you had, and what everyone gave.',
            buttonLabel: 'See the loop',
          };
    // Says that something arrived and where to read it — never the text and
    // never the sender. A push preview is readable by whoever is standing
    // next to them, and the sender is the whole game.
    case NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED: {
      const count = intent.payload.noteCount;
      const fromGifter = intent.payload.thread === 'FROM_YOUR_GIFTER';
      return {
        messageKey: 'notifications.exchangeNoteReceived.message',
        pushTitleKey: 'notifications.exchangeNoteReceived.pushTitle',
        messageParams: {
          exchange,
          count: String(count),
          who: fromGifter ? 'the person who has you' : 'your person',
        },
        emailBody: fromGifter
          ? `${count === 1 ? 'A note' : `${count} notes`} from whoever has you ${count === 1 ? 'is' : 'are'} waiting in ${exchange}.`
          : `${count === 1 ? 'A reply' : `${count} replies`} from your person ${count === 1 ? 'is' : 'are'} waiting in ${exchange}.`,
        buttonLabel: 'Read it',
      };
    }
    case NOTIFICATION_TYPES.EXCHANGE_CANCELLED:
      return {
        messageKey: 'notifications.exchangeCancelled.message',
        pushTitleKey: 'notifications.exchangeCancelled.pushTitle',
        messageParams: { exchange },
        emailBody: `${intent.payload.organizerDisplayName} cancelled the exchange. Nothing more is expected of you.`,
        buttonLabel: 'See the exchange',
      };
  }
}

// One renderer for all four exchange moments. The body and push preview are
// the same string, and that string never carries a person's name other than
// the organizer's (who is public to the whole roster anyway).
async function renderExchangeEvent<C extends NotificationChannel>(
  intent: ExchangeIntent,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const copy = getExchangeCopy(intent);
  const message = translate('en', copy.messageKey, copy.messageParams);
  // Always the exchange itself: a cancelled exchange still renders a page
  // that says so, which is more use than a bare list — and it keeps this link
  // consistent with the "started" notification the same people already have.
  const exchangeUrl = `/exchanges/${intent.payload.exchangeId}`;

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: copy.messageKey,
        messageParams: JSON.stringify(copy.messageParams),
        targetUrl: exchangeUrl,
        metadata: JSON.stringify({ exchangeId: intent.payload.exchangeId }),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${message} on ${appName}`,
        react: (
          <ExchangeActivityEmail
            appName={appName}
            heading={message}
            message={copy.emailBody}
            exchangeUrl={buildAppUrl(exchangeUrl)}
            buttonLabel={copy.buttonLabel}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', copy.pushTitleKey),
        body: message,
        url: exchangeUrl,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderPoolInvitationReceived<C extends NotificationChannel>(
  intent: NotificationIntent<'POOL_INVITATION_RECEIVED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  const invitationPath = `/pools/invitations/${payload.invitationId}`;
  const messageParams = {
    name: payload.inviterDisplayName,
    pool: payload.poolTitle,
  };
  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.poolInvitation.message',
        messageParams: JSON.stringify(messageParams),
        targetUrl: invitationPath,
        metadata: JSON.stringify({
          poolId: payload.poolId,
          poolTitle: payload.poolTitle,
          recipientLabel: payload.recipientLabel,
          senderUserId: payload.inviterUserId,
          senderDisplayName: payload.inviterDisplayName,
          senderAvatarId: payload.inviterAvatarId ?? null,
        }),
        actions: JSON.stringify([
          {
            kind: 'POOL_INVITATION_ACCEPT',
            labelKey: 'notifications.poolInvitation.accept',
          },
          {
            kind: 'POOL_INVITATION_DECLINE',
            labelKey: 'notifications.poolInvitation.decline',
          },
        ]),
        poolInvitationId: payload.invitationId,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${payload.inviterDisplayName} invited you to ${payload.poolTitle} on ${appName}`,
        react: (
          <PoolInvitationReceivedEmail
            appName={appName}
            inviterDisplayName={payload.inviterDisplayName}
            poolTitle={payload.poolTitle}
            recipientLabel={payload.recipientLabel}
            invitationUrl={buildAppUrl(invitationPath)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.poolInvitation.pushTitle'),
        body: translate(
          'en',
          'notifications.poolInvitation.message',
          messageParams,
        ),
        url: invitationPath,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderFriendRequestReceived<C extends NotificationChannel>(
  intent: NotificationIntent<'FRIEND_REQUEST_RECEIVED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({ name: payload.actorDisplayName }),
        targetUrl: '/friends#incoming-requests',
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        actions: JSON.stringify([
          {
            kind: 'FRIEND_ACCEPT',
            labelKey: 'notifications.friendRequest.accept',
          },
          {
            kind: 'FRIEND_REJECT',
            labelKey: 'notifications.friendRequest.reject',
          },
        ]),
        friendRequestId: payload.friendRequestId,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${payload.actorDisplayName} sent you a friend request on ${appName}`,
        react: (
          <FriendRequestReceivedEmail
            appName={appName}
            actorDisplayName={payload.actorDisplayName}
            actorProfileUrl={buildAppUrl(`/users/${payload.actorUsername}`)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.friendRequest.pushTitle'),
        body: translate('en', 'notifications.friendRequest.message', {
          name: payload.actorDisplayName,
        }),
        url: '/friends#incoming-requests',
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderFriendRequestAccepted<C extends NotificationChannel>(
  intent: NotificationIntent<'FRIEND_REQUEST_ACCEPTED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequestAccepted.message',
        messageParams: JSON.stringify({ name: payload.actorDisplayName }),
        targetUrl: '/friends',
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        // The received notification already owns this unique relation.
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${payload.actorDisplayName} accepted your friend request on ${appName}`,
        react: (
          <FriendRequestAcceptedEmail
            appName={appName}
            actorDisplayName={payload.actorDisplayName}
            actorProfileUrl={buildAppUrl(`/users/${payload.actorUsername}`)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.friendRequestAccepted.pushTitle'),
        body: translate('en', 'notifications.friendRequestAccepted.message', {
          name: payload.actorDisplayName,
        }),
        url: '/friends',
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderUpcomingBirthday<C extends NotificationChannel>(
  intent: NotificationIntent<'UPCOMING_BIRTHDAY'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  const when = formatBirthdayWhen(payload.daysUntil, payload.birthdayDate);
  const messageParams = { name: payload.birthdayDisplayName, when };

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.upcomingBirthday.message',
        messageParams: JSON.stringify(messageParams),
        targetUrl: `/users/${payload.birthdayUsername}`,
        metadata: JSON.stringify({
          birthdayUserId: payload.birthdayUserId,
          birthdayUsername: payload.birthdayUsername,
          birthdayDisplayName: payload.birthdayDisplayName,
          daysUntil: payload.daysUntil,
        }),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      const profileUrl = buildAppUrl(
        `/users/${payload.birthdayUsername}?src=${OCCASION_REMINDER_EMAIL_SRC}`,
      );
      return {
        subject: `${payload.birthdayDisplayName}'s birthday is coming up on ${appName}`,
        react: (
          <UpcomingBirthdayEmail
            appName={appName}
            birthdayDisplayName={payload.birthdayDisplayName}
            when={when}
            profileUrl={profileUrl}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.upcomingBirthday.pushTitle'),
        body: translate(
          'en',
          'notifications.upcomingBirthday.message',
          messageParams,
        ),
        url: `/users/${payload.birthdayUsername}`,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderWishlistClaimConflict<C extends NotificationChannel>(
  intent: NotificationIntent<'WISHLIST_CLAIM_CONFLICT'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  // No poolId/poolTitle here on purpose — this notification can reach
  // someone with no relationship to the pool's group, and the privacy
  // ladder (wishlist-claim-disclosure.ts) never names a pool to an
  // outsider. `wishlistUrl` points at the wishlist the recipient already
  // knows about (it's the one they claimed on), never at the pool.
  const messageParams = {
    item: payload.itemTitle,
    recipient: payload.recipientName,
  };
  const message = translate(
    'en',
    'notifications.wishlistClaimConflict.message',
    messageParams,
  );
  const wishlistUrl = `/users/${payload.recipientUsername}/wishlist`;

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.wishlistClaimConflict.message',
        messageParams: JSON.stringify(messageParams),
        targetUrl: wishlistUrl,
        metadata: JSON.stringify({
          wishlistItemId: payload.wishlistItemId,
          // Carried through to the Release action so it can bind the
          // mutation to this exact claim occurrence — see
          // releaseUserClaim's expectedClaimId in wishlist-claims.server.ts.
          claimId: payload.claimId,
        }),
        actions: JSON.stringify([
          {
            kind: 'WISHLIST_CLAIM_KEEP',
            labelKey: 'notifications.wishlistClaimConflict.keep',
          },
          {
            kind: 'WISHLIST_CLAIM_RELEASE',
            labelKey: 'notifications.wishlistClaimConflict.release',
          },
        ]),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `Still getting ${payload.itemTitle} for ${payload.recipientName}?`,
        react: (
          <WishlistClaimConflictEmail
            appName={appName}
            itemTitle={payload.itemTitle}
            recipientName={payload.recipientName}
            wishlistUrl={buildAppUrl(wishlistUrl)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.wishlistClaimConflict.pushTitle'),
        body: message,
        url: wishlistUrl,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderWishlistClaimTransferred<C extends NotificationChannel>(
  intent: NotificationIntent<'WISHLIST_CLAIM_TRANSFERRED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  // Unlike WISHLIST_CLAIM_CONFLICT, this notification's audience is the
  // inheriting pool's own contributors, who already know their own pool —
  // naming it here is safe (see the payload comment in
  // notification-catalog.ts). It links to the pool, not the recipient's
  // wishlist, for the same reason.
  const messageParams = {
    item: payload.itemTitle,
    recipient: payload.recipientName,
    pool: payload.poolTitle,
  };
  const message = translate(
    'en',
    'notifications.wishlistClaimTransferred.message',
    messageParams,
  );
  const poolUrl = `/pools/${payload.poolId}`;

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.wishlistClaimTransferred.message',
        messageParams: JSON.stringify(messageParams),
        targetUrl: poolUrl,
        metadata: JSON.stringify({
          poolId: payload.poolId,
          wishlistItemId: payload.wishlistItemId,
        }),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `Duplicate risk cleared on ${payload.itemTitle} — ${appName}`,
        react: (
          <PoolActivityEmail
            appName={appName}
            heading={message}
            message="Open the pool for the full details."
            poolUrl={buildAppUrl(poolUrl)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate(
          'en',
          'notifications.wishlistClaimTransferred.pushTitle',
        ),
        body: message,
        url: poolUrl,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

type PoolContextIntent = NotificationIntent<
  PoolActivityNotificationType | OrganizerNudgeNotificationType
>;
type OrganizerNudgeIntent = NotificationIntent<OrganizerNudgeNotificationType>;

type PoolActivityCopy = {
  messageKey:
    | 'notifications.poolVoteStarted.message'
    | 'notifications.poolGiftChosen.message'
    | 'notifications.poolCancelled.message'
    | 'notifications.poolPurchaserAssigned.message'
    | 'notifications.poolDelivererAssigned.message'
    | 'notifications.poolContributionReminder.message'
    | 'notifications.poolVoteReminder.message'
    | 'notifications.poolPurchaseReminder.message'
    | 'notifications.poolDeliveryReminder.message';
  pushTitleKey:
    | 'notifications.poolVoteStarted.pushTitle'
    | 'notifications.poolGiftChosen.pushTitle'
    | 'notifications.poolCancelled.pushTitle'
    | 'notifications.poolPurchaserAssigned.pushTitle'
    | 'notifications.poolDelivererAssigned.pushTitle'
    | 'notifications.poolContributionReminder.pushTitle'
    | 'notifications.poolVoteReminder.pushTitle'
    | 'notifications.poolPurchaseReminder.pushTitle'
    | 'notifications.poolDeliveryReminder.pushTitle';
  messageParams: Record<string, string>;
  emailBody: string;
};

async function renderPoolActivity<C extends NotificationChannel>(
  intent: PoolContextIntent,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const copy = getPoolActivityCopy(intent);
  const message = translate('en', copy.messageKey, copy.messageParams);
  const poolUrl = `/pools/${intent.payload.poolId}`;

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: copy.messageKey,
        messageParams: JSON.stringify(copy.messageParams),
        targetUrl: poolUrl,
        metadata: JSON.stringify({
          poolId: intent.payload.poolId,
          ...(isOrganizerNudgeIntent(intent)
            ? { organizerNudgeId: intent.payload.nudgeId }
            : {}),
        }),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${message} on ${appName}`,
        react: (
          <PoolActivityEmail
            appName={appName}
            heading={message}
            message={copy.emailBody}
            poolUrl={buildAppUrl(poolUrl)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', copy.pushTitleKey),
        body: message,
        url: poolUrl,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

function getPoolActivityCopy(intent: PoolContextIntent): PoolActivityCopy {
  const pool = intent.payload.poolTitle;
  switch (intent.type) {
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
      return {
        messageKey: 'notifications.poolVoteStarted.message',
        pushTitleKey: 'notifications.poolVoteStarted.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the ideas and cast your vote.',
      };
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
      return {
        messageKey: 'notifications.poolGiftChosen.message',
        pushTitleKey: 'notifications.poolGiftChosen.pushTitle',
        messageParams: {
          pool,
          idea: intent.payload.chosenIdeaName,
        },
        emailBody: 'Open the pool to see the chosen gift and next steps.',
      };
    case NOTIFICATION_TYPES.POOL_CANCELLED:
      return {
        messageKey: 'notifications.poolCancelled.message',
        pushTitleKey: 'notifications.poolCancelled.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review its final status.',
      };
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
      return {
        messageKey: 'notifications.poolPurchaserAssigned.message',
        pushTitleKey: 'notifications.poolPurchaserAssigned.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the gift and purchase details.',
      };
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
      return {
        messageKey: 'notifications.poolDelivererAssigned.message',
        pushTitleKey: 'notifications.poolDelivererAssigned.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the delivery details.',
      };
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
      return {
        messageKey: 'notifications.poolContributionReminder.message',
        pushTitleKey: 'notifications.poolContributionReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to set your contribution.',
      };
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
      return {
        messageKey: 'notifications.poolVoteReminder.message',
        pushTitleKey: 'notifications.poolVoteReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the ideas and cast your vote.',
      };
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
      return {
        messageKey: 'notifications.poolPurchaseReminder.message',
        pushTitleKey: 'notifications.poolPurchaseReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the gift and purchase details.',
      };
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
      return {
        messageKey: 'notifications.poolDeliveryReminder.message',
        pushTitleKey: 'notifications.poolDeliveryReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the delivery details.',
      };
  }
}

async function buildManagePreferencesUrl(intent: NotificationIntent) {
  const token = await createPreferenceToken({
    userId: intent.userId,
    type: intent.type,
  });
  return getPreferenceManagementUrl(token);
}

export function recordNotificationDelivery(
  intent: NotificationIntent,
  deliveredChannels: Array<NotificationChannel>,
) {
  if (deliveredChannels.length === 0) return;

  if (intent.type === NOTIFICATION_TYPES.UPCOMING_BIRTHDAY) {
    queueLogEvent({
      name: 'occasion_reminder_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        birthdayUserId: intent.payload.birthdayUserId,
        daysUntil: intent.payload.daysUntil,
        channels: deliveredChannels,
      },
    });
    return;
  }

  if (isOrganizerNudgeIntent(intent)) {
    queueLogEvent({
      name: 'organizer_reminder_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        notificationType: intent.type,
        poolId: intent.payload.poolId,
        organizerNudgeId: intent.payload.nudgeId,
        channels: deliveredChannels,
      },
    });
    return;
  }

  if (isPoolActivityIntent(intent)) {
    queueLogEvent({
      name: 'pool_activity_notification_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        notificationType: intent.type,
        poolId: intent.payload.poolId,
        channels: deliveredChannels,
      },
    });
  }
}

function isOrganizerNudgeIntent(
  intent: NotificationIntent,
): intent is OrganizerNudgeIntent {
  return isOrganizerNudgeNotificationType(intent.type);
}

function isPoolActivityIntent(
  intent: NotificationIntent,
): intent is NotificationIntent<PoolActivityNotificationType> {
  return isPoolActivityNotificationType(intent.type);
}
