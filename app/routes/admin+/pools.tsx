import {
  Link,
  NavLink,
  type LoaderFunctionArgs,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { EmptyRow, SectionCard } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { listAdminPools } from '#app/utils/admin.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';
import {
  POOL_STATUS,
  POOL_STATUS_LABELS,
  OCCASION_TYPE_LABELS,
  type PoolStatus,
} from '#app/utils/pool-constants.ts';

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'stuck', label: 'Stuck' },
  { value: 'all', label: 'All' },
  ...Object.values(POOL_STATUS).map((s) => ({
    value: s,
    label: POOL_STATUS_LABELS[s],
  })),
];

const PAGE_SIZE = 25;

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'stuck';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  const stuckOnly = statusParam === 'stuck';
  const status = stuckOnly
    ? undefined
    : (statusParam as PoolStatus | 'all');

  const { pools, total } = await listAdminPools({
    status,
    stuckOnly,
    limit: PAGE_SIZE,
    offset,
  });

  return { pools, total, statusParam, page, pageSize: PAGE_SIZE };
}

const formatRelative = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
};

const PoolsRoute = () => {
  const { pools, total, statusParam, page, pageSize } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Pools</h1>
        <p className="text-muted-foreground">
          Health board — default view is stuck pools. Filter by status or view
          all.
        </p>
      </div>

      {/* --- status tabs --- */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted p-1">
        {STATUS_TABS.map((tab) => (
          <NavLink
            key={tab.value}
            to={`/admin/pools?status=${tab.value}`}
            className={cn(
              'px-3 py-1.5 text-sm font-medium text-muted-foreground',
              'rounded-lg transition-colors',
              statusParam === tab.value &&
                'bg-background text-foreground shadow',
            )}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* --- pool table --- */}
      <SectionCard
        title={
          statusParam === 'stuck'
            ? `Stuck pools (${total})`
            : `Pools — ${statusParam === 'all' ? 'all' : POOL_STATUS_LABELS[statusParam as PoolStatus] ?? statusParam} (${total})`
        }
      >
        {pools.length === 0 ? (
          <EmptyRow>
            {statusParam === 'stuck'
              ? 'No stuck pools. Everything is moving along.'
              : 'No pools match this filter.'}
          </EmptyRow>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pool
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Occasion
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contributors
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Last activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {pools.map((pool) => {
                  const isOverdue =
                    pool.eventDate &&
                    new Date(pool.eventDate).getTime() < Date.now() &&
                    pool.status !== 'DELIVERED' &&
                    pool.status !== 'CANCELLED';
                  return (
                    <tr
                      key={pool.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-2">
                        <Link
                          to={`/admin/pools/${pool.id}`}
                          className="group flex flex-col"
                        >
                          <span className="text-sm font-semibold group-hover:underline">
                            {pool.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            organizer: {pool.organizer.username}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={pool.status} />
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {OCCASION_TYPE_LABELS[pool.occasionType as keyof typeof OCCASION_TYPE_LABELS] ?? pool.occasionType}
                        {isOverdue ? (
                          <span className="ml-1 text-xs font-semibold text-destructive">
                            overdue
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right text-sm tabular-nums">
                        {pool.contributorCount}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {formatRelative(pool.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  to={`/admin/pools?status=${statusParam}&page=${page - 1}`}
                  className="rounded-md bg-muted px-3 py-1 font-medium hover:bg-accent"
                >
                  ← Prev
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  to={`/admin/pools?status=${statusParam}&page=${page + 1}`}
                  className="rounded-md bg-muted px-3 py-1 font-medium hover:bg-accent"
                >
                  Next →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
};

const StatusBadge = ({ status }: { status: PoolStatus }) => {
  const colorMap: Record<PoolStatus, string> = {
    OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    VOTING:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    DECIDED:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    PURCHASED:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    DELIVERED:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    CANCELLED:
      'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
  };
  return (
    <span
      className={cn(
        'inline-block rounded-md px-2 py-0.5 text-xs font-semibold',
        colorMap[status],
      )}
    >
      {POOL_STATUS_LABELS[status]}
    </span>
  );
};

export default PoolsRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
