import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';

type UserProfileMetaDescriptor = {
  data?: {
    user?: {
      name?: string | null;
    };
  };
  params: {
    username?: string;
  };
};

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
        404: ({ params }) => (
          <p>No user with the username "{params.username}" exists</p>
        ),
      }}
    />
  );
}
