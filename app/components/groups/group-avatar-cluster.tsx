import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#app/components/ui/hover-card.tsx';
import { useHasHover } from '#app/hooks/use-has-hover.ts';
import {
  ProfilePreviewCard,
  type ProfilePreviewMember,
} from './profile-preview-card.tsx';

type ClusterMember = ProfilePreviewMember & { user: { id: string } };

const MAX_AVATARS = 5;

export function GroupAvatarCluster({
  members,
  viewerId,
}: Readonly<{
  members: ReadonlyArray<ClusterMember>;
  viewerId: string;
}>) {
  const hasHover = useHasHover();
  const visible = members.slice(0, MAX_AVATARS);
  const extra = members.length - visible.length;

  return (
    // Desktop-only adornment — the mobile header already shows the count.
    <div className="hidden items-center sm:flex">
      <div className="flex -space-x-2">
        {visible.map((member) => {
          const displayName = member.user.name ?? member.user.username;
          const avatar = (
            <Link
              to={`/users/${member.user.username}`}
              aria-label={`View ${displayName}'s profile`}
              className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar
                size="s"
                className="ring-2 ring-background"
                image={member.user.image}
                user={member.user}
              />
            </Link>
          );

          if (!hasHover) {
            return <span key={member.user.id}>{avatar}</span>;
          }

          return (
            <HoverCard key={member.user.id} openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>{avatar}</HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                sideOffset={-6}
                className="w-72"
              >
                <ProfilePreviewCard
                  member={member}
                  isYou={member.user.id === viewerId}
                />
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
      {extra > 0 ? (
        <span className="ml-1.5 inline-flex h-8 items-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
