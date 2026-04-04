import { Form, Link } from 'react-router';
import { Spacer } from '#app/components/spacer.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { getUserImgSrc } from '#app/utils/misc.tsx';

type UserProfileCardUser = {
  image?: {
    id: string;
  } | null;
  username: string;
  name: string | null;
};

type UserProfileCardProps = {
  actions: React.ReactNode;
  showLogout?: boolean;
  user: UserProfileCardUser;
  userJoinedDisplay: string;
};

export function UserProfileCard({
  actions,
  showLogout = false,
  user,
  userJoinedDisplay,
}: UserProfileCardProps) {
  const userDisplayName = user.name ?? user.username;

  return (
    <div className="container mb-48 mt-36 flex flex-col items-center justify-center">
      <Spacer size="4xs" />

      <div className="container flex flex-col items-center rounded-3xl bg-muted p-12">
        <div className="relative w-52">
          <div className="absolute -top-40">
            <div className="relative">
              <img
                src={getUserImgSrc(user.image?.id)}
                alt={userDisplayName}
                className="h-52 w-52 rounded-full object-cover"
              />
            </div>
          </div>
        </div>

        <Spacer size="sm" />

        <div className="flex flex-col items-center">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <h1 className="text-center text-h2">{userDisplayName}</h1>
          </div>
          <p className="mt-2 text-center text-muted-foreground">
            Joined {userJoinedDisplay}
          </p>
          {showLogout ? (
            <Form action="/logout" method="POST" className="mt-3">
              <Button type="submit" variant="link" size="pill">
                <Icon name="exit" className="scale-125 max-md:scale-150">
                  Logout
                </Icon>
              </Button>
            </Form>
          ) : null}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UserProfileSelfActions({ wishlistTo }: { wishlistTo: string }) {
  return (
    <>
      <UserProfileWishlistAction label="My wishlist" wishlistTo={wishlistTo} />
      <Button asChild>
        <Link to="/settings/profile" prefetch="intent">
          Edit profile
        </Link>
      </Button>
    </>
  );
}

export function UserProfileWishlistAction({
  label,
  wishlistTo,
}: {
  label: string;
  wishlistTo: string;
}) {
  return (
    <Button asChild>
      <Link to={wishlistTo} prefetch="intent">
        {label}
      </Link>
    </Button>
  );
}
