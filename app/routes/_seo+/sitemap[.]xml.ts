import { generateSitemap } from '@nasa-gcn/remix-seo';
import { type LoaderFunctionArgs } from 'react-router';
import { serverBuildContext } from '../../../server/react-router-context.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const serverBuild = await context.get(serverBuildContext);

  if (!serverBuild) {
    throw new Response('Server build unavailable', { status: 500 });
  }

  return generateSitemap(request, serverBuild.build.routes, {
    siteUrl: getDomainUrl(request),
    headers: {
      'Cache-Control': `public, max-age=${60 * 5}`,
    },
  });
}
