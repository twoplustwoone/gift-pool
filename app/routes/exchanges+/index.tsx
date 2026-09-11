import { LuPlus, LuShuffle, LuUsers } from 'react-icons/lu';
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import {
  countdownLabel,
  displayName,
  formatExchangeDate,
} from '#app/components/exchanges/exchange-copy.ts';
import { ExchangeEmptyState } from '#app/components/exchanges/exchange-empty-state.tsx';
import { ExchangeStatusBadge } from '#app/components/exchanges/exchange-status-badge.tsx';
import { GiftingSegments } from '#app/components/gifting/gifting-segments.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { PageShell } from '#app/components/page-shell.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getHints } from '#app/utils/client-hints.tsx';
import {
  listExchangesForUser,
  type ExchangeListItem,
} from '#app/utils/exchanges.server.ts';
import { OCCASION_TYPE_LABELS } from '#app/utils/pool-constants.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const { timeZone } = getHints(request);
  const now = new Date();
  const list = await listExchangesForUser(userId, { now, timeZone });
  return { ...list, now: now.toISOString() };
}

const ExchangeCard = ({
  exchange,
  now,
}: {
  exchange: ExchangeListItem;
  now: Date;
}) => {
  const isActive =
    exchange.status === 'GATHERING' || exchange.status === 'DRAWN';
  const participation =
    exchange.participation === 'IN'
      ? exchange.isOrganizer
        ? 'You organize this one'
        : "You're in"
      : exchange.participation === 'OUT'
        ? 'Sitting this one out'
        : exchange.status === 'GATHERING'
          ? 'Join before the draw'
          : null;
  return (
    <Link to={`/exchanges/${exchange.id}`} className="block">
      <Card variant="interactive" className="p-4">
        <Flex justify="between" align="start" gap={3}>
          <Stack gap={1} className="min-w-0 flex-1">
            <Text weight="semibold" className="truncate">
              {exchange.title}
            </Text>
            <Text size="sm" color="muted" className="truncate">
              {OCCASION_TYPE_LABELS[exchange.occasionType]} ·{' '}
              {formatExchangeDate(exchange.eventDate)}
              {isActive ? ` · ${countdownLabel(exchange.eventDate, now)}` : ''}
              {' · '}
              {exchange.participantCount}{' '}
              {exchange.participantCount === 1 ? 'person' : 'people'}
            </Text>
            <Flex
              gap={2}
              align="center"
              wrap="wrap"
              className="text-xs text-muted-foreground"
            >
              {exchange.giftGroup ? (
                <span className="inline-flex items-center gap-1">
                  <LuUsers aria-hidden size={12} />
                  {exchange.giftGroup.name}
                </span>
              ) : (
                <span>Organized by {displayName(exchange.organizer)}</span>
              )}
              {participation ? <span>· {participation}</span> : null}
            </Flex>
          </Stack>
          <ExchangeStatusBadge stage={exchange.stage} />
        </Flex>
      </Card>
    </Link>
  );
};

const ExchangesIndex = () => {
  const data = useLoaderData<typeof loader>();
  const now = new Date(data.now);
  const hasAny = data.active.length > 0 || data.past.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        variant="section"
        icon={<LuShuffle className="text-primary" size={22} />}
        title="Exchanges"
      >
        <Button asChild>
          <Link to="/exchanges/new">
            <Flex gap={1}>
              <LuPlus />
              <Text>Start an exchange</Text>
            </Flex>
          </Link>
        </Button>
      </PageHeader>

      <PageShell className="min-h-0 flex-1 py-8">
        <GiftingSegments active="exchanges" className="mb-6" />
        {!hasAny ? (
          <div className="mx-auto max-w-lg">
            <ExchangeEmptyState variant="list" />
          </div>
        ) : (
          <Stack gap={8}>
            {data.active.length > 0 ? (
              <section aria-labelledby="exchanges-active">
                <h2
                  id="exchanges-active"
                  className="mb-3 text-sm font-semibold text-muted-foreground"
                >
                  Happening now
                </h2>
                <Stack gap={3}>
                  {data.active.map((exchange) => (
                    <ExchangeCard
                      key={exchange.id}
                      exchange={exchange}
                      now={now}
                    />
                  ))}
                </Stack>
              </section>
            ) : null}
            {data.past.length > 0 ? (
              <section aria-labelledby="exchanges-past">
                <h2
                  id="exchanges-past"
                  className="mb-3 text-sm font-semibold text-muted-foreground"
                >
                  Past
                </h2>
                <Stack gap={3}>
                  {data.past.map((exchange) => (
                    <ExchangeCard
                      key={exchange.id}
                      exchange={exchange}
                      now={now}
                    />
                  ))}
                </Stack>
              </section>
            ) : null}
          </Stack>
        )}
      </PageShell>
    </div>
  );
};

export default ExchangesIndex;
