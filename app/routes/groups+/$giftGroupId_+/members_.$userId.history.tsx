import { LuChevronLeft, LuGift } from 'react-icons/lu';
import { type LoaderFunctionArgs, Link, useLoaderData } from 'react-router';
import { Card } from '#app/components/ui/card.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { getHints } from '#app/utils/client-hints.tsx';
import { formatCalendarDate, formatTimestampDate } from '#app/utils/dates.ts';
import {
  OCCASION_TYPE_LABELS,
  POOL_STATUS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const memberUserId = params.userId!;
  const { requireUserIdInGroup } = await import('#app/utils/groups.server.ts');
  const { prisma } = await import('#app/utils/db.server.ts');

  const viewerId = await requireUserIdInGroup(request, groupId);
  const { timeZone } = getHints(request);

  // Privacy: the target member must never see their own gift history.
  // 404 (indistinguishable from nonexistent route).
  if (memberUserId === viewerId) {
    throw new Response('Not Found', { status: 404 });
  }

  // Target user must be a member of this group (404 otherwise).
  const membership = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId: memberUserId, giftGroupId: groupId },
    },
    select: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Response('Not Found', { status: 404 });
  }

  const pools = await prisma.pool.findMany({
    where: {
      giftGroupId: groupId,
      recipientUserId: memberUserId,
      status: POOL_STATUS.DELIVERED,
    },
    select: {
      id: true,
      title: true,
      occasionType: true,
      eventDate: true,
      updatedAt: true,
      finalPriceCents: true,
      chosenIdea: { select: { name: true } },
      contributors: {
        select: { contributionCents: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const gifts = pools.map((pool) => ({
    id: pool.id,
    title: pool.title,
    occasionType: pool.occasionType,
    dateDisplay: pool.eventDate
      ? formatCalendarDate(pool.eventDate)
      : formatTimestampDate(pool.updatedAt, timeZone),
    giftName: pool.chosenIdea?.name ?? null,
    totalCents:
      pool.finalPriceCents ??
      pool.contributors.reduce((sum, c) => sum + (c.contributionCents ?? 0), 0),
  }));

  return {
    member: {
      id: membership.user.id,
      username: membership.user.username,
      name: membership.user.name ?? membership.user.username,
    },
    gifts,
  };
}

const MemberGiftHistoryPage = () => {
  const { member, gifts } = useLoaderData<typeof loader>();

  return (
    <Stack gap={4}>
      <Link
        to="../members"
        relative="path"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <LuChevronLeft size={14} />
        Back to members
      </Link>

      <div>
        <Text size="lg" weight="semibold" as="h2">
          Gifts for {member.name}
        </Text>
        <Text size="sm" className="text-muted-foreground">
          Past pools delivered to @{member.username} in this group.
        </Text>
      </div>

      {gifts.length === 0 ? (
        <Card padding="md">
          <Flex gap={3} align="center">
            <LuGift className="text-muted-foreground" size={18} />
            <Text size="sm" className="text-muted-foreground">
              No gifts delivered yet.
            </Text>
          </Flex>
        </Card>
      ) : (
        <Stack gap={2}>
          {gifts.map((gift) => (
            <GiftHistoryRow key={gift.id} gift={gift} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default MemberGiftHistoryPage;

const GiftHistoryRow = ({
  gift,
}: {
  gift: {
    id: string;
    title: string;
    occasionType: string;
    dateDisplay: string;
    giftName: string | null;
    totalCents: number;
  };
}) => {
  const occasion = OCCASION_TYPE_LABELS[gift.occasionType as OccasionType];
  return (
    <Link to={`/pools/${gift.id}`} className="block">
      <Card padding="md" className="transition-shadow hover:shadow-md">
        <Flex justify="between" align="start" gap={3}>
          <Stack gap={1} className="min-w-0 flex-1">
            <Flex gap={2} align="center" wrap="wrap">
              <Text weight="semibold" className="truncate">
                {gift.title}
              </Text>
              <Text size="xs" className="text-muted-foreground">
                · {occasion}
              </Text>
            </Flex>
            <Text size="sm" className="text-muted-foreground">
              {gift.giftName ? (
                <>
                  Gave:{' '}
                  <span className="font-medium text-foreground">
                    {gift.giftName}
                  </span>
                </>
              ) : (
                'No specific gift recorded'
              )}
            </Text>
            <Text size="xs" className="text-muted-foreground">
              {gift.dateDisplay}
            </Text>
          </Stack>
          {gift.totalCents > 0 && (
            <div className="shrink-0 text-right">
              <Text size="sm" weight="semibold">
                ${(gift.totalCents / 100).toFixed(2)}
              </Text>
              <Text size="xs" className="text-muted-foreground">
                total
              </Text>
            </div>
          )}
        </Flex>
      </Card>
    </Link>
  );
};
