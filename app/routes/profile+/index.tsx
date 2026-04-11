import { invariantResponse } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type MetaFunction,
  Form,
  Link,
  useLoaderData,
} from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { ProfileHeader } from '#app/components/users/profile-header.tsx';
import { getUserProfileMeta } from '#app/components/users/user-profile-route.tsx';
import { WishlistPreviewCard } from '#app/components/users/wishlist-preview-card.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  BIRTHDAY_VISIBILITY_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      createdAt: true,
      birthday: true,
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

  // For the self view we only need the wishlist preview. Mutual groups /
  // mutual friends don't make sense when the viewer IS the target.
  const [wishlistItems, wishlistTotalCount] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: {
        ownerId: userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        url: true,
        hasImage: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      take: 3,
    }),
    prisma.wishlistItem.count({
      where: {
        ownerId: userId,
        status: 'ACTIVE',
      },
    }),
  ]);

  return {
    user,
    userJoinedDisplay: user.createdAt.toLocaleDateString(),
    wishlistPreview: {
      items: wishlistItems,
      totalCount: wishlistTotalCount,
    },
  };
}

const ProfileIndex = () => {
  const data = useLoaderData<typeof loader>();
  const user = data.user;
  const userDisplayName = user.name ?? user.username;
  const upcoming = getUpcomingBirthday(user.birthday);
  const birthdayLabel =
    upcoming && upcoming.daysUntil <= BIRTHDAY_VISIBILITY_DAYS
      ? formatBirthdayLabel(upcoming.date, upcoming.daysUntil)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <ProfileHeader
        user={user}
        birthdayLabel={birthdayLabel}
        joinedDisplay={data.userJoinedDisplay}
        actions={
          <>
            <Button asChild>
              <Link to="/wishlist" prefetch="intent">
                My wishlist
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/settings/profile" prefetch="intent">
                <Icon name="pencil-1">Edit profile</Icon>
              </Link>
            </Button>
            <Form action="/logout" method="POST">
              <Button type="submit" variant="ghost">
                <Icon name="exit">Logout</Icon>
              </Button>
            </Form>
          </>
        }
      />

      {user.birthday ? null : (
        <div className="mx-auto w-full max-w-2xl rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-center">
          <Text size="sm" className="text-muted-foreground">
            Add your birthday in{' '}
            <Link
              to="/settings/profile"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              profile settings
            </Link>{' '}
            so friends know when to celebrate.
          </Text>
        </div>
      )}

      <WishlistPreviewCard
        items={data.wishlistPreview.items}
        totalCount={data.wishlistPreview.totalCount}
        fullListTo="/wishlist"
        ownerName={userDisplayName}
      />
    </div>
  );
};

export default ProfileIndex;
export const meta: MetaFunction<typeof loader> = getUserProfileMeta;
export { UserProfileRouteErrorBoundary as ErrorBoundary } from '#app/components/users/user-profile-route.tsx';
