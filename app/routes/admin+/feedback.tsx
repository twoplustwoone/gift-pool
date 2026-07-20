import { invariantResponse } from '@epic-web/invariant';
import {
  Form,
  Link,
  NavLink,
  data,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { EmptyRow, SectionCard } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';
import {
  getFeedbackStatusCounts,
  listAdminFeedback,
  updateFeedbackStatus,
} from '#app/utils/admin.server.ts';
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_VALUES,
  FEEDBACK_TYPE_LABELS,
  FeedbackStatusSchema,
  type FeedbackStatus,
  type FeedbackType,
} from '#app/utils/feedback-validation.ts';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

const PAGE_SIZE = 25;

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  ...FEEDBACK_STATUS_VALUES.map((s) => ({
    value: s,
    label: FEEDBACK_STATUS_LABELS[s],
  })),
];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'NEW';
  const rawPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const status =
    statusParam === 'all'
      ? 'all'
      : (FeedbackStatusSchema.safeParse(statusParam).data ?? 'NEW');

  const [{ items, total }, counts] = await Promise.all([
    listAdminFeedback({
      status,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getFeedbackStatusCounts(),
  ]);

  return { items, total, counts, statusParam, page, pageSize: PAGE_SIZE };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const formData = await request.formData();

  const feedbackId = formData.get('feedbackId');
  invariantResponse(typeof feedbackId === 'string', 'feedbackId required', {
    status: 400,
  });

  const statusResult = FeedbackStatusSchema.safeParse(formData.get('status'));
  invariantResponse(statusResult.success, 'invalid status', { status: 400 });

  const rawNotes = formData.get('adminNotes');
  const adminNotes = typeof rawNotes === 'string' ? rawNotes : undefined;

  await updateFeedbackStatus({
    feedbackId,
    status: statusResult.data,
    adminNotes,
  });

  return data({ ok: true });
}

const formatRelative = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const days = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
};

const FeedbackRoute = () => {
  const { items, total, counts, statusParam, page, pageSize } =
    useLoaderData<typeof loader>();
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="text-muted-foreground">
          User-submitted bugs, ideas, and questions. Triage by changing status
          and leaving internal notes.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted p-1">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? counts.all
              : counts[tab.value as FeedbackStatus];
          return (
            <NavLink
              key={tab.value}
              to={`/admin/feedback?status=${tab.value}`}
              className={cn(
                'px-3 py-1.5 text-sm font-medium text-muted-foreground',
                'rounded-lg transition-colors',
                statusParam === tab.value &&
                  'bg-background text-foreground shadow',
              )}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </NavLink>
          );
        })}
      </div>

      <SectionCard
        title={`${statusParam === 'all' ? 'All feedback' : FEEDBACK_STATUS_LABELS[statusParam as FeedbackStatus] ?? statusParam} (${total})`}
      >
        {items.length === 0 ? (
          <EmptyRow>Nothing here. Inbox zero.</EmptyRow>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <FeedbackCard key={item.id} item={item} />
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  to={`/admin/feedback?status=${statusParam}&page=${page - 1}`}
                  className="rounded-md bg-muted px-3 py-1 font-medium hover:bg-accent"
                >
                  ← Prev
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  to={`/admin/feedback?status=${statusParam}&page=${page + 1}`}
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

const TYPE_BADGE: Record<FeedbackType, string> = {
  BUG: 'bg-warning-muted text-warning',
  FEATURE: 'bg-success-muted text-success',
  QUESTION: 'bg-pool/15 text-pool',
};

const FeedbackCard = ({
  item,
}: {
  item: ReturnType<typeof useLoaderData<typeof loader>>['items'][number];
}) => {
  const navigation = useNavigation();
  const isSaving =
    navigation.state !== 'idle' &&
    navigation.formData?.get('feedbackId') === item.id;

  return (
    <li className="rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block rounded-md px-2 py-0.5 text-xs font-semibold',
              TYPE_BADGE[item.type as FeedbackType] ?? 'bg-muted',
            )}
          >
            {FEEDBACK_TYPE_LABELS[item.type as FeedbackType] ?? item.type}
          </span>
          <span className="text-xs text-muted-foreground">
            {item.user ? (
              <Link
                to={`/admin/users/${item.user.id}`}
                className="font-medium hover:underline"
              >
                @{item.user.username}
              </Link>
            ) : (
              (item.email ?? 'anonymous')
            )}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelative(item.createdAt)}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>

      {item.email && item.user ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Reply-to: {item.email}
        </p>
      ) : null}
      {item.pageUrl ? (
        <p className="mt-1 text-xs text-muted-foreground">
          From: {item.pageUrl}
        </p>
      ) : null}

      <Form method="POST" className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="feedbackId" value={item.id} />
        <Textarea
          name="adminNotes"
          rows={2}
          defaultValue={item.adminNotes ?? ''}
          placeholder="Internal notes (optional)…"
          className="text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor={`status-${item.id}`}>
            Status
          </label>
          <select
            id={`status-${item.id}`}
            name="status"
            defaultValue={item.status}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {FEEDBACK_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {FEEDBACK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isSaving}
            className="ml-auto"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Form>
    </li>
  );
};

export default FeedbackRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
