import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { Outlet } from '@remix-run/react';
import { Icon } from '#app/components/ui/icon.tsx';
import { type VerificationTypes } from '#app/routes/_auth+/verify.tsx';
import { type BreadcrumbHandle } from './profile.tsx';

export const handle: BreadcrumbHandle & SEOHandle = {
  breadcrumb: '2FA',
  getSitemapEntries: () => null,
};

export const twoFAVerificationType = '2fa' satisfies VerificationTypes;

const TwoFactorRoute = () => {
  return <Outlet />;
};

export default TwoFactorRoute;
