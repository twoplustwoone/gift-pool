import {
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import {
  InviteLanding,
  InviteLandingInvalid,
} from '#app/components/invite-landing.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  POOL_STATUS,
  OCCASION_TYPE_LABELS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import { addContributor, isUserInPool } from '#app/utils/pool.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

async function requireValidInvite(code: string) {
  const pool = await prisma.pool.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      title: true,
      occasionType: true,
      status: true,
      recipientUserId: true,
      recipientName: true,
      recipientUser: { select: { name: true, username: true } },
      _count: { select: { contributors: true } },
    },
  });

  if (!pool) {
    throw new Response('Not Found', { status: 404 });
  }

  if (
    pool.status === POOL_STATUS.CANCELLED ||
    pool.status === POOL_STATUS.DELIVERED
  ) {
    throw data({ error: 'This pool is no longer active.' }, { status: 410 });
  }

  return pool;
}

// NOTE the `pools_.` break-out filename: this route must NOT nest under the
// auth-gated /pools layout — anonymous invite recipients need to see the
// invitation context (and dead-link state) before being asked to sign up.
// The join POST still requires auth.
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { code } = params;
  if (!code) return redirect('/pools');

  // Funnel entry: fired before any gate so anonymous landings (the
  // drop-off we want to measure) are captured, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const userId = await getUserId(request);
  let pool;
  try {
    pool = await requireValidInvite(code);
  } catch (error) {
    if (error instanceof Response && error.status < 500) {
      queueLogEvent({
        name: 'invite_landed',
        userId,
        source: 'server',
        requestId,
        visitorId,
        properties: { inviteType: 'pool', valid: false },
      });
      return { kind: 'invalid' as const };
    }
    throw error;
  }
  queueLogEvent({
    name: 'invite_landed',
    userId,
    source: 'server',
    requestId,
    visitorId,
    properties: { inviteType: 'pool', valid: true, poolId: pool.id },
  });

  // Privacy: if a logged-in viewer is the recipient, 404 — indistinguishable
  // from an invalid code. A redirect would be a signal that the code is
  // valid. (Anonymous viewers can't be identified; an invite link in the
  // recipient's hands is already a leak by whoever shared it.)
  if (userId && pool.recipientUserId === userId) {
    throw new Response('Not Found', { status: 404 });
  }

  // Already a contributor — just send them to the pool
  if (userId && (await isUserInPool(userId, pool.id))) {
    return redirect(`/pools/${pool.id}`);
  }

  const recipientLabel =
    pool.recipientName ??
    pool.recipientUser?.name ??
    pool.recipientUser?.username ??
    'someone special';

  return {
    kind: 'ok' as const,
    poolTitle: pool.title,
    occasionType: pool.occasionType as OccasionType,
    recipientLabel,
    contributorCount: pool._count.contributors,
    isAuthenticated: userId != null,
  };
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { code } = params;
  if (!code) return redirect('/pools');

  const userId = await requireUserId(request);
  const pool = await requireValidInvite(code);

  // Privacy: recipient must never be added as a contributor to their own pool.
  if (pool.recipientUserId === userId) {
    throw new Response('Not Found', { status: 404 });
  }

  const alreadyIn = await isUserInPool(userId, pool.id);
  if (!alreadyIn) {
    // addContributor (not a bare poolContributor.create) so the join shows
    // up in the pool activity feed and fires pool_contributor_joined.
    await addContributor(pool.id, userId);
  }

  return redirectWithToast(`/pools/${pool.id}`, {
    type: 'success',
    description: `You've joined the pool — welcome!`,
  });
}

const JoinPoolPage = () => {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.kind === 'invalid') {
    return <InviteLandingInvalid />;
  }
  const {
    poolTitle,
    occasionType,
    recipientLabel,
    contributorCount,
    isAuthenticated,
  } = loaderData;

  return (
    <InviteLanding
      title="You're invited to a pool 🎁"
      isAuthenticated={isAuthenticated}
      acceptLabel="Join pool"
      cancelTo="/pools"
    >
      <p>
        <span className="font-semibold text-foreground">{poolTitle}</span>
      </p>
      <p>
        {OCCASION_TYPE_LABELS[occasionType]} for{' '}
        <span className="font-medium text-foreground">{recipientLabel}</span>
      </p>
      <p>
        {contributorCount}{' '}
        {contributorCount === 1 ? 'contributor' : 'contributors'} so far
      </p>
    </InviteLanding>
  );
};

export default JoinPoolPage;
