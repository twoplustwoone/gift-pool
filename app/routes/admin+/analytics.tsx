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
  type DropOffFunnels,
  type EnrichmentFailures,
  type EnrichmentFunnel,
  type FunnelStep,
  type LinkClickStats,
  type NotificationOptOutRow,
  type RetentionCohort,
  type SmartLinkAdoption,
  getActivationFunnel,
  getDropOffFunnels,
  getEnrichmentFailures,
  getEnrichmentFunnel,
  getLinkClickStats,
  getNotificationOptOutMatrix,
  getSmartLinkAdoption,
  getWeeklyRetention,
} from '#app/utils/admin.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    analytics,
    funnel,
    dropOff,
    retention,
    optOutMatrix,
    enrichment,
    enrichmentFailures,
    linkClicks,
    smartLinks,
  ] = await Promise.all([
    getAnalyticsCounts(),
    getActivationFunnel({ cohortStart: thirtyDaysAgo, cohortEnd: now }),
    getDropOffFunnels({ days: 30 }),
    getWeeklyRetention(8),
    getNotificationOptOutMatrix(),
    getEnrichmentFunnel({ days: 30 }),
    getEnrichmentFailures({ days: 30 }),
    getLinkClickStats({ days: 30 }),
    getSmartLinkAdoption({ days: 30 }),
  ]);

  return {
    analytics,
    funnel,
    dropOff,
    retention,
    optOutMatrix,
    enrichment,
    enrichmentFailures,
    linkClicks,
    smartLinks,
  };
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
  const {
    analytics,
    funnel,
    dropOff,
    retention,
    optOutMatrix,
    enrichment,
    enrichmentFailures,
    linkClicks,
    smartLinks,
  } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">
          Usage metrics, activation funnel, retention, and notification
          opt-outs.
        </p>
      </div>

      {/* --- DAU/WAU/MAU --- */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total users" value={analytics.totalUsers} />
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

      {/* --- drop-off funnels --- */}
      <SectionCard
        title="Drop-off funnels"
        description="Last 30 days. Where users stall mid-flow: signup, invite landings, and the add-item editor. Counts are distinct people per step."
      >
        <DropOffSection dropOff={dropOff} />
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

      {/* --- link enrichment & affiliate health --- */}
      <SectionCard
        title="Link enrichment & affiliate"
        description="Last 30 days. Paste-a-link enrichment funnel, failure breakdown, and outbound click reconciliation."
      >
        <EnrichmentSection
          enrichment={enrichment}
          failures={enrichmentFailures}
          linkClicks={linkClicks}
          smartLinks={smartLinks}
        />
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
// Link enrichment & affiliate health
// ---------------------------------------------------------------------------

const pctOf = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

// ---------------------------------------------------------------------------
// Drop-off funnels
// ---------------------------------------------------------------------------

const DropOffSection = ({ dropOff }: { dropOff: DropOffFunnels }) => {
  const hasAnyData =
    (dropOff.signup[0]?.count ?? 0) > 0 ||
    dropOff.invites.some((row) => row.landed + row.deadLinkLandings > 0) ||
    dropOff.editor.opened > 0 ||
    dropOff.share.views > 0;
  if (!hasAnyData) {
    return (
      <EmptyRow>
        No funnel-entry events yet — they start recording from this deploy.
      </EmptyRow>
    );
  }

  return (
    <div className="space-y-6">
      {/* Signup funnel */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Signup</h3>
        <FunnelViz steps={dropOff.signup} />
      </div>

      {/* Invite landings → joins */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Invite links</h3>
        <div className="overflow-hidden rounded-md border border-border/50">
          <table className="min-w-full divide-y divide-border/60 text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Invite type
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Landed
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Joined
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Conversion
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dead-link landings
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {dropOff.invites.map((row) => (
                <tr key={row.inviteType}>
                  <td className="px-4 py-2 font-medium capitalize">
                    {row.inviteType}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.landed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.completed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {pctOf(row.completed, row.landed)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.deadLinkLandings.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Dead-link landings are clicks on expired or revoked invites — a high
          count means links circulate longer than they stay valid.
        </p>
      </div>

      {/* Editor + share reach */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Add-item editor"
          value={`${pctOf(dropOff.editor.added, dropOff.editor.opened)}%`}
          delta={`${dropOff.editor.added.toLocaleString()} of ${dropOff.editor.opened.toLocaleString()} people who opened the editor added an item`}
        />
        <SummaryCard
          label="Share-link views"
          value={dropOff.share.views}
          delta={`${dropOff.share.uniqueVisitors.toLocaleString()} unique visitors`}
        />
        <SummaryCard
          label="Share → outbound click"
          value={dropOff.share.outboundClicks}
          delta="outbound product clicks in window"
        />
      </div>
    </div>
  );
};

const EnrichmentSection = ({
  enrichment,
  failures,
  linkClicks,
  smartLinks,
}: {
  enrichment: EnrichmentFunnel;
  failures: EnrichmentFailures;
  linkClicks: LinkClickStats;
  smartLinks: SmartLinkAdoption;
}) => {
  if (
    enrichment.attempts === 0 &&
    enrichment.itemsSaved === 0 &&
    linkClicks.totalClicks === 0
  ) {
    return <EmptyRow>No enrichment or click activity recorded yet.</EmptyRow>;
  }

  return (
    <div className="space-y-6">
      {/* Funnel cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Unfurl attempts" value={enrichment.attempts} />
        <SummaryCard
          label="Success rate"
          value={`${pctOf(enrichment.successes, enrichment.attempts)}%`}
          delta={`${enrichment.successes.toLocaleString()} succeeded${
            enrichment.avgDurationMs == null
              ? ''
              : ` · avg ${enrichment.avgDurationMs}ms`
          }`}
        />
        <SummaryCard
          label="Price found"
          value={`${pctOf(enrichment.foundPrice, enrichment.attempts)}%`}
          delta={`title ${pctOf(enrichment.foundTitle, enrichment.attempts)}% · image ${pctOf(enrichment.foundImage, enrichment.attempts)}%`}
        />
        <SummaryCard
          label="Kept at save"
          value={`${pctOf(enrichment.itemsSavedEnriched, enrichment.itemsSaved)}%`}
          delta={`${enrichment.itemsSavedEnriched.toLocaleString()} of ${enrichment.itemsSaved.toLocaleString()} new items · ${pctOf(enrichment.itemsSavedWithPrice, enrichment.itemsSaved)}% have a price`}
        />
      </div>

      {/* LLM + smart links */}
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          label="Claude fallback"
          value={enrichment.llmAttempted}
          delta={
            enrichment.llmAttempted > 0
              ? `${enrichment.llmRescued.toLocaleString()} rescued (${pctOf(enrichment.llmRescued, enrichment.llmAttempted)}%)`
              : 'No fallback calls (structured data sufficed or key unset)'
          }
        />
        <SummaryCard
          label="Ideas from wishlists"
          value={`${pctOf(smartLinks.fromWishlist, smartLinks.proposed)}%`}
          delta={`${smartLinks.fromWishlist.toLocaleString()} of ${smartLinks.proposed.toLocaleString()} proposed ideas · ${pctOf(smartLinks.withPrice, smartLinks.proposed)}% priced`}
        />
      </div>

      {/* Failure breakdown */}
      {failures.byOutcome.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60 text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Failure outcome
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {failures.byOutcome.map((row) => (
                  <tr key={row.outcome}>
                    <td className="px-4 py-2 font-medium">
                      {row.outcome.replaceAll('_', ' ')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60 text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Top failing hosts
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Failures
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {failures.topFailingHosts.map((row) => (
                  <tr key={row.host}>
                    <td className="px-4 py-2 font-mono text-xs">{row.host}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Outbound clicks */}
      <div className="space-y-3">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Outbound clicks" value={linkClicks.totalClicks} />
          <SummaryCard
            label="Tagged clicks"
            value={linkClicks.taggedClicks}
            delta={`${pctOf(linkClicks.taggedClicks, linkClicks.totalClicks)}% of clicks carried an affiliate tag`}
          />
          <SummaryCard
            label="By source"
            value={`${linkClicks.itemClicks} / ${linkClicks.ideaClicks}`}
            delta="wishlist items / pool ideas"
          />
        </div>
        {linkClicks.perDay.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60 text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Day
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Clicks
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tagged
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {linkClicks.perDay.slice(0, 14).map((row) => (
                  <tr key={row.day}>
                    <td className="px-4 py-2 font-mono text-xs">{row.day}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.tagged.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Reconciliation: compare “Tagged” with the click report in your Amazon
          Associates dashboard. A persistent gap means clicks are being lost or
          stripped after the redirect (extensions, bots, blocked referrers).
        </p>
      </div>
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
