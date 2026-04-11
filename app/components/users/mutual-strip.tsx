import { LuUser, LuUsers } from 'react-icons/lu';
import { Link } from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';

type MutualGroup = { id: string; name: string };
type MutualFriend = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string } | null;
};

type MutualStripProps = {
  groups: MutualGroup[];
  friends: MutualFriend[];
  maxVisible?: number;
};

// Two row variants sharing the same chip pattern. Used by the profile page
// to surface mutual groups and mutual friends in a compact strip. The strip
// hides itself entirely when both lists are empty, and hides individual rows
// when their list is empty.
export function MutualStrip({
  groups,
  friends,
  maxVisible = 5,
}: MutualStripProps) {
  if (groups.length === 0 && friends.length === 0) return null;

  return (
    <section
      className="mx-auto flex w-full max-w-2xl flex-col gap-3"
      data-testid="mutual-strip"
    >
      {groups.length > 0 ? (
        <MutualRow
          label="Mutual groups"
          count={groups.length}
          maxVisible={maxVisible}
          icon={<LuUsers className="h-3.5 w-3.5" aria-hidden />}
          renderItems={(slice) =>
            slice.map((group) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                prefetch="intent"
                className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
              >
                <LuUsers
                  className="h-3 w-3 flex-shrink-0"
                  aria-hidden
                />
                <span className="truncate">{group.name}</span>
              </Link>
            ))
          }
          items={groups}
        />
      ) : null}

      {friends.length > 0 ? (
        <MutualRow
          label="Mutual friends"
          count={friends.length}
          maxVisible={maxVisible}
          icon={<LuUser className="h-3.5 w-3.5" aria-hidden />}
          renderItems={(slice) =>
            slice.map((friend) => (
              <Link
                key={friend.id}
                to={`/users/${friend.username}`}
                prefetch="intent"
                className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
              >
                <Avatar
                  size={5}
                  image={friend.image ? { id: friend.image.id, altText: null } : null}
                  user={{ name: friend.name, username: friend.username }}
                />
                <span className="truncate">
                  {friend.name ?? friend.username}
                </span>
              </Link>
            ))
          }
          items={friends}
        />
      ) : null}
    </section>
  );
}

type MutualRowProps<T> = {
  label: string;
  count: number;
  maxVisible: number;
  icon: React.ReactNode;
  items: T[];
  renderItems: (slice: T[]) => React.ReactNode;
};

function MutualRow<T>({
  label,
  count,
  maxVisible,
  icon,
  items,
  renderItems,
}: MutualRowProps<T>) {
  const visible = items.slice(0, maxVisible);
  const extra = Math.max(0, count - visible.length);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <Text size="xs" weight="medium" className="uppercase tracking-wide">
          {label}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {renderItems(visible)}
        {extra > 0 ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            +{extra}
          </span>
        ) : null}
      </div>
    </div>
  );
}
