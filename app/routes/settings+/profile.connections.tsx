import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Icon } from '#app/components/ui/icon.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { type BreadcrumbHandle } from './profile-breadcrumbs.tsx';

export const handle: BreadcrumbHandle & SEOHandle = {
  breadcrumb: <Icon name="link-2">Connections</Icon>,
  getSitemapEntries: () => null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
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
