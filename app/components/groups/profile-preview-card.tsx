import { LuCake, LuSettings, LuUser } from 'react-icons/lu';
import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
import { formatMonthDay } from '#app/utils/dates.ts';
import { type GroupRole } from '#app/utils/group-role.ts';
import { RoleBadge } from './RoleBadge.tsx';

export type ProfilePreviewMember = {
  user: {
    username: string;
    name: string | null;
    birthday: Date | string | null;
    image: { id: string; altText: string | null } | null;
  };
  role: string;
};

function formatBirthday(birthday: Date | string | null): string {
  if (!birthday) return 'Not set';
  const date = birthday instanceof Date ? birthday : new Date(birthday);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return formatMonthDay(date);
}

/**
 * Inner content of the desktop profile hover-card. The popover surface
 * (border, background, shadow, padding) comes from `HoverCardContent`.
 */
export function ProfilePreviewCard({
  member,
  isYou,
}: Readonly<{ member: ProfilePreviewMember; isYou: boolean }>) {
  const displayName = member.user.name ?? member.user.username;

  return (
    <div className="text-popover-foreground">
      <div className="flex items-center gap-3.5">
        <Avatar
          size="m"
          className="!h-14 !w-14 ring-2 ring-card"
          image={member.user.image}
          user={member.user}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-extrabold leading-tight text-foreground">
              {displayName}
            </span>
            {isYou ? <SystemLabel>you</SystemLabel> : null}
          </div>
          <RoleBadge role={member.role as GroupRole} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t pt-3.5">
        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
          <LuCake className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Birthday
          </span>
          <span className="text-sm font-bold text-foreground">
            {formatBirthday(member.user.birthday)}
          </span>
        </div>
      </div>

      <Link
        to={`/users/${member.user.username}`}
        className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-input bg-card text-sm font-bold text-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
      >
        {isYou ? (
          <LuSettings className="h-4 w-4" aria-hidden />
        ) : (
          <LuUser className="h-4 w-4" aria-hidden />
        )}
        {isYou ? 'Your profile' : 'View profile'}
      </Link>
    </div>
  );
}
