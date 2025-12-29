import { parseWithZod } from '@conform-to/zod';
import { createId as cuid } from '@paralleldrive/cuid2';
import {
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  json,
  unstable_parseMultipartFormData as parseMultipartFormData,
  type ActionFunctionArgs,
} from '@remix-run/node';
import { z } from 'zod';
import { logEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getErrorMessage } from '#app/utils/misc.tsx';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import {
  processImageFromFile,
  processImageFromUrl,
  type WishlistItemImageSource,
} from '#app/utils/wishlist-images.server.ts';
import { WishlistItemSchema } from './__wishlist-item-editor';

const MAX_UPLOAD_SIZE = 1024 * 1024 * 10; // 10MB

export async function action({ request }: ActionFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
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

      if (
        data.imageAction === 'upload' &&
        data.imageFile &&
        data.imageFile.size > MAX_UPLOAD_SIZE
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imageFile'],
          message: 'Image must be 10MB or smaller',
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

  const normalizedNote =
    data.note?.trim() === '' ? null : data.note ?? null;
  const normalizedUrl = data.url?.trim() === '' ? null : data.url ?? null;

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
    note: normalizedNote,
    url: normalizedUrl,
    ...(typeof nextImage !== 'undefined'
      ? { image: nextImage, imageSource: nextImageSource ?? null }
      : {}),
  };

  const savedItem = wishlistItemId
    ? await prisma.wishlistItem.update({
        select: { id: true, ownerId: true, categoryId: true, type: true },
        where: { id: wishlistItemId },
        data: { ...dataWithImage, categoryId: categoryId || null },
      })
    : await prisma.wishlistItem.create({
        select: { id: true, ownerId: true, categoryId: true, type: true },
        data: {
          ownerId: userId,
          categoryId: categoryId || null,
          ...dataWithImage,
        },
      });

  let analyticsEventId: string | null = null;
  if (!existingItem && !imageError) {
    const event = await logEvent({
      name: 'wishlist_item_added',
      userId,
      source: 'server',
      requestId,
      sessionId,
      eventId: formData.get('analyticsEventId')?.toString() || undefined,
      properties: {
        wishlistItemId: savedItem.id,
        categoryId: savedItem.categoryId,
        type: savedItem.type,
      },
    });
    analyticsEventId = event.eventId;
  }

  const toast =
    intent === 'save-add-another'
      ? {
          id: cuid(),
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
      analyticsEventId,
      requestId,
    },
    {
      status: imageError ? 400 : 200,
      headers: applyRequestIdHeader(null, requestId),
    },
  );
}
