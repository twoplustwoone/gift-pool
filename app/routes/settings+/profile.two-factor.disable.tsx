import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { type LoaderFunctionArgs, type ActionFunctionArgs, useFetcher  } from 'react-router';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { requireRecentVerification } from '#app/routes/_auth+/verify.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { useDoubleCheck } from '#app/utils/misc.tsx';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import { SettingsSubpage } from './__settings-subpage.tsx';
import { twoFAVerificationType } from './profile.two-factor.tsx';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRecentVerification(request);
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  await requireRecentVerification(request);
  const userId = await requireUserId(request);
  await prisma.verification.delete({
    where: {
      target_type: {
        target: userId,
        type: twoFAVerificationType,
      },
    },
  });
  return redirectWithToast('/settings/profile/two-factor', {
    title: '2FA Disabled',
    description: 'Two factor authentication has been disabled.',
  });
}

const TwoFactorDisableRoute = () => {
  const disable2FAFetcher = useFetcher<typeof action>();
  const dc = useDoubleCheck();
  return (
    <SettingsSubpage
      title="Disable two-factor authentication"
      description="Turning off 2FA weakens your account security. Tap twice to confirm."
      backTo="/settings/profile/two-factor"
      backLabel="Back to two-factor"
    >
      <disable2FAFetcher.Form method="POST" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You'll be able to sign in with just your password again. You can
          re-enable 2FA at any time.
        </p>
        <div>
          <StatusButton
            variant="destructive"
            status={disable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
            {...dc.getButtonProps({
              name: 'intent',
              value: 'disable',
              type: 'submit',
            })}
          >
            {dc.doubleCheck ? 'Are you sure?' : 'Disable 2FA'}
          </StatusButton>
        </div>
      </disable2FAFetcher.Form>
    </SettingsSubpage>
  );
};
export default TwoFactorDisableRoute;
