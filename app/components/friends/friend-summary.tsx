import { Avatar } from '#app/components/ui/avatar.tsx';

export type FriendSummaryProps = {
  user: {
    id: string;
    username: string;
    name: string | null;
    image: { id: string; altText: string | null } | null;
  };
  displayName: string;
  mutualGroups?: { id: string; name: string }[];
  extraGroupCount?: number;
};

export const FriendSummary = ({
  user,
  displayName,
  mutualGroups = [],
  extraGroupCount = 0,
}: FriendSummaryProps) => {
  return (
    <button
      type="button"
      onClick={() => window.location.assign(`/users/${user.username}/wishlist`)}
      className="flex flex-1 items-center gap-4 rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Avatar size="s" image={user.image} user={user} />
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {displayName}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          @{user.username}
        </div>
        {mutualGroups.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {mutualGroups.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {g.name}
              </span>
            ))}
            {extraGroupCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                +{extraGroupCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
};
