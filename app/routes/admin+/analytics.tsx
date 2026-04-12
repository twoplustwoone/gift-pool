import { type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  type AnalyticsCounts,
  getAnalyticsCounts,
} from '#app/utils/analytics.server.ts';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const analytics = await getAnalyticsCounts();
  return {
    analytics,
  };
}
const SummaryCard = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) => (
  <Card className="flex flex-col gap-2 border-border/60 bg-gradient-to-br from-card to-card/70 p-4 shadow-sm">
    <span className="text-sm font-medium text-muted-foreground">{label}</span>
    <span className="text-3xl font-semibold tracking-tight">{value}</span>
    {accent ? (
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {accent}
      </span>
    ) : null}
  </Card>
);
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
  rows: Array<{
    name: string;
    count: number;
  }>;
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
  const { analytics } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-h1">Analytics</h1>
        <p className="text-muted-foreground">
          Internal usage metrics sourced from in-app events.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total users"
          value={analytics.totalUsers.toLocaleString()}
        />
        <SummaryCard label="DAU (24h)" value={analytics.dau.toLocaleString()} />
        <SummaryCard label="WAU (7d)" value={analytics.wau.toLocaleString()} />
        <SummaryCard label="MAU (30d)" value={analytics.mau.toLocaleString()} />
      </section>

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
export default AnalyticsRoute;
export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
