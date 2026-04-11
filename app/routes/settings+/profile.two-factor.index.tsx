import { type SEOHandle } from '@nasa-gcn/remix-seo';
import {
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs, Link, useFetcher, useLoaderData 
} from 'react-router';
import { Icon } from '#app/components/ui/icon.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { generateTOTP } from '#app/utils/totp.server.ts';
import { SettingsSubpage } from './__settings-subpage.tsx';
import { twoFAVerificationType } from './profile.two-factor.tsx';
import { twoFAVerifyVerificationType } from './profile.two-factor.verify.tsx';
export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const verification = await prisma.verification.findUnique({
    where: {
      target_type: {
        type: twoFAVerificationType,
        target: userId,
      },
    },
    select: {
      id: true,
    },
  });
  return {
    is2FAEnabled: Boolean(verification),
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { otp: _otp, ...config } = generateTOTP();
  const verificationData = {
    ...config,
    type: twoFAVerifyVerificationType,
    target: userId,
  };
  await prisma.verification.upsert({
    where: {
      target_type: {
        target: userId,
        type: twoFAVerifyVerificationType,
      },
    },
    create: verificationData,
    update: verificationData,
  });
  return redirect('/settings/profile/two-factor/verify');
}
const TwoFactorRoute = () => {
  const data = useLoaderData<typeof loader>();
  const enable2FAFetcher = useFetcher<typeof action>();
  return (
    <SettingsSubpage
      title="Two-factor authentication"
      description="Require a one-time code from your authenticator app every time you sign in."
    >
      {data.is2FAEnabled ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            <Icon name="check">You have enabled two-factor authentication.</Icon>
          </p>
          <div>
            <Link
              to="disable"
              className="inline-flex items-center gap-1 text-sm font-medium text-destructive hover:underline"
            >
              <Icon name="lock-open-1">Disable 2FA</Icon>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ll need an authenticator app like{' '}
            <a
              className="underline hover:text-foreground"
              href="https://1password.com/"
            >
              1Password
            </a>{' '}
            (or Authy, or Google Authenticator) to scan the QR code on the
            next step.
          </p>
          <enable2FAFetcher.Form method="POST">
            <StatusButton
              type="submit"
              name="intent"
              value="enable"
              status={enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
            >
              Enable 2FA
            </StatusButton>
          </enable2FAFetcher.Form>
        </div>
      )}
    </SettingsSubpage>
  );
};
export default TwoFactorRoute;
