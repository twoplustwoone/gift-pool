import {
  LuActivity,
  LuClock,
  LuSparkles,
  LuTriangleAlert,
} from 'react-icons/lu';
import {
  Link,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { SectionCard, SummaryCard, EmptyRow } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import {
  getCleanupPreviewCounts,
  getOverviewCounts,
  getRecentActivity,
  getStuckPools,
} from '#app/utils/admin.server.ts';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';
import { POOL_STATUS_LABELS } from '#app/utils/pool-constants.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');

  const [overview, stuckPools, cleanup, activity] = await Promise.all([
    getOverviewCounts(),
    getStuckPools(5),
    getCleanupPreviewCounts(),
    getRecentActivity(15),
  ]);

  return { overview, stuckPools, cleanup, activity };
}

const STUCK_REASON_LABEL: Record<
  'open_overdue' | 'voting_stalled' | 'decided_stalled',
  string
> = {
  open_overdue: 'Event date past, still OPEN',
  voting_stalled: 'VOTING with no votes >7d',
  decided_stalled: 'DECIDED >14d without progress',
};

const formatRelative = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const AdminIndexRoute = () => {
  const { overview, stuckPools, cleanup, activity } =
    useLoaderData<typeof loader>();

  const totalCleanup =
    cleanup.expiredVerifications +
    cleanup.expiredSessions +
    cleanup.stalePendingFriendRequests +
    cleanup.staleRejectedFriendRequests +
    cleanup.revokedOrExpiredGroupInvitations +
    cleanup.expiredGroupBans;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Overview</h1>
        <p className="text-muted-foreground">
          At-a-glance product health — all figures are direct queries against
          the domain tables, cached 60s.
        </p>
      </div>

      {/* --- primary metrics --- */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Users"
          value={overview.users.total}
          delta={`+${overview.users.last7d} this week · +${overview.users.last24h} today`}
        />
        <SummaryCard
          label="Active pools"
          value={overview.pools.active}
          delta={`${overview.pools.total} total · ${overview.pools.byStatus.DELIVERED} delivered`}
          tone={overview.pools.stuck > 0 ? 'warn' : 'default'}
        />
        <SummaryCard
          label="Wishlist items"
          value={overview.wishlist.items}
          delta={`${overview.wishlist.active} active · ${overview.wishlist.archived} archived`}
        />
        <SummaryCard
          label="Friendships"
          value={overview.friendships.total}
          delta={
            overview.friendships.pendingRequestsOverThreshold > 0
              ? `${overview.friendships.pendingRequestsOverThreshold} pending request(s) >7d`
              : 'all requests fresh'
          }
        />
      </section>

      {/* --- secondary metrics --- */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Stuck pools"
          value={overview.pools.stuck}
          tone={overview.pools.stuck > 0 ? 'danger' : 'default'}
          delta={
            overview.pools.stuck > 0
              ? 'needs attention'
              : 'nothing stuck'
          }
        />
        <SummaryCard
          label="Wishlist purchases"
          value={overview.wishlist.purchases}
        />
        <SummaryCard
          label="Unread notifications (24h)"
          value={overview.notifications.unread24h}
        />
        <SummaryCard
          label="Cleanup queue"
          value={totalCleanup}
          tone={totalCleanup > 0 ? 'warn' : 'default'}
          delta={totalCleanup > 0 ? 'review on Ops tab' : 'nothing expired'}
        />
      </section>

      {/* --- alerts + cleanup side-by-side --- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Pools needing attention"
          description="Automatically flagged based on status + age."
          action={
            <Link
              to="/admin/pools?status=stuck"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          }
        >
          {stuckPools.length === 0 ? (
            <EmptyRow>
              <LuTriangleAlert className="mr-1 inline h-4 w-4" />
              No stuck pools. Nothing to do here.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-border/60">
              {stuckPools.map((pool) => (
                <li key={pool.id} className="py-2">
                  <Link
                    to={`/admin/pools/${pool.id}`}
                    className="group flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium group-hover:underline">
                        {pool.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {POOL_STATUS_LABELS[pool.status]} ·{' '}
                        {STUCK_REASON_LABEL[pool.reason]} · organizer{' '}
                        {pool.organizer.username}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(pool.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Cleanup queue"
          description="One-click purges on the Ops tab."
          action={
            <Link
              to="/admin/ops"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open Ops →
            </Link>
          }
        >
          {totalCleanup === 0 ? (
            <EmptyRow>
              <LuSparkles className="mr-1 inline h-4 w-4" />
              Nothing to clean up.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              <CleanupRow
                label="Expired verification rows"
                count={cleanup.expiredVerifications}
              />
              <CleanupRow
                label="Expired sessions"
                count={cleanup.expiredSessions}
              />
              <CleanupRow
                label="Stale pending friend requests (>30d)"
                count={cleanup.stalePendingFriendRequests}
              />
              <CleanupRow
                label="Stale rejected friend requests (>90d)"
                count={cleanup.staleRejectedFriendRequests}
              />
              <CleanupRow
                label="Revoked or expired group invitations"
                count={cleanup.revokedOrExpiredGroupInvitations}
              />
              <CleanupRow
                label="Expired group bans (ready to lift)"
                count={cleanup.expiredGroupBans}
              />
            </ul>
          )}
        </SectionCard>
      </section>

      {/* --- recent activity --- */}
      <SectionCard
        title="Recent activity (last 48h)"
        description="Union of new users, pools, wishlist items, and friendships."
      >
        {activity.length === 0 ? (
          <EmptyRow>
            <LuClock className="mr-1 inline h-4 w-4" />
            Nothing in the last 48 hours.
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-border/60">
            {activity.map((row) => (
              <li
                key={`${row.kind}-${row.id}`}
                className="flex items-start justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="mr-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <LuActivity className="mr-1 h-3 w-3" />
                    {row.kind.replace('_', ' ')}
                  </span>
                  <span className="font-medium">
                    {row.actor?.name ?? row.actor?.username ?? 'unknown'}
                  </span>{' '}
                  <span className="text-muted-foreground">{row.subject}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(row.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Wishlist disk usage and LiteFS instance info live on the{' '}
        <Link to="/admin/ops" className="underline hover:text-foreground">
          Ops
        </Link>{' '}
        tab.
      </p>
    </div>
  );
};

const CleanupRow = ({ label, count }: { label: string; count: number }) => {
  if (count === 0) return null;
  return (
    <li className="flex items-center justify-between py-1.5">
      <span>{label}</span>
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
        {count.toLocaleString()}
      </span>
    </li>
  );
};

export default AdminIndexRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
