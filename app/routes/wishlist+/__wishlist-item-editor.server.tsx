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
import { getErrorMessage } from '#app/utils/misc.tsx';
import {
  processImageFromFile,
  processImageFromUrl,
  type WishlistItemImageSource,
} from '#app/utils/wishlist-images.server.ts';
import { WishlistItemSchema } from './__wishlist-item-editor';

const MAX_UPLOAD_SIZE = 1024 * 1024 * 5; // 5MB

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
        select: { id: true, url: true, image: true, imageSource: true },
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

      if (data.imageAction === 'url' && !data.imageUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imageUrl'],
          message: 'Add an image link to use this option',
        });
      }

      if (
        data.imageAction === 'upload' &&
        (!data.imageFile || data.imageFile.size === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imageFile'],
          message: 'Upload an image to continue',
        });
      }

    }),
    async: true,
  });

  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const {
    id: wishlistItemId,
    categoryId,
    imageAction,
    imageUrl,
    imageFile,
    ...data
  } = submission.value;

  const existingItem = wishlistItemId
    ? await prisma.wishlistItem.findUnique({
        select: {
          id: true,
          ownerId: true,
          url: true,
          image: true,
          imageSource: true,
        },
        where: { id: wishlistItemId },
      })
    : null;

  let nextImage: Buffer | null | undefined;
  let nextImageSource: WishlistItemImageSource | null | undefined;
  let imageError: string | null = null;

  const effectiveImageAction =
    imageAction === 'auto-detect' ? 'none' : imageAction;

  try {
    if (effectiveImageAction === 'upload') {
      if (imageFile && imageFile.size > 0) {
        const processed = await processImageFromFile(imageFile);
        nextImage = processed.data;
        nextImageSource = 'MANUAL_UPLOAD';
      }
    } else if (effectiveImageAction === 'url') {
      if (imageUrl) {
        const processed = await processImageFromUrl(imageUrl);
        nextImage = processed.data;
        nextImageSource = 'MANUAL_URL';
      }
    } else if (effectiveImageAction === 'remove') {
      nextImage = null;
      nextImageSource = null;
    }
  } catch (error) {
    imageError = getErrorMessage(error);
    nextImage = undefined;
    nextImageSource = undefined;
  }

  const dataWithImage = {
    ...data,
    ...(typeof nextImage !== 'undefined'
      ? { image: nextImage, imageSource: nextImageSource ?? null }
      : {}),
  };

  await prisma.wishlistItem.upsert({
    where: { id: wishlistItemId ?? '__new_wishlist_item__' },
    create: {
      ownerId: userId,
      categoryId: categoryId || null,
      ...dataWithImage,
    },
    update: { ...dataWithImage, categoryId: categoryId || null },
  });

  const toast =
    intent === 'save-add-another'
      ? {
          type: 'success' as const,
          title: 'Item added',
          description: 'Wishlist item added.',
        }
      : null;

  return json(
    {
      result: submission.reply(),
      intent,
      toast,
      imageError,
      imageAction,
    },
    { status: imageError ? 400 : 200 },
  );
}
