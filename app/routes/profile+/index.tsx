import { invariantResponse } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  useLoaderData,
  type MetaFunction,
} from 'react-router';
import {
  UserProfileCard,
  UserProfileSelfActions,
  UserProfileWishlistAction,
} from '#app/components/users/user-profile-card.tsx';
import { getUserProfileMeta } from '#app/components/users/user-profile-route.tsx';
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
          <UserProfileWishlistAction
            label={`${userDisplayName}'s wishlist`}
            wishlistTo="/wishlist"
          />
        )
      }
    />
  );
};
export default ProfileIndex;
export const meta: MetaFunction<typeof loader> = getUserProfileMeta;
export { UserProfileRouteErrorBoundary as ErrorBoundary } from '#app/components/users/user-profile-route.tsx';
