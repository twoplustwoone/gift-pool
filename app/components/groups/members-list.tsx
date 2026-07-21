import { LuCake } from 'react-icons/lu';
import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
import { formatMonthDay } from '#app/utils/dates.ts';
import { type GroupRole } from '#app/utils/group-role.ts';
import { MemberActionsMenu } from './member-actions-menu.tsx';
import { RoleBadge } from './RoleBadge.tsx';

export type MemberListEntry = {
  user: {
    id: string;
    username: string;
    name: string | null;
    birthday: Date | string | null;
    image: { id: string; altText: string | null } | null;
  };
  role: string;
};

function formatBirthday(birthday: Date | string | null): string {
  if (!birthday) return 'Birthday not set';
  const date = birthday instanceof Date ? birthday : new Date(birthday);
  if (Number.isNaN(date.getTime())) return 'Birthday not set';
  return formatMonthDay(date);
}

function MemberRow({
  giftGroupId,
  viewerRole,
  member,
  isViewer,
}: Readonly<{
  giftGroupId: string;
  viewerRole: GroupRole;
  member: MemberListEntry;
  isViewer: boolean;
}>) {
  const role = member.role as GroupRole;
  const displayName = member.user.name ?? member.user.username;
  const birthdayLabel = formatBirthday(member.user.birthday);

  return (
    <li className="relative flex min-w-0 items-center gap-3 px-2 py-2.5">
      {/*
       * Whole-row click target navigates to the profile. The menu cell
       * below re-enables pointer events for itself (same isolation pattern
       * as friend-row) so the three-dot is a separate 44x44 tap target.
       */}
      <Link
        to={`/users/${member.user.username}`}
        aria-label={`View ${displayName}'s profile`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />

      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <Avatar
          size="s"
          className="!h-10 !w-10"
          image={member.user.image}
          user={member.user}
        />
        <div className="min-w-0 w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="block min-w-0 flex-1 truncate font-semibold text-foreground"
              data-testid="member-display-name"
            >
              {displayName}
            </span>
            <span className="shrink-0">
              <RoleBadge role={role} />
            </span>
            {isViewer ? <SystemLabel>you</SystemLabel> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LuCake className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{birthdayLabel}</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto relative flex-none">
        <MemberActionsMenu
          giftGroupId={giftGroupId}
          viewerRole={viewerRole}
          member={{ user: member.user, role }}
          isViewer={isViewer}
          birthdayLabel={birthdayLabel}
        />
      </div>
    </li>
  );
}

export function MembersList({
  giftGroupId,
  viewerRole,
  viewerId,
  members,
}: Readonly<{
  giftGroupId: string;
  viewerRole: GroupRole;
  viewerId: string;
  members: ReadonlyArray<MemberListEntry>;
}>) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => (
        <MemberRow
          key={member.user.id}
          giftGroupId={giftGroupId}
          viewerRole={viewerRole}
          member={member}
          isViewer={member.user.id === viewerId}
        />
      ))}
    </ul>
  );
}
