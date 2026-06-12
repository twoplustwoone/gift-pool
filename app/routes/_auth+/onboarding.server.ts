import { invariant } from '@epic-web/invariant';
import { redirect } from 'react-router';
import { verifySessionStorage } from '#app/utils/verification.server.ts';
import { onboardingEmailSessionKey } from './onboarding.tsx';
import { type VerifyFunctionArgs } from './verify.server.ts';

export async function handleVerification({ submission }: VerifyFunctionArgs) {
  invariant(
    submission.status === 'success',
    'Submission should be successful by now',
  );
  const verifySession = await verifySessionStorage.getSession();
  verifySession.set(onboardingEmailSessionKey, submission.value.target);
  // Forward the original intent (invite page, /wishlist, …) so the
  // onboarding form's hidden redirectTo field picks it up and the user
  // lands where they meant to go instead of the dashboard.
  const redirectTo = submission.value.redirectTo as string | undefined;
  const onboardingUrl = redirectTo
    ? `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`
    : '/onboarding';
  return redirect(onboardingUrl, {
    headers: {
      'set-cookie': await verifySessionStorage.commitSession(verifySession),
    },
  });
}
