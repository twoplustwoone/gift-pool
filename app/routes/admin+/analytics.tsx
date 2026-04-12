import { type LoaderFunctionArgs, useLoaderData } from 'react-router';
import {
  EmptyRow,
  SectionCard,
  SummaryCard,
} from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  type AnalyticsCounts,
  getAnalyticsCounts,
} from '#app/utils/analytics.server.ts';
import {
  type FunnelStep,
  type NotificationOptOutRow,
  type RetentionCohort,
  getActivationFunnel,
  getNotificationOptOutMatrix,
  getWeeklyRetention,
} from '#app/utils/admin.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [analytics, funnel, retention, optOutMatrix] = await Promise.all([
    getAnalyticsCounts(),
    getActivationFunnel({ cohortStart: thirtyDaysAgo, cohortEnd: now }),
    getWeeklyRetention(8),
    getNotificationOptOutMatrix(),
  ]);

  return { analytics, funnel, retention, optOutMatrix };
}

const LineChart = ({
  data,
  height = 200,
}: {
  data: AnalyticsCounts['dailyActive'];
  height?: number;
}) => {
  if (!data.length) return null;
  const width = Math.max(360, data.length * 12);
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const points = data
    .map((entry, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * (width - 24) + 12;
      const y =
        height -
        (maxCount === 0 ? 0 : (entry.count / maxCount) * (height - 24)) +
        12;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Daily active users (last 30 days)"
        width={width}
        height={height + 24}
        className="text-muted-foreground"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--primary))"
              stopOpacity="0.25"
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--primary))"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <polyline
          fill="url(#chartFill)"
          stroke="none"
          points={`${points} ${width - 12},${height + 12} 12,${height + 12}`}
        />
        <polyline
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          points={points}
        />
        <g className="fill-current text-[10px]">
          <text x="12" y={height + 18}>
            {data[0]?.date}
          </text>
          <text x={width - 60} y={height + 18} textAnchor="end">
            {data[data.length - 1]?.date}
          </text>
        </g>
      </svg>
    </div>
  );
};

const EventTable = ({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; count: number }>;
}) => (
  <Card className="border-border/70 bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
    <div className="overflow-hidden rounded-md border border-border/50">
      <table className="min-w-full divide-y divide-border/60">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Event
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Count
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-4 py-2 text-sm font-medium">
                {row.name.replaceAll('_', ' ')}
              </td>
              <td className="px-4 py-2 text-right text-sm tabular-nums">
                {row.count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);

const AnalyticsRoute = () => {
  const { analytics, funnel, retention, optOutMatrix } =
    useLoaderData<typeof loader>();
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-h1">Analytics</h1>
        <p className="text-muted-foreground">
          Usage metrics, activation funnel, retention, and notification
          opt-outs.
        </p>
      </div>

      {/* --- DAU/WAU/MAU --- */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total users"
          value={analytics.totalUsers}
        />
        <SummaryCard label="DAU (24h)" value={analytics.dau} />
        <SummaryCard label="WAU (7d)" value={analytics.wau} />
        <SummaryCard label="MAU (30d)" value={analytics.mau} />
      </section>

      {/* --- daily active line chart --- */}
      <Card className="space-y-3 border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Daily active users</h2>
            <p className="text-sm text-muted-foreground">Last 30 days</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Peak: {Math.max(...analytics.dailyActive.map((d) => d.count), 0)}
          </div>
        </div>
        <LineChart data={analytics.dailyActive} />
      </Card>

      {/* --- activation funnel --- */}
      <SectionCard
        title="Activation funnel"
        description="Last 30-day cohort. Steps: signup → wishlist → friend → pool contribution → delivered gift."
      >
        <FunnelViz steps={funnel} />
      </SectionCard>

      {/* --- retention cohort grid --- */}
      <SectionCard
        title="Weekly retention"
        description="Cohort by signup week. Retention = user has a Session.createdAt in that week."
      >
        {retention.length === 0 ? (
          <EmptyRow>Not enough data for retention yet.</EmptyRow>
        ) : (
          <RetentionGrid cohorts={retention} />
        )}
      </SectionCard>

      {/* --- notification opt-outs --- */}
      <SectionCard
        title="Notification opt-outs"
        description="Per-type in-app + email opt-out percentages across all users."
      >
        {optOutMatrix.length === 0 ? (
          <EmptyRow>No notification preferences recorded yet.</EmptyRow>
        ) : (
          <OptOutTable rows={optOutMatrix} />
        )}
      </SectionCard>

      {/* --- event tables (existing) --- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <EventTable
          title="Events (last 7 days)"
          rows={analytics.eventsLast7Days}
        />
        <EventTable
          title="Events (last 30 days)"
          rows={analytics.eventsLast30Days}
        />
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Funnel visualization — horizontal bar chart
// ---------------------------------------------------------------------------

const FunnelViz = ({ steps }: { steps: FunnelStep[] }) => {
  if (steps.length === 0 || steps[0]?.count === 0) {
    return <EmptyRow>No users in this cohort yet.</EmptyRow>;
  }
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.step} className="flex items-center gap-3">
          <div className="w-48 shrink-0 text-sm">{step.step}</div>
          <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-muted/40">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-primary/20"
              style={{ width: `${step.percent}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold tabular-nums">
              {step.count.toLocaleString()} ({step.percent}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Retention heatmap grid
// ---------------------------------------------------------------------------

const RetentionGrid = ({ cohorts }: { cohorts: RetentionCohort[] }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 text-left font-medium text-muted-foreground">
            Cohort
          </th>
          <th className="px-2 py-1 text-center font-medium text-muted-foreground">
            Size
          </th>
          {cohorts[0]?.weeks.map((week) => (
            <th
              key={`w${week.weekOffset}`}
              className="px-2 py-1 text-center font-medium text-muted-foreground"
            >
              W{week.weekOffset}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((cohort) => (
          <tr key={cohort.cohortWeek}>
            <td className="px-2 py-1 font-mono">{cohort.cohortWeek}</td>
            <td className="px-2 py-1 text-center tabular-nums">
              {cohort.cohortSize}
            </td>
            {cohort.weeks.map((week) => (
              <td
                key={week.weekOffset}
                className={cn(
                  'px-2 py-1 text-center tabular-nums',
                  week.retainedPercent > 0 && 'font-semibold',
                )}
                style={{
                  backgroundColor: `hsl(var(--primary) / ${Math.min(week.retainedPercent / 100, 1) * 0.4})`,
                }}
              >
                {week.retainedPercent}%
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Opt-out table
// ---------------------------------------------------------------------------

const OptOutTable = ({ rows }: { rows: NotificationOptOutRow[] }) => (
  <div className="overflow-hidden rounded-md border border-border/50">
    <table className="min-w-full divide-y divide-border/60 text-sm">
      <thead className="bg-muted/40">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notification type
          </th>
          <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In-app opt-out
          </th>
          <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email opt-out
          </th>
          <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Users
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {rows.map((row) => (
          <tr key={row.type}>
            <td className="px-4 py-2 font-medium">
              {row.type.replaceAll('_', ' ').toLowerCase()}
            </td>
            <td className="px-4 py-2 text-center tabular-nums">
              {row.inAppOptOutPercent}%
            </td>
            <td className="px-4 py-2 text-center tabular-nums">
              {row.emailOptOutPercent}%
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{row.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default AnalyticsRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
