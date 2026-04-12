import { invariantResponse } from '@epic-web/invariant';
import { LuDatabase, LuHardDrive } from 'react-icons/lu';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { EmptyRow, SectionCard, SummaryCard } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  expireGroupBans,
  getCleanupPreviewCounts,
  getDiskUsageCounts,
  purgeDeadGroupInvitations,
  purgeExpiredSessions,
  purgeExpiredVerifications,
  purgeStaleFriendRequests,
  type CleanupPreviewCounts,
} from '#app/utils/admin.server.ts';
import { getAllInstances, getInstanceInfo } from '#app/utils/litefs.server.ts';
import { useDoubleCheck } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

type Intent =
  | 'purge_verifications'
  | 'purge_sessions'
  | 'purge_friend_requests'
  | 'purge_group_invitations'
  | 'expire_group_bans';

const INTENTS: ReadonlySet<string> = new Set<Intent>([
  'purge_verifications',
  'purge_sessions',
  'purge_friend_requests',
  'purge_group_invitations',
  'expire_group_bans',
]);

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');

  const [cleanup, disk, instances, instanceInfo] = await Promise.all([
    getCleanupPreviewCounts(),
    getDiskUsageCounts(),
    getAllInstances(),
    getInstanceInfo(),
  ]);

  return { cleanup, disk, instances, instanceInfo };
}

type ActionResult =
  | { ok: true; intent: Intent; changed: number }
  | { ok: false; message: string };

export async function action({
  request,
}: ActionFunctionArgs): Promise<ActionResult | Response> {
  await requireUserWithRole(request, 'admin');

  const formData = await request.formData();
  const intent = formData.get('intent');
  invariantResponse(
    typeof intent === 'string' && INTENTS.has(intent),
    'Invalid intent',
    { status: 400 },
  );

  try {
    let changed = 0;
    switch (intent as Intent) {
      case 'purge_verifications': {
        const result = await purgeExpiredVerifications();
        changed = result.deleted;
        break;
      }
      case 'purge_sessions': {
        const result = await purgeExpiredSessions();
        changed = result.deleted;
        break;
      }
      case 'purge_friend_requests': {
        const result = await purgeStaleFriendRequests();
        changed = result.deleted;
        break;
      }
      case 'purge_group_invitations': {
        const result = await purgeDeadGroupInvitations();
        changed = result.deleted;
        break;
      }
      case 'expire_group_bans': {
        const result = await expireGroupBans();
        changed = result.updated;
        break;
      }
    }
    // LiteFS replica forwarding note: the write above was forwarded to the
    // primary (if we're on a replica). The loader revalidation below reads
    // the local replica, which may briefly lag — the loader hits lruCache
    // anyway, so the next page render will show the post-purge count after
    // invalidateCleanupPreviewCache() runs in the helper.
    return redirect(`/admin/ops?just=${intent}&n=${changed}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    return { ok: false, message };
  }
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const INTENT_LABEL: Record<Intent, string> = {
  purge_verifications: 'Expired verification rows',
  purge_sessions: 'Expired sessions',
  purge_friend_requests: 'Stale friend requests',
  purge_group_invitations: 'Dead group invitations',
  expire_group_bans: 'Expired group bans',
};

type CleanupJobConfig = {
  intent: Intent;
  title: string;
  description: string;
  countKey: keyof CleanupPreviewCounts;
  secondaryCountKey?: keyof CleanupPreviewCounts;
  verb: 'Delete' | 'Lift';
};

const JOBS: ReadonlyArray<CleanupJobConfig> = [
  {
    intent: 'purge_verifications',
    title: 'Expired verifications',
    description:
      '2FA setup / password reset / email change OTPs past their expiry.',
    countKey: 'expiredVerifications',
    verb: 'Delete',
  },
  {
    intent: 'purge_sessions',
    title: 'Expired sessions',
    description:
      'Session rows whose expiration has passed. Prisma does not auto-expire.',
    countKey: 'expiredSessions',
    verb: 'Delete',
  },
  {
    intent: 'purge_friend_requests',
    title: 'Stale friend requests',
    description:
      'PENDING older than 30 days or REJECTED older than 90 days.',
    countKey: 'stalePendingFriendRequests',
    secondaryCountKey: 'staleRejectedFriendRequests',
    verb: 'Delete',
  },
  {
    intent: 'purge_group_invitations',
    title: 'Dead group invitations',
    description:
      'Revoked or expired invite links with zero uses. Used links stay for history.',
    countKey: 'revokedOrExpiredGroupInvitations',
    verb: 'Delete',
  },
  {
    intent: 'expire_group_bans',
    title: 'Expired group bans',
    description: 'Lift group bans whose bannedUntil is already in the past.',
    countKey: 'expiredGroupBans',
    verb: 'Lift',
  },
];

const OpsRoute = () => {
  const { cleanup, disk, instances, instanceInfo } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionError =
    actionData && 'ok' in actionData && !actionData.ok
      ? actionData.message
      : null;

  const [searchParams] = useSearchParams();
  const justIntentParam = searchParams.get('just');
  const justIntent =
    justIntentParam && INTENTS.has(justIntentParam)
      ? (justIntentParam as Intent)
      : null;
  const justCount = Number(searchParams.get('n') ?? 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Ops</h1>
        <p className="text-muted-foreground">
          Cleanup jobs, disk usage, and LiteFS instance info. All purges are
          idempotent — running them twice is safe.
        </p>
      </div>

      {actionError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}
      {justIntent ? (
        <div className="rounded-md border border-emerald-400/50 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
          {INTENT_LABEL[justIntent]}: {justCount}{' '}
          {justCount === 1 ? 'row' : 'rows'}{' '}
          {justIntent === 'expire_group_bans' ? 'lifted' : 'deleted'}.
        </div>
      ) : null}

      {/* --- cleanup jobs --- */}
      <section className="space-y-4">
        <h2 className="text-h2">Cleanup queue</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {JOBS.map((job) => (
            <CleanupJobCard key={job.intent} job={job} cleanup={cleanup} />
          ))}
        </div>
      </section>

      {/* --- disk usage --- */}
      <section className="space-y-4">
        <h2 className="text-h2">Disk usage</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Wishlist items"
            value={disk.wishlistItemTotal}
            delta={`${disk.wishlistItemsWithImage} with inline image`}
          />
          <SummaryCard
            label="Wishlist image bytes"
            value={formatBytes(disk.wishlistImageBytes)}
            tone={
              disk.wishlistImageBytes > 500 * 1024 * 1024 ? 'warn' : 'default'
            }
            delta="WishlistItem.image is inlined in SQLite"
          />
          <SummaryCard
            label="Average image size"
            value={
              disk.wishlistItemsWithImage > 0
                ? formatBytes(
                    disk.wishlistImageBytes / disk.wishlistItemsWithImage,
                  )
                : '—'
            }
          />
        </div>
      </section>

      {/* --- instance info --- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="LiteFS instances"
          description="Current instance routing. Writes forward to the primary."
        >
          {Object.entries(instances).length === 0 ? (
            <EmptyRow>Single-instance mode.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {Object.entries(instances).map(([inst, region]) => {
                const isCurrent = inst === instanceInfo.currentInstance;
                const isPrimary = inst === instanceInfo.primaryInstance;
                return (
                  <li
                    key={inst}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="font-mono">
                      {inst} <span className="text-muted-foreground">({region})</span>
                    </span>
                    <span className="flex gap-1 text-xs">
                      {isCurrent ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          current
                        </span>
                      ) : null}
                      {isPrimary ? (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                          primary
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Cache inspector"
          description="Search / delete LRU + SQLite cache entries."
          action={
            <Link
              to="/admin/cache"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open →
            </Link>
          }
        >
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            <LuDatabase className="h-5 w-5 shrink-0" />
            <p>
              The cache inspector is still at <code>/admin/cache</code>. It
              shows the SQLite-backed cache (LiteFS-replicated) and the
              in-memory LRU cache (instance-local).
            </p>
          </div>
        </SectionCard>
      </section>
    </div>
  );
};

const CleanupJobCard = ({
  job,
  cleanup,
}: {
  job: CleanupJobConfig;
  cleanup: CleanupPreviewCounts;
}) => {
  const dc = useDoubleCheck();
  const primary = cleanup[job.countKey];
  const secondary = job.secondaryCountKey ? cleanup[job.secondaryCountKey] : 0;
  const total = primary + secondary;
  const isEmpty = total === 0;

  let buttonLabel: string;
  if (isEmpty) {
    buttonLabel = 'Nothing to do';
  } else if (dc.doubleCheck) {
    buttonLabel = 'Click again to confirm';
  } else {
    buttonLabel = `${job.verb} ${total.toLocaleString()}`;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LuHardDrive className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">{job.title}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{job.description}</p>
        </div>
        <span
          className={
            isEmpty
              ? 'rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground'
              : 'rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300'
          }
        >
          {total.toLocaleString()}
        </span>
      </div>
      <Form method="POST" className="mt-3">
        <input type="hidden" name="intent" value={job.intent} />
        <Button
          variant={isEmpty ? 'secondary' : 'default'}
          size="sm"
          disabled={isEmpty}
          {...dc.getButtonProps({ type: 'submit' })}
        >
          {buttonLabel}
        </Button>
      </Form>
    </div>
  );
};

export default OpsRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
