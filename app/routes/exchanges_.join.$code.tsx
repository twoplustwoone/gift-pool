// NOTE the `exchanges_.` break-out filename: this route must NOT nest under
// the auth-gated /exchanges layout. Most people following a standalone invite
// have no account yet, so they see the invitation — and the dead-link state —
// before being asked to sign up. The join POST still requires auth.
import {
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  InviteLanding,
  InviteLandingInvalid,
} from '#app/components/invite-landing.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import { OCCASION_TYPE_LABELS } from '#app/utils/pool-constants.ts';
import { formatExchangeDate } from '#app/components/exchanges/exchange-copy.ts';
import {
  getExchangeInvite,
  joinExchangeByCode,
} from '#app/utils/exchanges.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { code } = params;
  if (!code) return redirect('/exchanges');

  // Funnel entry, fired BEFORE any gate so anonymous landings — the drop-off
  // worth measuring — are counted, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const userId = await getUserId(request);
  const invite = await getExchangeInvite(code);

  queueLogEvent({
    name: 'invite_landed',
    userId,
    source: 'server',
    requestId,
    visitorId,
    properties: {
      inviteType: 'exchange',
      valid: invite !== null,
      ...(invite ? { exchangeId: invite.exchangeId } : {}),
    },
  });

  if (!invite) return { kind: 'invalid' as const };

  return {
    kind: 'ok' as const,
    title: invite.title,
    occasionLabel: OCCASION_TYPE_LABELS[invite.occasionType],
    eventLabel: formatExchangeDate(invite.eventDate),
    organizerName: invite.organizer.name ?? invite.organizer.username,
    participantCount: invite.participantCount,
    isAuthenticated: userId != null,
  };
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { code } = params;
  if (!code) return redirect('/exchanges');

  const userId = await requireUserId(request);
  const result = await joinExchangeByCode({ code, userId });

  // The link went dead between the page loading and this POST — names drawn,
  // or the organizer replaced it. Same one state as every other dead cause.
  if (result.status === 'INVALID') return { kind: 'invalid' as const };

  if (result.status === 'ALREADY_IN') {
    return redirect(`/exchanges/${result.exchangeId}`);
  }

  return redirectWithToast(`/exchanges/${result.exchangeId}`, {
    type: 'success',
    title: "You're in",
    description: 'Names get drawn once everyone has answered.',
  });
}

const JoinExchangePage = () => {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.kind === 'invalid') {
    // Expired, revoked, already drawn and never-existed all land here, and
    // the copy lists the possibilities rather than picking one: naming
    // "already drawn" would confirm the exchange exists (board §12).
    return (
      <InviteLandingInvalid message="The link may have expired, been replaced, or the names may already have been drawn. Ask whoever sent it for a new one." />
    );
  }
  const {
    title,
    occasionLabel,
    eventLabel,
    organizerName,
    participantCount,
    isAuthenticated,
  } = loaderData;

  return (
    <InviteLanding
      title="You're invited to a gift exchange 🎁"
      isAuthenticated={isAuthenticated}
      acceptLabel="Join the exchange"
      cancelTo="/exchanges"
    >
      <p>
        <span className="font-semibold text-foreground">{title}</span>
      </p>
      <p>
        {occasionLabel} · {eventLabel} · organized by {organizerName}
      </p>
      <p>
        Everyone draws one person and gives to them in secret.{' '}
        {participantCount === 1
          ? 'You would be the second person in.'
          : `${participantCount} people are in so far.`}
      </p>
    </InviteLanding>
  );
};

export default JoinExchangePage;
