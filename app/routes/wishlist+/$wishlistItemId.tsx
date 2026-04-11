import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
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
  clientMutationId: z.string().optional(),
});
export async function action({ request }: ActionFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const clientMutationIdRaw = formData.get('clientMutationId');
  const clientMutationId =
    typeof clientMutationIdRaw === 'string' &&
    clientMutationIdRaw.trim().length > 0
      ? clientMutationIdRaw.trim()
      : null;
  const submission = parseWithZod(formData, {
    schema: DeleteFormSchema,
  });
  if (submission.status !== 'success') {
    return data(
      {
        ...submission.reply(),
        clientMutationId,
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  const { wishlistItemId } = submission.value;
  const wishlistItem = await prisma.wishlistItem.findFirst({
    select: {
      id: true,
      ownerId: true,
      owner: {
        select: {
          username: true,
        },
      },
    },
    where: {
      id: wishlistItemId,
    },
  });
  invariantResponse(wishlistItem, 'Not found', {
    status: 404,
  });
  const isOwner = wishlistItem.ownerId === userId;
  await requireUserWithPermission(
    request,
    isOwner ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );
  await prisma.wishlistItem.delete({
    where: {
      id: wishlistItem.id,
    },
  });
  const event = queueLogEvent({
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
  return data(
    {
      success: true,
      wishlistItemId,
      clientMutationId,
      analyticsEventId: event.eventId,
      requestId,
    },
    {
      headers: combineHeaders(
        toastHeaders,
        applyRequestIdHeader(null, requestId),
      ),
    },
  );
}
