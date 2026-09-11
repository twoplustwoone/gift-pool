import { LuSettings, LuShuffle, LuUsers } from 'react-icons/lu';
import { Link, Outlet, useLoaderData } from 'react-router';
import {
  countdownLabel,
  formatExchangeDate,
} from '#app/components/exchanges/exchange-copy.ts';
import { ExchangeStatusBadge } from '#app/components/exchanges/exchange-status-badge.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { PageShell } from '#app/components/page-shell.tsx';
import { OCCASION_TYPE_LABELS } from '#app/utils/pool-constants.ts';
import { type loader as routeLoader } from './__route.server';

export { loader, action } from './__route.server';

const ExchangeLayout = () => {
  const { view, now: nowIso } = useLoaderData<typeof routeLoader>();
  const now = new Date(nowIso);
  const { exchange, viewer } = view;

  const back = exchange.giftGroup
    ? {
        label: exchange.giftGroup.name,
        href: `/groups/${exchange.giftGroup.id}`,
      }
    : { label: 'Exchanges', href: '/exchanges' };

  const subtitleParts = [
    `${OCCASION_TYPE_LABELS[exchange.occasionType]} exchange`,
    exchange.status === 'GATHERING' || exchange.status === 'DRAWN'
      ? `${formatExchangeDate(exchange.eventDate)} · ${countdownLabel(exchange.eventDate, now)}`
      : formatExchangeDate(exchange.eventDate),
  ];
  if (exchange.spendingGuideline && exchange.status === 'DRAWN') {
    subtitleParts.push(exchange.spendingGuideline);
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        variant="detail"
        back={back}
        icon={<LuShuffle size={22} className="shrink-0 text-primary" />}
        title={exchange.title}
        subtitle={subtitleParts.join(' · ')}
      >
        <div className="flex shrink-0 items-center gap-2">
          <ExchangeStatusBadge stage={exchange.stage} className="px-2.5" />
          {viewer.role === 'ORGANIZER' &&
          (exchange.status === 'GATHERING' || exchange.status === 'DRAWN') ? (
            <Link
              to="settings"
              aria-label="Exchange settings"
              className="text-muted-foreground hover:text-foreground"
            >
              <LuSettings className="h-5 w-5" />
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <div className="w-full min-w-0">
        <PageShell className="py-4 sm:py-6">
          {exchange.giftGroup ? (
            <Link
              to={`/groups/${exchange.giftGroup.id}`}
              className="mb-4 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LuUsers size={12} aria-hidden />
              In group{' '}
              <span className="font-medium text-foreground">
                {exchange.giftGroup.name}
              </span>
            </Link>
          ) : null}
          <Outlet />
        </PageShell>
      </div>
    </div>
  );
};

export default ExchangeLayout;
