import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';

type UserProfileMetaDescriptor = {
  readonly data?: {
    readonly user?: {
      readonly name?: string | null;
    };
  };
  readonly params: {
    readonly username?: string;
  };
};

function UserProfileNotFound({
  params,
}: {
  readonly params: { username?: string };
}) {
  return <p>No user with the username "{params.username}" exists</p>;
}

export function getUserProfileMeta({
  data,
  params,
}: UserProfileMetaDescriptor) {
  const displayName = data?.user?.name ?? params.username;

  return [
    {
      title: `${displayName} | GiftPool`,
    },
    {
      name: 'description',
      content: `Profile of ${displayName} on GiftPool`,
    },
  ];
}

export function UserProfileRouteErrorBoundary() {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        404: UserProfileNotFound,
      }}
    />
  );
}
