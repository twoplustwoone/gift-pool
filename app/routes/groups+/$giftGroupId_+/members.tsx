import { Link, useRouteLoaderData } from '@remix-run/react';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { type loader as routeLoader } from './__route.server';

const GroupMembersRoute = () => {
  const { giftGroup } =
    useRouteLoaderData<typeof routeLoader>('routes/groups+/$giftGroupId_+/_layout')!;
  return (
    <Card padding="lg">
      <div className="mb-4 text-lg font-semibold">Members</div>
      <ul className="space-y-2">
        {giftGroup.groupMembers.map((m) => (
          <li
            key={m.user.id}
            className="flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard p-2"
          >
            <Link to={`/users/${m.user.username}`} className="flex items-center gap-2">
              <Avatar size="s" image={m.user.image} user={m.user} />
              <div className="text-sm font-medium">{m.user.username}</div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default GroupMembersRoute;
