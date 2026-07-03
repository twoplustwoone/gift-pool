import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  redirect,
  useLoaderData,
  type MetaFunction,
} from 'react-router';
import { z } from 'zod';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import {
  PersonSurface,
  type TemporalState,
} from '#app/components/users/person-surface.tsx';
import { getUserProfileMeta } from '#app/components/users/user-profile-route.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { canViewBirthday } from '#app/utils/birthday-visibility.server.ts';
import {
  BIRTHDAY_VISIBILITY_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  canViewWishlistOf,
  getRelationshipDetails,
  isFriendOfFriend,
} from '#app/utils/friends.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import {
  circleBudgetCents,
  commitSoloGift,
  createPersonNote,
  declineOccasion,
  getOccasionYear,
  getPersonSurfaceAccess,
  PERSON_SURFACE_OCCASION_TYPE,
  recordPoolOutcome,
  recordWishlistPurchaseOutcome,
  requirePersonSurfaceUnlock,
  saveGiftListItem,
  undoOccasionDecline,
} from '#app/utils/person-surface.server.ts';
import { dollarsToCents } from '#app/utils/price.ts';
import { loadProfilePageData } from '#app/utils/profile-page.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';

type Relationship = {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { username } = params;
  const userId = await requireUserId(request);
  const targetUser = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      image: { select: { id: true } },
    },
    where: {
      username,
    },
  });

  invariantResponse(targetUser, 'User not found', {
    status: 404,
  });

  if (targetUser.id === userId) {
    return redirect('/me');
  }

  const relationshipDetails = await getRelationshipDetails(
    userId,
    targetUser.id,
  );
  const relationship: Relationship = {
    state: relationshipDetails.state,
    friendshipId: relationshipDetails.friendship?.id ?? null,
    incomingRequestId: relationshipDetails.incoming?.id ?? null,
    outgoingRequestId: relationshipDetails.outgoing?.id ?? null,
  };

  // Unlock rule (spec §6): FRIENDS or ≥1 shared active group. Groupmates who
  // aren't friends now reach the surface — the old friends-only gate is gone.
  const access = await getPersonSurfaceAccess(userId, targetUser.id);

  if (!access.unlocked) {
    return {
      unlocked: false,
      user: targetUser,
      relationship,
    } as const;
  }

  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      createdAt: true,
      bio: true,
      birthday: true,
      birthdayVisibility: true,
      image: {
        select: {
          id: true,
        },
      },
    },
    where: {
      id: targetUser.id,
    },
  });

  invariantResponse(user, 'User not found', {
    status: 404,
  });

  // Birthday visibility via the single canViewBirthday helper, fed the REAL
  // facts for this viewer — the shared-group override (a groupmate seeing a
  // birthday shared with the group) is honored here, not hardcoded false.
  const sharesActiveBirthdayGroup = access.sharedActiveGroups.some(
    (g) => g.shareBirthday,
  );
  const isMutualFriend = access.isFriend
    ? false
    : await isFriendOfFriend(userId, targetUser.id);
  const birthdayVisible = canViewBirthday(user, {
    isDirectFriend: access.isFriend,
    isMutualFriend,
    sharesActiveBirthdayGroup,
  });

  // Wishlist: existing friendship/FoF path OR a shared group with the target's
  // shareWishlist grant (shareWishlist's first-ever read path).
  const sharesWishlistGroup = access.sharedActiveGroups.some(
    (g) => g.shareWishlist,
  );
  const canViewWishlist =
    sharesWishlistGroup || (await canViewWishlistOf(userId, targetUser.id));

  const profileData = await loadProfilePageData(userId, targetUser.id);
  // Mutual friends are friends-only — a groupmate can't enumerate the graph.
  // Per §12.1 the section is simply absent (empty array → not rendered).
  const mutualFriends = access.isFriend ? profileData.mutualFriends : [];
  // Mutual groups shown are the active shared groups (aligned with the gate).
  const mutualGroups = access.sharedActiveGroups.map((g) => ({
    id: g.id,
    name: g.name,
  }));
  const wishlistPreview = canViewWishlist
    ? profileData.wishlistPreview
    : { items: [], totalCount: 0 };

  // ── Temporal state (spec §4) ──
  const upcoming = birthdayVisible ? getUpcomingBirthday(user.birthday) : null;
  const occasionNear =
    upcoming != null &&
    upcoming.daysUntil >= 0 &&
    upcoming.daysUntil <= BIRTHDAY_VISIBILITY_DAYS;
  const occasion = upcoming
    ? {
        label: formatBirthdayLabel(upcoming.date, upcoming.daysUntil),
        daysUntil: upcoming.daysUntil,
      }
    : null;

  // A decline for the current cycle flips the occasion header to a quiet,
  // private "sitting this one out" variant.
  const occasionYear = getOccasionYear(user.birthday);
  const declined =
    occasionYear != null &&
    (await prisma.occasionDecline.findUnique({
      where: {
        userId_targetUserId_occasionType_occasionYear: {
          userId,
          targetUserId: user.id,
          occasionType: PERSON_SURFACE_OCCASION_TYPE,
          occasionYear,
        },
      },
      select: { id: true },
    })) != null;

  const temporalState: TemporalState =
    occasionNear && declined
      ? 'declined'
      : occasionNear
        ? 'occasion-near'
        : 'cold';

  // Organize routing candidates: the active shared groups, each with the
  // recipient-excluded budget ceiling and member count.
  const organizeGroups = access.sharedActiveGroups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.members.filter((m) => m.userId !== user.id).length,
    budgetCents: circleBudgetCents(g, user.id),
  }));

  return {
    unlocked: true,
    user,
    userJoinedDisplay: user.createdAt.toLocaleDateString(),
    relationship,
    isFriend: access.isFriend,
    birthdayVisible,
    canViewWishlist,
    mutualGroups,
    mutualFriends,
    wishlistPreview,
    temporalState,
    occasion,
    declined,
    organizeGroups,
  } as const;
}

// ─── Write actions (person-surface memory) ──────────────────────────────────

enum PersonIntent {
  SaveIdea = 'save-idea',
  AddNote = 'add-note',
  DeclineOccasion = 'decline-occasion',
  UndoDecline = 'undo-decline',
  SoloCommit = 'solo-commit',
  RecordOutcome = 'record-outcome',
}

const OptionalDollarAmountSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().min(0).transform(dollarsToCents).optional(),
);

const SaveIdeaSchema = z.object({
  intent: z.literal(PersonIntent.SaveIdea),
  name: z.string().min(1, 'Give the idea a name').max(200),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  priceCents: OptionalDollarAmountSchema,
  currency: z.string().max(3).optional(),
});
const AddNoteSchema = z.object({
  intent: z.literal(PersonIntent.AddNote),
  body: z.string().min(1, 'Write something').max(1000),
});
const DeclineSchema = z.object({
  intent: z.literal(PersonIntent.DeclineOccasion),
});
const UndoDeclineSchema = z.object({
  intent: z.literal(PersonIntent.UndoDecline),
});
const SoloCommitSchema = z.object({
  intent: z.literal(PersonIntent.SoloCommit),
  // A pool-of-one has no chosenIdea; the name becomes the display name, so it
  // is required (spec amendment: no nameless solo gift).
  name: z.string().min(1, 'Name the gift').max(200),
});
const RecordOutcomeSchema = z
  .object({
    intent: z.literal(PersonIntent.RecordOutcome),
    kind: z.enum(['pool', 'wishlist']),
    feedback: z.enum(['LOVED', 'OKAY', 'SKIPPED']),
    poolId: z.string().optional(),
    wishlistItemId: z.string().optional(),
  })
  .refine((v) => (v.kind === 'pool' ? !!v.poolId : !!v.wishlistItemId), {
    message: 'Missing target for outcome.',
  });

const PersonActionSchema = z.union([
  SaveIdeaSchema,
  AddNoteSchema,
  DeclineSchema,
  UndoDeclineSchema,
  SoloCommitSchema,
  RecordOutcomeSchema,
]);

export async function action({ params, request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const target = await prisma.user.findFirst({
    where: { username: params.username },
    select: { id: true, birthday: true },
  });
  invariantResponse(target, 'User not found', { status: 404 });
  // The recipient must never act on this surface about themselves.
  if (target.id === userId) {
    throw data({ error: 'Not found.' }, { status: 404 });
  }

  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: PersonActionSchema });
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 });
  }
  const v = submission.value;
  const { requestId } = await getRequestContext(request);

  switch (v.intent) {
    case PersonIntent.SaveIdea: {
      await requirePersonSurfaceUnlock(userId, target.id);
      await saveGiftListItem({
        ownerId: userId,
        targetUserId: target.id,
        name: v.name,
        url: v.url || null,
        priceCents: v.priceCents ?? null,
        currency: v.currency ?? null,
        requestId,
      });
      return data(submission.reply({ resetForm: true }));
    }
    case PersonIntent.AddNote: {
      await requirePersonSurfaceUnlock(userId, target.id);
      await createPersonNote({
        authorId: userId,
        subjectUserId: target.id,
        body: v.body,
        requestId,
      });
      return data(submission.reply({ resetForm: true }));
    }
    case PersonIntent.DeclineOccasion:
    case PersonIntent.UndoDecline: {
      await requirePersonSurfaceUnlock(userId, target.id);
      const occasionYear = getOccasionYear(target.birthday);
      if (occasionYear == null) {
        return data(
          submission.reply({
            formErrors: ['No upcoming occasion to decline.'],
          }),
          { status: 400 },
        );
      }
      if (v.intent === PersonIntent.DeclineOccasion) {
        await declineOccasion({
          userId,
          targetUserId: target.id,
          occasionYear,
          requestId,
        });
      } else {
        await undoOccasionDecline({
          userId,
          targetUserId: target.id,
          occasionYear,
          requestId,
        });
      }
      return data(submission.reply());
    }
    case PersonIntent.SoloCommit: {
      await requirePersonSurfaceUnlock(userId, target.id);
      // Anchor the pool-of-one to the upcoming birthday so the post-occasion
      // window and gift-history cycle guard line up.
      const upcoming = getUpcomingBirthday(target.birthday);
      await commitSoloGift({
        organizerId: userId,
        recipientUserId: target.id,
        name: v.name,
        eventDate: upcoming?.date ?? null,
        requestId,
      });
      return data(submission.reply({ resetForm: true }));
    }
    case PersonIntent.RecordOutcome: {
      // Authorized by ownership inside the helper (organizer / claimer).
      if (v.kind === 'pool') {
        await recordPoolOutcome({
          userId,
          poolId: v.poolId!,
          feedback: v.feedback,
          requestId,
        });
      } else {
        await recordWishlistPurchaseOutcome({
          userId,
          wishlistItemId: v.wishlistItemId!,
          feedback: v.feedback,
          requestId,
        });
      }
      return data(submission.reply());
    }
    default: {
      return data(submission.reply(), { status: 400 });
    }
  }
}

const ProfileRoute = () => {
  const data = useLoaderData<typeof loader>();
  const userDisplayName = data.user.name ?? data.user.username;
  const relationship = data.relationship;

  if (!data.unlocked) {
    return (
      <FriendGateCard
        context="profile"
        relationship={relationship}
        targetUserId={data.user.id}
        targetUserName={userDisplayName}
        targetUser={data.user}
        returnLinkTo="/friends"
      />
    );
  }

  return (
    <PersonSurface
      user={data.user}
      userJoinedDisplay={data.userJoinedDisplay}
      relationship={relationship}
      isFriend={data.isFriend}
      birthdayVisible={data.birthdayVisible}
      canViewWishlist={data.canViewWishlist}
      mutualGroups={data.mutualGroups}
      mutualFriends={data.mutualFriends}
      wishlistPreview={data.wishlistPreview}
      temporalState={data.temporalState}
      occasion={data.occasion}
      declined={data.declined}
      organizeGroups={data.organizeGroups}
    />
  );
};

export default ProfileRoute;
export const meta: MetaFunction<typeof loader> = getUserProfileMeta;
export { UserProfileRouteErrorBoundary as ErrorBoundary } from '#app/components/users/user-profile-route.tsx';
