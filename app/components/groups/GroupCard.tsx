import { LuSettings } from 'react-icons/lu';
import { Link } from 'react-router';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Stack, Text } from '#app/components/ui-kit';
import { usePressFeedback } from '#app/components/wishlist/hooks/use-press-feedback.ts';
import { type GroupRole } from '#app/utils/group-role.ts';

export type GroupCardData = {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  createdAtDisplay: string;
  myRole: GroupRole;
};

export function GroupCard({
  g,
  onOpen,
}: {
  g: GroupCardData;
  onOpen: () => void;
}) {
  const press = usePressFeedback<HTMLDivElement>({ onClick: onOpen });

  return (
    <Card
      padding="lg"
      className={
        'h-full cursor-pointer touch-pan-y rounded-2xl shadow transition [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30'
      }
      role="link"
      tabIndex={0}
      aria-label={`Open group ${g.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      data-pressed={press.pressed ? 'true' : 'false'}
      {...press.rowProps}
    >
      <Stack gap={6}>
        {/* Title + role badge */}
        <Stack gap={1}>
          <div className="flex items-start justify-between gap-3">
            <Text weight="bold" size="lg">
              {g.name}
            </Text>
            <RoleBadge role={g.myRole} />
          </div>
          {g.description ? (
            <div className="line-clamp-2 text-sm text-muted-foreground">
              {g.description}
            </div>
          ) : null}
        </Stack>

        {/* Stats */}
        <Stack gap={1} className="border-b pb-3">
          <div className="h-px w-full" />
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Members</div>
            <div className="font-medium">{g.memberCount}</div>
          </div>
          <div className="h-px w-full" />
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Created</div>
            <div className="font-medium">{g.createdAtDisplay}</div>
          </div>
        </Stack>
      </Stack>
      {g.myRole !== 'MEMBER' ? (
        <div className="flex justify-end pt-3">
          <Link
            to={`/groups/${g.id}`}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <LuSettings className="h-3.5 w-3.5" />
            Manage
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
