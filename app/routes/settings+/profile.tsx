import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { Outlet } from 'react-router';
import { PageShell } from '#app/components/page-shell.tsx';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

// No loader here on purpose. Each child route does its own auth check so
// that the `/settings/profile/notifications?token=...` magic-link flow can
// reach the notifications page without being forced through `requireUserId`
// first. Adding a loader at this level would shadow that unauthenticated
// entry point (see Codex P1 on PR #352).

const SettingsProfileLayout = () => {
  return (
    <main className="w-full">
      <PageShell width="narrow" className="py-8 sm:py-12">
        <Outlet />
      </PageShell>
    </main>
  );
};
export default SettingsProfileLayout;
