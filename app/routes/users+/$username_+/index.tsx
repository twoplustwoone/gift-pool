import { invariantResponse } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
  type MetaFunction,
  Link,
} from 'react-router';
import { FriendActionButton } from '#app/components/friends/friend-action-button.tsx';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { MutualStrip } from '#app/components/users/mutual-strip.tsx';
import { ProfileHeader } from '#app/components/users/profile-header.tsx';
import { getUserProfileMeta } from '#app/components/users/user-profile-route.tsx';
import { WishlistPreviewCard } from '#app/components/users/wishlist-preview-card.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  BIRTHDAY_VISIBILITY_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { canViewBirthday } from '#app/utils/birthday-visibility.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import {
  loadProfilePageData,
  type ProfilePageData,
} from '#app/utils/profile-page.server.ts';

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
  const canViewProfile = relationship.state === 'FRIENDS';

  if (!canViewProfile) {
    return {
      canViewProfile,
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

  const profileData = await loadProfilePageData(userId, targetUser.id);

  // The viewer is a confirmed direct friend to reach this branch, so the rule
  // reduces to "visible unless NOBODY" — but route it through the shared helper
  // so the pill consults the single source of truth.
  const birthdayVisible = canViewBirthday(user, {
    isDirectFriend: true,
    isMutualFriend: false,
    sharesActiveBirthdayGroup: false,
  });

  return {
    canViewProfile,
    user,
    userJoinedDisplay: user.createdAt.toLocaleDateString(),
    relationship,
    profileData,
    birthdayVisible,
  } as const;
}

const ProfileRoute = () => {
  const data = useLoaderData<typeof loader>();
  const userDisplayName = data.user.name ?? data.user.username;
  const relationship = data.relationship;

  if (!data.canViewProfile) {
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
    <FriendProfileView
      user={data.user}
      userJoinedDisplay={data.userJoinedDisplay}
      relationship={relationship}
      profileData={data.profileData}
      birthdayVisible={data.birthdayVisible}
    />
  );
};

type FriendProfileViewProps = Readonly<{
  user: {
    id: string;
    username: string;
    name: string | null;
    bio: string | null;
    birthday: Date | string | null;
    birthdayVisibility: string;
    image: { id: string } | null;
  };
  userJoinedDisplay: string;
  relationship: Relationship;
  profileData: ProfilePageData;
  birthdayVisible: boolean;
}>;

function FriendProfileView({
  user,
  userJoinedDisplay,
  relationship,
  profileData,
  birthdayVisible,
}: FriendProfileViewProps) {
  const userDisplayName = user.name ?? user.username;
  // Visibility is decided server-side by `canViewBirthday` (single source of
  // truth); the pill is suppressed when the owner opted into NOBODY.
  const upcoming = birthdayVisible ? getUpcomingBirthday(user.birthday) : null;
  const birthdayLabel =
    upcoming && upcoming.daysUntil <= BIRTHDAY_VISIBILITY_DAYS
      ? formatBirthdayLabel(upcoming.date, upcoming.daysUntil)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <ProfileHeader
        user={user}
        bio={user.bio}
        birthdayLabel={birthdayLabel}
        joinedDisplay={userJoinedDisplay}
        actions={
          <>
            <Button asChild>
              <Link to="wishlist" prefetch="intent">
                {userDisplayName}'s wishlist
              </Link>
            </Button>
            <FriendActionButton
              targetUserId={user.id}
              targetUserName={userDisplayName}
              relationship={relationship}
              variant="compact"
            />
          </>
        }
      />

      <MutualStrip
        groups={profileData.mutualGroups}
        friends={profileData.mutualFriends}
      />

      <WishlistPreviewCard
        items={profileData.wishlistPreview.items}
        totalCount={profileData.wishlistPreview.totalCount}
        fullListTo="wishlist"
        ownerName={userDisplayName}
      />
    </div>
  );
}

export default ProfileRoute;
export const meta: MetaFunction<typeof loader> = getUserProfileMeta;
export { UserProfileRouteErrorBoundary as ErrorBoundary } from '#app/components/users/user-profile-route.tsx';
