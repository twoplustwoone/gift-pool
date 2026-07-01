import {
  type LoaderFunctionArgs,
  Form,
  Link,
  useLoaderData,
} from 'react-router';
import {
  EmptyRow,
  SectionCard,
  SummaryCard,
} from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  ANALYTICS_EXPLORER_DAY_OPTIONS,
  ANALYTICS_EXPLORER_GROUP_BY_OPTIONS,
  ANALYTIC_EVENT_NAMES,
  ANALYTIC_EVENT_SET,
  type AnalyticsExplorerDays,
  type AnalyticsExplorerEventFilter,
  type AnalyticsExplorerGroupBy,
  type AnalyticsExplorerResult,
} from '#app/utils/analytics.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

const CHART_MODES = ['line', 'bar', 'table'] as const;
type ChartMode = (typeof CHART_MODES)[number];

const GROUP_LABELS: Record<AnalyticsExplorerGroupBy, string> = {
  event: 'Event',
  source: 'Source',
  browser: 'Browser',
  os: 'Operating system',
  device: 'Device',
  viewport: 'Viewport',
  displayMode: 'Display mode',
  standalone: 'PWA standalone',
};

const CHART_LABELS: Record<ChartMode, string> = {
  line: 'Line',
  bar: 'Bar',
  table: 'Table',
};

function parseDays(value: string | null): AnalyticsExplorerDays {
  const parsed = Number(value);
  return ANALYTICS_EXPLORER_DAY_OPTIONS.includes(
    parsed as AnalyticsExplorerDays,
  )
    ? (parsed as AnalyticsExplorerDays)
    : 30;
}

function parseEventName(value: string | null): AnalyticsExplorerEventFilter {
  if (value && ANALYTIC_EVENT_SET.has(value)) {
    return value as AnalyticsExplorerEventFilter;
  }
  return 'all';
}

function parseGroupBy(value: string | null): AnalyticsExplorerGroupBy {
  return ANALYTICS_EXPLORER_GROUP_BY_OPTIONS.includes(
    value as AnalyticsExplorerGroupBy,
  )
    ? (value as AnalyticsExplorerGroupBy)
    : 'event';
}

function parseChart(value: string | null): ChartMode {
  return CHART_MODES.includes(value as ChartMode)
    ? (value as ChartMode)
    : 'line';
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');

  const searchParams = new URL(request.url).searchParams;
  const days = parseDays(searchParams.get('days'));
  const eventName = parseEventName(searchParams.get('event'));
  const groupBy = parseGroupBy(searchParams.get('groupBy'));
  const chart = parseChart(searchParams.get('chart'));
  const { getAnalyticsExplorer } =
    await import('#app/utils/analytics.server.ts');
  const explorer = await getAnalyticsExplorer({ days, eventName, groupBy });

  return { explorer, chart };
}

const formatEventName = (name: string) => name.replaceAll('_', ' ');

const formatIdentifier = (id: string | null) =>
  id ? `${id.slice(0, 10)}...` : '—';

const AnalyticsExplorerRoute = () => {
  const { explorer, chart } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Analytics explorer</h1>
          <p className="text-muted-foreground">
            Slice first-party analytics by event, source, environment, and time.
          </p>
        </div>
        <Link
          to="/admin/analytics"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      <ExplorerControls explorer={explorer} chart={chart} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Matching events" value={explorer.totalEvents} />
        <SummaryCard
          label="Unique users"
          value={explorer.uniqueUsers}
          delta="events with a user id"
        />
        <SummaryCard
          label="Unique visitors"
          value={explorer.uniqueVisitors}
          delta="events with a visitor id"
        />
        <SummaryCard
          label="Groups"
          value={explorer.breakdown.length}
          delta={GROUP_LABELS[explorer.groupBy]}
        />
      </section>

      <SectionCard
        title="Trend"
        description={`${explorer.days} days${
          explorer.eventName === 'all'
            ? ''
            : `, ${formatEventName(explorer.eventName)}`
        }`}
      >
        <TrendView mode={chart} explorer={explorer} />
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard
          title={`${GROUP_LABELS[explorer.groupBy]} breakdown`}
          description="Grouped event counts for the selected filter."
        >
          <BreakdownBars rows={explorer.breakdown} />
        </SectionCard>

        <SectionCard
          title="Recent matching events"
          description="Most recent rows, with truncated property previews."
        >
          <RecentEventsTable rows={explorer.recentEvents} />
        </SectionCard>
      </section>
    </div>
  );
};

export default AnalyticsExplorerRoute;

const ExplorerControls = ({
  explorer,
  chart,
}: {
  explorer: AnalyticsExplorerResult;
  chart: ChartMode;
}) => (
  <Card className="border-border/70 bg-card p-4 shadow-sm">
    <Form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="space-y-2">
        <span className="text-sm font-medium">Date range</span>
        <select
          name="days"
          defaultValue={explorer.days}
          className="h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm"
        >
          {ANALYTICS_EXPLORER_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              Last {days} days
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 xl:col-span-2">
        <span className="text-sm font-medium">Event</span>
        <select
          name="event"
          defaultValue={explorer.eventName}
          className="h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm"
        >
          <option value="all">All events</option>
          {ANALYTIC_EVENT_NAMES.map((name) => (
            <option key={name} value={name}>
              {formatEventName(name)}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium">Group by</span>
        <select
          name="groupBy"
          defaultValue={explorer.groupBy}
          className="h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm"
        >
          {ANALYTICS_EXPLORER_GROUP_BY_OPTIONS.map((groupBy) => (
            <option key={groupBy} value={groupBy}>
              {GROUP_LABELS[groupBy]}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium">Chart</span>
        <select
          name="chart"
          defaultValue={chart}
          className="h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm"
        >
          {CHART_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {CHART_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>

      <div className="md:col-span-2 xl:col-span-5">
        <Button type="submit">Apply</Button>
      </div>
    </Form>
  </Card>
);

const TrendView = ({
  mode,
  explorer,
}: {
  mode: ChartMode;
  explorer: AnalyticsExplorerResult;
}) => {
  if (explorer.series.every((row) => row.count === 0)) {
    return <EmptyRow>No matching events in this date range.</EmptyRow>;
  }
  if (mode === 'table') return <TrendTable rows={explorer.series} />;
  if (mode === 'bar') return <TrendBars rows={explorer.series} />;
  return <TrendLine rows={explorer.series} />;
};

const TrendLine = ({ rows }: { rows: AnalyticsExplorerResult['series'] }) => {
  const height = 220;
  const width = Math.max(520, rows.length * 16);
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const points = rows
    .map((row, index) => {
      const x = (index / Math.max(rows.length - 1, 1)) * (width - 24) + 12;
      const y = height - (row.count / maxCount) * (height - 24) + 12;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Analytics event trend"
        width={width}
        height={height + 28}
        className="text-muted-foreground"
      >
        <polyline
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          points={points}
        />
        <g className="fill-current text-[10px]">
          <text x="12" y={height + 20}>
            {rows[0]?.date}
          </text>
          <text x={width - 12} y={height + 20} textAnchor="end">
            {rows.at(-1)?.date}
          </text>
        </g>
      </svg>
    </div>
  );
};

const TrendBars = ({ rows }: { rows: AnalyticsExplorerResult['series'] }) => {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.date}
          className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-3 text-sm"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {row.date}
          </span>
          <div className="h-5 overflow-hidden rounded bg-muted/50">
            <div
              className="h-full rounded bg-primary/30"
              style={{ width: `${(row.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums">
            {row.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

const TrendTable = ({ rows }: { rows: AnalyticsExplorerResult['series'] }) => (
  <div className="max-h-80 overflow-auto rounded-md border border-border/60">
    <table className="min-w-full divide-y divide-border/60 text-sm">
      <thead className="bg-muted/40">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Date
          </th>
          <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Events
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {rows.map((row) => (
          <tr key={row.date}>
            <td className="px-4 py-2 font-mono text-xs">{row.date}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {row.count.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const BreakdownBars = ({
  rows,
}: {
  rows: AnalyticsExplorerResult['breakdown'];
}) => {
  if (rows.length === 0) return <EmptyRow>No grouped data.</EmptyRow>;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="space-y-2">
      {rows.slice(0, 20).map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)_88px] items-center gap-3 text-sm"
        >
          <span className="truncate font-medium" title={row.label}>
            {formatEventName(row.label)}
          </span>
          <div className="h-6 overflow-hidden rounded bg-muted/50">
            <div
              className={cn('h-full rounded bg-primary/25')}
              style={{ width: `${(row.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums">
            {row.count.toLocaleString()} ({row.percent}%)
          </span>
        </div>
      ))}
    </div>
  );
};

const RecentEventsTable = ({
  rows,
}: {
  rows: AnalyticsExplorerResult['recentEvents'];
}) => {
  if (rows.length === 0) return <EmptyRow>No matching events.</EmptyRow>;
  return (
    <div className="max-h-[520px] overflow-auto rounded-md border border-border/60">
      <table className="min-w-full divide-y divide-border/60 text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Time
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Event
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actor
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Properties
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                {new Date(row.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <div className="font-medium">{formatEventName(row.name)}</div>
                <div className="text-xs text-muted-foreground">
                  {row.source}
                </div>
              </td>
              <td className="px-4 py-2 font-mono text-xs">
                <div>u: {formatIdentifier(row.userId)}</div>
                <div>v: {formatIdentifier(row.visitorId)}</div>
              </td>
              <td className="max-w-[360px] truncate px-4 py-2 font-mono text-xs">
                {row.propertiesPreview}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
