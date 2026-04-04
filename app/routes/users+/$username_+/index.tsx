import { invariantResponse } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  Link,
  redirect,
  useLoaderData,
  type MetaFunction,
} from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { FriendActionButton } from '#app/components/friends/friend-action-button.tsx';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  UserProfileCard,
  UserProfileSelfActions,
} from '#app/components/users/user-profile-card.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { useOptionalUser } from '#app/utils/user.ts';

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
    };
  }

  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      createdAt: true,
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

  return {
    user,
    canViewProfile,
    userJoinedDisplay: user.createdAt.toLocaleDateString(),
    relationship,
  };
}

const ProfileRoute = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const user = data.user;
  const userDisplayName = user.name ?? user.username;
  const loggedInUser = useOptionalUser();
  const isLoggedInUser = data.user.id === loggedInUser?.id;
  const relationship = data.relationship;

  if (!data.canViewProfile) {
    return (
      <FriendGateCard
        title={t('friends.accessRequiredTitle', {
          name: userDisplayName,
        })}
        description={t('friends.accessRequiredProfile', {
          name: userDisplayName,
        })}
        relationship={relationship}
        targetUserId={data.user.id}
        targetUserName={userDisplayName}
        returnLinkLabel={t('friends.navigateAway')}
        returnLinkTo="/friends"
      />
    );
  }

  return (
    <UserProfileCard
      showLogout={isLoggedInUser}
      user={data.user}
      userJoinedDisplay={data.userJoinedDisplay}
      actions={
        isLoggedInUser ? (
          <UserProfileSelfActions wishlistTo="wishlist" />
        ) : (
          <>
            <FriendActionButton
              targetUserId={data.user.id}
              targetUserName={userDisplayName}
              relationship={relationship}
              variant="primary"
            />
            <Button asChild>
              <Link to="wishlist" prefetch="intent">
                {userDisplayName}'s wishlist
              </Link>
            </Button>
          </>
        )
      }
    />
  );
};

export default ProfileRoute;

export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
  const displayName = data?.user.name ?? params.username;
  return [
    {
      title: `${displayName} | GiftPool`,
    },
    {
      name: 'description',
      content: `Profile of ${displayName} on GiftPool`,
    },
  ];
};

export const ErrorBoundary = () => {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        404: ({ params }) => (
          <p>No user with the username "{params.username}" exists</p>
        ),
      }}
    />
  );
};
