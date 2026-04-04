import { invariantResponse } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  Link,
  useLoaderData,
  type MetaFunction,
} from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  UserProfileCard,
  UserProfileSelfActions,
} from '#app/components/users/user-profile-card.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { useOptionalUser } from '#app/utils/user.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
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
      id: userId,
    },
  });
  invariantResponse(user, 'User not found', {
    status: 404,
  });
  return {
    user,
    userJoinedDisplay: user.createdAt.toLocaleDateString(),
  };
}
const ProfileIndex = () => {
  const data = useLoaderData<typeof loader>();
  const user = data.user;
  const userDisplayName = user.name ?? user.username;
  const loggedInUser = useOptionalUser();
  const isLoggedInUser = data.user.id === loggedInUser?.id;
  return (
    <UserProfileCard
      showLogout={isLoggedInUser}
      user={data.user}
      userJoinedDisplay={data.userJoinedDisplay}
      actions={
        isLoggedInUser ? (
          <UserProfileSelfActions wishlistTo="/wishlist" />
        ) : (
          <Button asChild>
            <Link to="/wishlist" prefetch="intent">
              {userDisplayName}'s wishlist
            </Link>
          </Button>
        )
      }
    />
  );
};
export default ProfileIndex;
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
