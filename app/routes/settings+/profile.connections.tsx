import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { type LoaderFunctionArgs } from 'react-router';
import { Icon } from '#app/components/ui/icon.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { type BreadcrumbHandle } from './profile-breadcrumbs.tsx';
export const handle: BreadcrumbHandle & SEOHandle = {
  breadcrumb: <Icon name="link-2">Connections</Icon>,
  getSitemapEntries: () => null,
};
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return {};
}
const Connections = () => {
  return (
    <div className="mx-auto max-w-md">
      <p className="text-muted-foreground">
        No OAuth providers are currently configured for this application.
      </p>
    </div>
  );
};
export default Connections;
