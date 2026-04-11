import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { Outlet } from 'react-router';
import { type VerificationTypes } from '#app/routes/_auth+/verify.tsx';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

export const twoFAVerificationType = '2fa' satisfies VerificationTypes;

const TwoFactorRoute = () => {
  return <Outlet />;
};

export default TwoFactorRoute;
