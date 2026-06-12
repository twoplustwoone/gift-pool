import { data, redirect, type LoaderFunctionArgs } from 'react-router';
import { applyAffiliateTags } from '#app/utils/affiliate.server.ts';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';

// Outbound product-link redirect: /out?item=<id> or /out?idea=<id>.
//
// One choke point for affiliate tagging + click analytics. The route accepts
// only a database id — never a URL — so it cannot be used as an open
// redirector: the target always comes from the stored row and is re-validated
// as http(s) before the 302. No auth: anonymous public-share viewers click
// these links too.
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  const url = new URL(request.url);
  const itemId = url.searchParams.get('item');
  const ideaId = url.searchParams.get('idea');

  let target: string | null = null;
  let entity: 'item' | 'idea' | null = null;
  if (itemId) {
    target =
      (
        await prisma.wishlistItem.findUnique({
          where: { id: itemId },
          select: { url: true },
        })
      )?.url ?? null;
    entity = 'item';
  } else if (ideaId) {
    target =
      (
        await prisma.giftIdea.findUnique({
          where: { id: ideaId },
          select: { url: true },
        })
      )?.url ?? null;
    entity = 'idea';
  }
  if (!target || !entity) {
    throw data(null, { status: 404 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw data(null, { status: 404 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw data(null, { status: 404 });
  }

  const { url: finalUrl, network } = applyAffiliateTags(parsed.toString());

  const { requestId } = await getRequestContext(request);
  queueLogEvent({
    name: 'wishlist_link_clicked',
    userId: userId ?? null,
    source: 'server',
    requestId,
    properties: {
      entity,
      id: itemId ?? ideaId,
      host: parsed.hostname,
      affiliate: network,
      tagged: network != null,
    },
  });

  return redirect(finalUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
