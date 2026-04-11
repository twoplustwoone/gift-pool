import { LuCake } from 'react-icons/lu';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { cn } from '#app/utils/misc.tsx';

// Shared hero used by both /me and /users/:username. Renders an avatar,
// display name, @username, optional birthday pill (friend-gated at the
// loader level — the caller decides whether to pass it), optional joined
// date, and an actions slot for page-specific CTAs.
type ProfileHeaderUser = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string; altText?: string | null } | null;
};

type ProfileHeaderProps = {
  user: ProfileHeaderUser;
  birthdayLabel?: string | null;
  joinedDisplay?: string | null;
  actions?: React.ReactNode;
  className?: string;
};

export function ProfileHeader({
  user,
  birthdayLabel,
  joinedDisplay,
  actions,
  className,
}: ProfileHeaderProps) {
  const displayName = user.name ?? user.username;

  return (
    <section
      className={cn(
        'flex w-full flex-col items-center gap-5 text-center',
        className,
      )}
      data-testid="profile-header"
    >
      <Avatar
        size="l"
        image={user.image ? { id: user.image.id, altText: user.image.altText ?? null } : null}
        user={{ name: user.name, username: user.username }}
        className="ring-4 ring-background shadow-lg"
      />

      <div className="flex flex-col items-center gap-1">
        <Text
          as="h1"
          size="3xl"
          weight="semibold"
          className="leading-tight text-foreground"
        >
          {displayName}
        </Text>
        <Text size="sm" className="text-muted-foreground">
          @{user.username}
        </Text>
      </div>

      {birthdayLabel || joinedDisplay ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {birthdayLabel ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200"
              aria-label={`Birthday ${birthdayLabel}`}
            >
              <LuCake className="h-3.5 w-3.5" aria-hidden />
              <span>{birthdayLabel}</span>
            </span>
          ) : null}
          {joinedDisplay ? (
            <Text size="xs" className="text-muted-foreground">
              Joined {joinedDisplay}
            </Text>
          ) : null}
        </div>
      ) : null}

      {actions ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
