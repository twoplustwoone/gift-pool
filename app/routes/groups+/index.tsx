import { LuPlus, LuUsers } from 'react-icons/lu';
import { type LoaderFunctionArgs, useLoaderData, useNavigate  } from 'react-router';
import { GroupCard } from '#app/components/groups/GroupCard.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { Flex, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getHints } from '#app/utils/client-hints.tsx';
import { formatTimestampDate } from '#app/utils/dates.ts';
import { prisma } from '#app/utils/db.server.ts';
import { GroupRoleSchema, type GroupRole } from '#app/utils/group-role.ts';
import { CreateGroupCompactForm } from './__group-editor.tsx';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const { timeZone } = getHints(request);
  const groups = await prisma.giftGroup.findMany({
    where: {
      groupMembers: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: {
        select: {
          groupMembers: true,
        },
      },
      groupMembers: {
        where: {
          userId,
        },
        select: {
          role: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
  const data = groups.map((g) => {
    const rawRole = g.groupMembers[0]?.role ?? 'MEMBER';
    const parsedRole = GroupRoleSchema.catch('MEMBER').parse(rawRole);
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      createdAtDisplay: formatTimestampDate(g.createdAt, timeZone),
      memberCount: g._count.groupMembers,
      myRole: parsedRole as GroupRole,
    };
  });
  return {
    groups: data,
  };
}
export { action } from './__group-editor.server';
const GroupsIndex = () => {
  const { groups } = useLoaderData<typeof loader>();
  const EmptyState = (
    <Card padding="lg" className="rounded-2xl text-center">
      <LuUsers className="mx-auto mb-3 text-muted-foreground" size={32} aria-hidden="true" />
      <div className="text-lg font-semibold">
        You don’t have any groups yet.
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        Create your first group to start planning together.
      </div>
      <div className="mt-4">
        <CreateGroupDialog>
          <Button>
            <Flex gap={1}>
              <LuPlus />
              <Text>Create your first group</Text>
            </Flex>
          </Button>
        </CreateGroupDialog>
      </div>
    </Card>
  );
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="section"
        icon={<LuUsers className="text-primary" />}
        title="Groups"
      >
        <CreateGroupDialog>
          <Button>
            <Flex gap={1}>
              <LuPlus />
              <Text>Create Group</Text>
            </Flex>
          </Button>
        </CreateGroupDialog>
      </PageHeader>

      {/* Content */}
      <div className="mx-auto w-full max-w-6xl min-h-0 flex-1 px-4 py-8 sm:px-6">
        {groups.length === 0 ? (
          <div className="mx-auto max-w-lg">{EmptyState}</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                g={g}
                onOpen={() => navigate(`/groups/${g.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
const CreateGroupDialog = ({ children }: { children: React.ReactNode }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Flex gap={2}>
              <LuUsers className="text-primary" />{' '}
              <Text weight="bold">Create New Group</Text>
            </Flex>
          </DialogTitle>
        </DialogHeader>
        <CreateGroupCompactForm />
      </DialogContent>
    </Dialog>
  );
};

// GroupCard moved to shared component

export default GroupsIndex;
