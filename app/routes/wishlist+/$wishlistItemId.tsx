import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { z } from 'zod';
import { logEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { combineHeaders } from '#app/utils/misc.tsx';
import { requireUserWithPermission } from '#app/utils/permissions.server.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { createToastHeaders } from '#app/utils/toast.server.ts';

const DeleteFormSchema = z.object({
  intent: z.literal('delete-wishlist-item'),
  wishlistItemId: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: DeleteFormSchema,
  });
  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const { wishlistItemId } = submission.value;

  const wishlistItem = await prisma.wishlistItem.findFirst({
    select: { id: true, ownerId: true, owner: { select: { username: true } } },
    where: { id: wishlistItemId },
  });
  invariantResponse(wishlistItem, 'Not found', { status: 404 });

  const isOwner = wishlistItem.ownerId === userId;
  await requireUserWithPermission(
    request,
    isOwner ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );

  await prisma.wishlistItem.delete({ where: { id: wishlistItem.id } });

  const event = await logEvent({
    name: 'wishlist_item_archived',
    userId,
    source: 'server',
    requestId,
    sessionId,
    properties: {
      wishlistItemId,
      ownerId: wishlistItem.ownerId,
    },
  });

  const toastHeaders = await createToastHeaders({
    type: 'success',
    title: 'Success',
    description: 'Your wishlist item has been deleted.',
  });

  return json(
    { success: true, analyticsEventId: event.eventId, requestId },
    {
      headers: combineHeaders(
        toastHeaders,
        applyRequestIdHeader(null, requestId),
      ),
    },
  );
}
