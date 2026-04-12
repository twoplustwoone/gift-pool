import { invariantResponse } from '@epic-web/invariant';
import {
  Link,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { DLRow, EmptyRow, SectionCard } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { getAdminPoolDetail } from '#app/utils/admin.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';
import { logPoolActivity } from '#app/utils/pool-activity.server.ts';
import {
  POOL_ACTIVITY_TYPE,
  POOL_STATUS_LABELS,
  OCCASION_TYPE_LABELS,
} from '#app/utils/pool-constants.ts';
import { cancelPool } from '#app/utils/pool.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const poolId = params.poolId;
  invariantResponse(typeof poolId === 'string', 'poolId required', {
    status: 400,
  });
  const pool = await getAdminPoolDetail(poolId);
  invariantResponse(pool, 'Pool not found', { status: 404 });
  return { pool };
}

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function action({
  params,
  request,
}: ActionFunctionArgs): Promise<ActionResult> {
  const actingUserId = await requireUserWithRole(request, 'admin');
  const poolId = params.poolId;
  invariantResponse(typeof poolId === 'string', 'poolId required', {
    status: 400,
  });

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'cancel_pool') {
    await cancelPool(poolId, actingUserId);
    await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.POOL_CANCELLED, {
      actorId: actingUserId,
      payload: { source: 'admin' },
    });
    return { ok: true, message: 'Pool cancelled by admin.' };
  }

  return { ok: false, message: `Unknown intent: ${typeof intent === 'string' ? intent : ''}` };
}

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString();

const formatDateTime = (date: Date | string) =>
  new Date(date).toLocaleString();

const formatCents = (cents: number | null) => {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
};

const PoolDetailRoute = () => {
  const { pool } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isCancellable =
    pool.status !== 'CANCELLED' && pool.status !== 'DELIVERED';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/pools"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to pools
          </Link>
          <h1 className="text-h1">{pool.title}</h1>
          <p className="text-muted-foreground">
            {POOL_STATUS_LABELS[pool.status]} ·{' '}
            {OCCASION_TYPE_LABELS[pool.occasionType as keyof typeof OCCASION_TYPE_LABELS] ?? pool.occasionType}
            {pool.eventDate
              ? ` · event ${formatDate(pool.eventDate)}`
              : null}
          </p>
        </div>
      </div>

      {fetcher.data ? (
        <div
          className={
            fetcher.data.ok
              ? 'rounded-md border border-emerald-400/50 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200'
              : 'rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive'
          }
        >
          {fetcher.data.message}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {/* --- meta --- */}
        <SectionCard title="Details">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <DLRow label="ID" value={pool.id} mono />
            <DLRow label="Created" value={formatDate(pool.createdAt)} />
            <DLRow label="Decision mode" value={pool.decisionMode} />
            <DLRow label="Organizer" value={pool.organizer.username} />
            <DLRow
              label="Purchaser"
              value={pool.purchaser?.username ?? '—'}
            />
            <DLRow
              label="Deliverer"
              value={pool.deliverer?.username ?? '—'}
            />
            <DLRow
              label="Recipient"
              value={
                pool.recipientUser?.username ?? pool.recipientName ?? '—'
              }
            />
            <DLRow label="Invite code" value={pool.inviteCode ?? '—'} />
            <DLRow
              label="Final price"
              value={formatCents(pool.finalPriceCents)}
            />
            <DLRow
              label="Chosen idea"
              value={pool.chosenIdeaId ?? '—'}
              mono
            />
          </dl>
        </SectionCard>

        {/* --- contributors --- */}
        <SectionCard
          title={`Contributors (${pool.contributors.length})`}
        >
          {pool.contributors.length === 0 ? (
            <EmptyRow>No contributors yet.</EmptyRow>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/50">
              <table className="min-w-full divide-y divide-border/60 text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase text-muted-foreground">
                      User
                    </th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium uppercase text-muted-foreground">
                      Budget
                    </th>
                    <th className="px-3 py-1.5 text-center text-xs font-medium uppercase text-muted-foreground">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pool.contributors.map((c) => (
                    <tr key={c.userId}>
                      <td className="px-3 py-1.5 font-medium">
                        {c.name ?? c.username}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCents(c.contributionCents)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={cn(
                            'inline-block rounded px-1.5 py-0.5 text-xs font-semibold',
                            c.hasPaid
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                          )}
                        >
                          {c.hasPaid ? 'paid' : 'unpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* --- ideas --- */}
        <SectionCard title={`Ideas (${pool.ideas.length})`}>
          {pool.ideas.length === 0 ? (
            <EmptyRow>No ideas proposed yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {pool.ideas.map((idea) => (
                <li
                  key={idea.id}
                  className={cn(
                    'flex items-center justify-between py-2',
                    idea.id === pool.chosenIdeaId &&
                      'rounded bg-emerald-50/60 px-2 dark:bg-emerald-950/20',
                  )}
                >
                  <div>
                    <span className="font-medium">{idea.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      by {idea.proposedBy.username}
                    </span>
                    {idea.id === pool.chosenIdeaId ? (
                      <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        chosen
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatCents(idea.estimatedPriceCents)}</span>
                    <span>{idea.voteCount} {idea.voteCount === 1 ? 'vote' : 'votes'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* --- cancel action --- */}
        <SectionCard
          title="Admin actions"
          description="Only pool cancellation is exposed. Other transitions should go through the normal flow."
        >
          {isCancellable ? (
            <ConfirmDialog
              title="Cancel this pool"
              description="This will mark the pool as CANCELLED. Contributors will see the status change on their next visit. This action cannot be undone from the admin UI."
              confirmText="Cancel pool"
              requireText={pool.title}
              onConfirm={() => {
                const form = new FormData();
                form.append('intent', 'cancel_pool');
                void fetcher.submit(form, { method: 'POST' });
              }}
            >
              <Button variant="destructive" size="sm">
                Cancel pool
              </Button>
            </ConfirmDialog>
          ) : (
            <p className="text-sm text-muted-foreground">
              This pool is{' '}
              <strong>
                {POOL_STATUS_LABELS[pool.status]}
              </strong>{' '}
              — no admin actions available.
            </p>
          )}
        </SectionCard>
      </section>

      {/* --- activity timeline --- */}
      <SectionCard
        title={`Activity timeline (${pool.activities.length})`}
        description="Last 50 PoolActivity rows, newest first."
      >
        {pool.activities.length === 0 ? (
          <EmptyRow>No activity recorded.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border/60">
            {pool.activities.map((activity) => (
              <li
                key={activity.id}
                className="flex items-start justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="mr-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {activity.type}
                  </span>
                  {activity.actorId ? (
                    <span className="text-xs text-muted-foreground">
                      actor: {activity.actorId.slice(0, 12)}…
                    </span>
                  ) : null}
                  {activity.payload ? (
                    <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {activity.payload}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(activity.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

export default PoolDetailRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
