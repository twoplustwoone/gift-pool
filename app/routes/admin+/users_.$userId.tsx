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
import {
  AdminRoleError,
  getAdminUserDetail,
  revokeAllSessionsForUser,
  toggleAdminRole,
} from '#app/utils/admin.server.ts';
import { useDoubleCheck } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const userId = params.userId;
  invariantResponse(typeof userId === 'string', 'userId required', {
    status: 400,
  });
  const user = await getAdminUserDetail(userId);
  invariantResponse(user, 'User not found', { status: 404 });
  return { user };
}

type ActionResult =
  | { ok: true; intent: 'toggle_admin' | 'revoke_sessions'; message: string }
  | { ok: false; message: string };

export async function action({
  params,
  request,
}: ActionFunctionArgs): Promise<ActionResult> {
  const actingUserId = await requireUserWithRole(request, 'admin');
  const userId = params.userId;
  invariantResponse(typeof userId === 'string', 'userId required', {
    status: 400,
  });

  const formData = await request.formData();
  const rawIntent = formData.get('intent');
  const intent = typeof rawIntent === 'string' ? rawIntent : '';

  try {
    if (intent === 'toggle_admin') {
      const target = formData.get('target');
      invariantResponse(
        target === 'grant' || target === 'revoke',
        'invalid target',
        { status: 400 },
      );
      await toggleAdminRole({
        targetUserId: userId,
        actingUserId,
        intent: target,
      });
      return {
        ok: true,
        intent: 'toggle_admin',
        message:
          target === 'grant' ? 'Granted admin role.' : 'Revoked admin role.',
      };
    }

    if (intent === 'revoke_sessions') {
      const result = await revokeAllSessionsForUser({
        targetUserId: userId,
        actingUserId,
      });
      return {
        ok: true,
        intent: 'revoke_sessions',
        message: `Deleted ${result.sessionsDeleted} session(s) and ${result.verificationsDeleted} verification(s).`,
      };
    }

    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (err) {
    if (err instanceof AdminRoleError) {
      let message: string;
      if (err.code === 'CANNOT_DEMOTE_SELF') {
        message = 'You cannot revoke your own admin role.';
      } else if (err.code === 'LAST_ADMIN') {
        message =
          'Cannot revoke the last admin. Grant admin to another user first.';
      } else {
        message = 'User not found.';
      }
      return { ok: false, message };
    }
    throw err;
  }
}

const formatDate = (date: Date | string) => new Date(date).toLocaleDateString();

const formatDateTime = (date: Date | string) => new Date(date).toLocaleString();

const AdminUserDetailRoute = () => {
  const { user } = useLoaderData<typeof loader>();
  const toggleFetcher = useFetcher<typeof action>();
  const revokeFetcher = useFetcher<typeof action>();

  const isAdmin = user.roles.some((r) => r.name === 'admin');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/users"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to users
          </Link>
          <h1 className="text-xl font-semibold">
            {user.name ?? user.username}
          </h1>
          <p className="text-muted-foreground">
            @{user.username} · {user.email}
          </p>
        </div>
      </div>

      {toggleFetcher.data ? <ActionBanner data={toggleFetcher.data} /> : null}
      {revokeFetcher.data ? <ActionBanner data={revokeFetcher.data} /> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {/* --- profile --- */}
        <SectionCard
          title="Profile"
          description="Basic identity fields from the User row."
        >
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <DLRow label="ID" value={user.id} mono />
            <DLRow label="Signed up" value={formatDate(user.createdAt)} />
            <DLRow
              label="Birthday"
              value={user.birthday ? formatDate(user.birthday) : '—'}
            />
            <DLRow label="Bio" value={user.bio ?? '—'} />
          </dl>
        </SectionCard>

        {/* --- roles --- */}
        <SectionCard
          title="Roles"
          description="Admin-only users can access /admin."
        >
          <div className="flex flex-wrap gap-2">
            {user.roles.length === 0 ? (
              <EmptyRow>No roles assigned.</EmptyRow>
            ) : (
              user.roles.map((role) => (
                <span
                  key={role.name}
                  className={
                    role.name === 'admin'
                      ? 'rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary'
                      : 'rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground'
                  }
                >
                  {role.name}
                </span>
              ))
            )}
          </div>
          <div className="mt-4">
            <RoleToggleButton
              isAdmin={isAdmin}
              username={user.username}
              onConfirm={(target) => {
                const form = new FormData();
                form.append('intent', 'toggle_admin');
                form.append('target', target);
                void toggleFetcher.submit(form, { method: 'POST' });
              }}
            />
          </div>
        </SectionCard>

        {/* --- sessions --- */}
        <SectionCard
          title="Sessions"
          description="Active sessions for this user. Revoking also purges outstanding verification OTPs."
        >
          {user.sessions.length === 0 ? (
            <EmptyRow>No active sessions.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {user.sessions.slice(0, 5).map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="font-mono text-xs">
                    {session.id.slice(0, 12)}…
                  </span>
                  <span className="text-xs text-muted-foreground">
                    expires {formatDate(session.expirationDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <SessionRevokeButton
              disabled={user.sessions.length === 0}
              onConfirm={() => {
                const form = new FormData();
                form.append('intent', 'revoke_sessions');
                void revokeFetcher.submit(form, { method: 'POST' });
              }}
            />
          </div>
        </SectionCard>

        {/* --- gifting activity --- */}
        <SectionCard
          title="Gifting activity"
          description="Roles across the Pool model."
        >
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <DLRow
              label="Pools organized"
              value={user.counts.poolsOrganized.toString()}
            />
            <DLRow
              label="As purchaser"
              value={user.counts.poolsAsPurchaser.toString()}
            />
            <DLRow
              label="As deliverer"
              value={user.counts.poolsAsDeliverer.toString()}
            />
            <DLRow
              label="As recipient"
              value={user.counts.poolsAsRecipient.toString()}
            />
            <DLRow
              label="Total contributions"
              value={user.counts.poolContributions.toString()}
            />
            <DLRow
              label="Paid / Unpaid"
              value={`${user.poolContributorStats.paid} paid · ${user.poolContributorStats.unpaid} unpaid`}
            />
          </dl>
        </SectionCard>

        {/* --- wishlist --- */}
        <SectionCard title="Wishlist" description="Items owned by this user.">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <DLRow label="Items" value={user.counts.wishlistItems.toString()} />
            <DLRow
              label="View public profile"
              value={
                <Link
                  to={`/users/${user.username}`}
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  /users/{user.username} ↗
                </Link>
              }
            />
          </dl>
        </SectionCard>

        {/* --- friendships --- */}
        <SectionCard title="Friendships">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <DLRow
              label="Total friendships"
              value={user.counts.friendships.toString()}
            />
            <DLRow
              label="Unread notifications"
              value={user.counts.unreadNotifications.toString()}
            />
          </dl>
        </SectionCard>
      </section>

      {/* --- notification prefs --- */}
      <SectionCard
        title="Notification preferences"
        description="Effective per-type choices after global, category, topic, and catalog inheritance."
      >
        {user.notificationPreferences.length === 0 ? (
          <EmptyRow>No preferences recorded (using defaults).</EmptyRow>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60 text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    In-app
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {user.notificationPreferences.map((pref) => (
                  <tr key={pref.type}>
                    <td className="px-4 py-2 font-medium">
                      {pref.type.replaceAll('_', ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {pref.inAppEnabled ? '✓' : '✗'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {pref.emailEnabled ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* --- recent events --- */}
      <SectionCard
        title="Recent events"
        description="Last 20 analytics events recorded for this user."
      >
        {user.recentEvents.length === 0 ? (
          <EmptyRow>No events recorded.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border/60">
            {user.recentEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="mr-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {event.source}
                  </span>
                  <span className="font-medium">{event.name}</span>
                  {event.properties ? (
                    <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {event.properties}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const ActionBanner = ({ data }: { data: ActionResult }) => (
  <div
    className={
      data.ok
        ? 'rounded-md border border-emerald-400/50 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200'
        : 'rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive'
    }
  >
    {data.message}
  </div>
);

const RoleToggleButton = ({
  isAdmin,
  username,
  onConfirm,
}: {
  isAdmin: boolean;
  username: string;
  onConfirm: (target: 'grant' | 'revoke') => void;
}) => {
  if (isAdmin) {
    return (
      <ConfirmDialog
        title="Revoke admin role"
        description={
          <span>
            Type the username <strong>{username}</strong> to confirm. The user
            will lose access to /admin on their next request.
          </span>
        }
        confirmText="Revoke admin"
        requireText={username}
        onConfirm={() => {
          onConfirm('revoke');
        }}
      >
        <Button variant="destructive" size="sm">
          Revoke admin
        </Button>
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      title="Grant admin role"
      description={
        <span>
          Type the username <strong>{username}</strong> to confirm. The user
          will gain access to every page under /admin.
        </span>
      }
      confirmText="Grant admin"
      requireText={username}
      onConfirm={() => {
        onConfirm('grant');
      }}
    >
      <Button variant="default" size="sm">
        Grant admin
      </Button>
    </ConfirmDialog>
  );
};

const SessionRevokeButton = ({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) => {
  const dc = useDoubleCheck();

  let buttonLabel: string;
  if (disabled) {
    buttonLabel = 'No active sessions';
  } else if (dc.doubleCheck) {
    buttonLabel = 'Click again to revoke';
  } else {
    buttonLabel = 'Sign out all sessions';
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={disabled}
      {...dc.getButtonProps({
        onClick: (e) => {
          if (dc.doubleCheck) {
            onConfirm();
          } else {
            e.preventDefault();
          }
        },
      })}
    >
      {buttonLabel}
    </Button>
  );
};

export default AdminUserDetailRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
