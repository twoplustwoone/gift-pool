import { parseWithZod } from '@conform-to/zod';
import {
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  json,
  unstable_parseMultipartFormData as parseMultipartFormData,
  type ActionFunctionArgs,
} from '@remix-run/node';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { WishlistItemSchema } from './__wishlist-item-editor';

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3; // 3MB

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  const formData = await parseMultipartFormData(
    request,
    createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD_SIZE }),
  );

  const intent = z
    .enum(['save', 'save-add-another'])
    .parse(formData.get('intent'));

  const submission = await parseWithZod(formData, {
    schema: WishlistItemSchema.superRefine(async (data, ctx) => {
      if (!data.id) return;

      const wishlistItem = await prisma.wishlistItem.findUnique({
        select: { id: true },
        where: { id: data.id, ownerId: userId },
      });
      if (!wishlistItem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Wishlist item not found',
        });
      }

      if (data.categoryId) {
        const category = await prisma.wishlistCategory.findFirst({
          select: { id: true },
          where: { id: data.categoryId, ownerId: userId },
        });
        if (!category) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['categoryId'],
            message: 'Category not found',
          });
        }
      }
    }),
    async: true,
  });

  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const { id: wishlistItemId, categoryId, ...data } = submission.value;

  await prisma.wishlistItem.upsert({
    where: { id: wishlistItemId ?? '__new_wishlist_item__' },
    create: {
      ownerId: userId,
      categoryId: categoryId || null,
      ...data,
    },
    update: { ...data, categoryId: categoryId || null },
  });

  const toast =
    intent === 'save-add-another'
      ? {
          type: 'success' as const,
          title: 'Item added',
          description: 'Wishlist item added.',
        }
      : null;

  return json({
    result: submission.reply(),
    intent,
    toast,
  });
}
