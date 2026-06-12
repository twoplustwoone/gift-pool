import { parseWithZod } from '@conform-to/zod';
import { createId as cuid } from '@paralleldrive/cuid2';
import { data as rrData, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getErrorMessage } from '#app/utils/misc.tsx';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { WishlistNoteSchema } from '#app/utils/user-validation.ts';
import {
  processImageFromFile,
  processImageFromUrl,
  type WishlistItemImageSource,
} from '#app/utils/wishlist-images.server.ts';
import { WishlistItemSchema } from './__wishlist-item-editor';

const UpdateNoteSchema = z.object({
  intent: z.literal('update-note'),
  note: WishlistNoteSchema,
});
const MAX_UPLOAD_SIZE = 1024 * 1024 * 10; // 10MB

async function getNextSortOrderForCategory({
  ownerId,
  categoryId,
}: {
  ownerId: string;
  categoryId: string | null;
}) {
  const max = await prisma.wishlistItem.aggregate({
    where: {
      ownerId,
      categoryId,
    },
    _max: {
      sortOrder: true,
    },
  });
  return (max._max.sortOrder ?? -1) + 1;
}
async function redensifyCategory({
  tx,
  ownerId,
  categoryId,
  excludeId,
}: {
  tx: Pick<typeof prisma, 'wishlistItem'>;
  ownerId: string;
  categoryId: string | null;
  excludeId?: string;
}) {
  const items = await tx.wishlistItem.findMany({
    where: {
      ownerId,
      categoryId,
      ...(excludeId
        ? {
            id: {
              not: excludeId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
    orderBy: [
      {
        sortOrder: 'asc',
      },
      {
        createdAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });
  if (items.length === 0) return;
  await Promise.all(
    items.map((item, index) =>
      tx.wishlistItem.update({
        where: {
          id: item.id,
        },
        data: {
          sortOrder: index,
        },
      }),
    ),
  );
}

function getClientMutationId(formData: FormData) {
  const clientMutationIdRaw = formData.get('clientMutationId');
  return typeof clientMutationIdRaw === 'string' &&
    clientMutationIdRaw.trim().length > 0
    ? clientMutationIdRaw.trim()
    : null;
}

function createWishlistItemValidationSchema(userId: string) {
  return WishlistItemSchema.superRefine(async (data, ctx) => {
    if (!data.id) return;

    const wishlistItem = await prisma.wishlistItem.findUnique({
      select: {
        id: true,
      },
      where: {
        id: data.id,
        ownerId: userId,
      },
    });
    if (!wishlistItem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wishlist item not found',
      });
    }

    if (data.categoryId) {
      const category = await prisma.wishlistCategory.findFirst({
        select: {
          id: true,
        },
        where: {
          id: data.categoryId,
          ownerId: userId,
        },
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

    if (data.imageAction === 'upload' && (!data.imageFile || data.imageFile.size === 0)) {
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
  });
}

async function parseWishlistItemSubmission(formData: FormData, userId: string) {
  return parseWithZod(formData, {
    schema: createWishlistItemValidationSchema(userId),
    async: true,
  });
}

function normalizeWishlistItemData(
  data: Pick<z.infer<typeof WishlistItemSchema>, 'note' | 'url'>,
) {
  return {
    note: data.note?.trim() === '' ? null : (data.note ?? null),
    url: data.url?.trim() === '' ? null : (data.url ?? null),
  };
}

async function findExistingWishlistItem(wishlistItemId: string | undefined) {
  if (!wishlistItemId) return null;

  return prisma.wishlistItem.findUnique({
    select: {
      id: true,
      ownerId: true,
      categoryId: true,
      url: true,
      image: true,
      imageSource: true,
    },
    where: {
      id: wishlistItemId,
    },
  });
}

async function resolveImageUpdate({
  imageAction,
  imageFile,
  imageUrl,
}: {
  imageAction: z.infer<typeof WishlistItemSchema>['imageAction'];
  imageFile?: File;
  imageUrl?: string;
}) {
  let nextImage: Buffer | null | undefined;
  let nextImageSource: WishlistItemImageSource | null | undefined;
  let imageError: string | null = null;
  const effectiveImageAction = imageAction === 'auto-detect' ? 'none' : imageAction;

  try {
    if (effectiveImageAction === 'upload' && imageFile && imageFile.size > 0) {
      const processed = await processImageFromFile(imageFile);
      nextImage = processed.data;
      nextImageSource = 'MANUAL_UPLOAD';
    } else if (effectiveImageAction === 'url' && imageUrl) {
      const processed = await processImageFromUrl(imageUrl);
      nextImage = processed.data;
      nextImageSource = 'MANUAL_URL';
    } else if (effectiveImageAction === 'remove') {
      nextImage = null;
      nextImageSource = null;
    }
  } catch (error) {
    imageError = getErrorMessage(error);
    nextImage = undefined;
    nextImageSource = undefined;
  }

  return { effectiveImageAction, imageError, nextImage, nextImageSource };
}

function buildWishlistItemDataWithImage({
  data,
  nextImage,
  nextImageSource,
  normalizedNote,
  normalizedUrl,
  priceCents,
  currency,
}: {
  data: Omit<
    z.infer<typeof WishlistItemSchema>,
    | 'id'
    | 'categoryId'
    | 'imageAction'
    | 'imageUrl'
    | 'imageFile'
    | 'price'
    | 'currency'
    | 'enrichedFields'
    | 'enrichmentEdited'
  >;
  normalizedNote: string | null;
  normalizedUrl: string | null;
  nextImage: Buffer | null | undefined;
  nextImageSource: WishlistItemImageSource | null | undefined;
  priceCents: number | null;
  currency: string | null;
}) {
  return {
    ...data,
    note: normalizedNote,
    url: normalizedUrl,
    priceCents,
    currency,
    ...(typeof nextImage !== 'undefined'
      ? {
          image: nextImage,
          imageSource: nextImageSource ?? null,
          hasImage: Boolean(nextImage),
        }
      : {}),
  };
}

async function saveUpdatedWishlistItem({
  dataWithImage,
  existingItem,
  nextCategoryId,
  userId,
  wishlistItemId,
}: {
  dataWithImage: ReturnType<typeof buildWishlistItemDataWithImage>;
  existingItem: NonNullable<Awaited<ReturnType<typeof findExistingWishlistItem>>>;
  nextCategoryId: string | null;
  userId: string;
  wishlistItemId: string;
}) {
  const select = {
    id: true,
    title: true,
    ownerId: true,
    note: true,
    url: true,
    type: true,
    priceCents: true,
    currency: true,
    categoryId: true,
    sortOrder: true,
    updatedAt: true,
    status: true,
    hasImage: true,
    imageSource: true,
  } as const;

  const categoryChanged = existingItem.categoryId !== nextCategoryId;
  if (!categoryChanged) {
    return prisma.wishlistItem.update({
      select,
      where: {
        id: wishlistItemId,
      },
      data: {
        ...dataWithImage,
        categoryId: nextCategoryId,
      },
    });
  }

  const nextSortOrder = await getNextSortOrderForCategory({
    ownerId: userId,
    categoryId: nextCategoryId,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.wishlistItem.update({
      select,
      where: {
        id: wishlistItemId,
      },
      data: {
        ...dataWithImage,
        categoryId: nextCategoryId,
        sortOrder: nextSortOrder,
      },
    });
    await redensifyCategory({
      tx,
      ownerId: userId,
      categoryId: existingItem.categoryId,
      excludeId: wishlistItemId,
    });
    return updated;
  });
}

async function createWishlistItem({
  dataWithImage,
  nextCategoryId,
  userId,
}: {
  dataWithImage: ReturnType<typeof buildWishlistItemDataWithImage>;
  nextCategoryId: string | null;
  userId: string;
}) {
  const nextSortOrder = await getNextSortOrderForCategory({
    ownerId: userId,
    categoryId: nextCategoryId,
  });

  return prisma.wishlistItem.create({
    select: {
      id: true,
      title: true,
      ownerId: true,
      note: true,
      url: true,
      type: true,
      priceCents: true,
      currency: true,
      categoryId: true,
      sortOrder: true,
      updatedAt: true,
      status: true,
      hasImage: true,
      imageSource: true,
    },
    data: {
      ownerId: userId,
      categoryId: nextCategoryId,
      sortOrder: nextSortOrder,
      ...dataWithImage,
    },
  });
}
async function handleUpdateNote(formData: FormData, userId: string) {
  const submission = parseWithZod(formData, { schema: UpdateNoteSchema });
  if (submission.status !== 'success') {
    return rrData(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }
  await prisma.user.update({
    select: { id: true },
    where: { id: userId },
    data: { wishlistNote: submission.value.note || null },
  });
  return rrData({ result: submission.reply(), intent: 'update-note' as const });
}

export async function action({ request }: ActionFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intentRaw = formData.get('intent');

  if (intentRaw === 'update-note') {
    return handleUpdateNote(formData, userId);
  }

  const intent = z
    .enum(['save', 'save-add-another'])
    .parse(intentRaw);
  const clientMutationId = getClientMutationId(formData);
  const submission = await parseWishlistItemSubmission(formData, userId);
  if (submission.status !== 'success') {
    return rrData(
      {
        result: submission.reply(),
        clientMutationId,
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  const {
    id: wishlistItemId,
    categoryId,
    imageAction,
    imageUrl,
    imageFile,
    price,
    currency,
    enrichedFields,
    enrichmentEdited,
    ...data
  } = submission.value;
  const { note: normalizedNote, url: normalizedUrl } =
    normalizeWishlistItemData(data);
  const existingItem = await findExistingWishlistItem(wishlistItemId);
  const { imageError, nextImage, nextImageSource } = await resolveImageUpdate({
    imageAction,
    imageFile,
    imageUrl,
  });
  const dataWithImage = buildWishlistItemDataWithImage({
    data,
    normalizedNote,
    normalizedUrl,
    nextImage,
    nextImageSource,
    priceCents: price ?? null,
    // Never store a currency without a price.
    currency: price == null ? null : (currency ?? 'USD'),
  });
  const nextCategoryId = categoryId || null;
  const savedItem = wishlistItemId
    ? await (() => {
        if (!existingItem) {
          throw new Error('Wishlist item not found');
        }
        return saveUpdatedWishlistItem({
          dataWithImage,
          existingItem,
          nextCategoryId,
          userId,
          wishlistItemId,
        });
      })()
    : await createWishlistItem({
        dataWithImage,
        nextCategoryId,
        userId,
      });
  let analyticsEventId: string | null = null;
  if (!existingItem && !imageError) {
    const event = queueLogEvent({
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
        hasPrice: savedItem.priceCents != null,
        enriched: Boolean(enrichedFields),
        enrichedFields: enrichedFields
          ? enrichedFields.split(',').filter(Boolean)
          : [],
        enrichmentEdited: enrichmentEdited === 'true',
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
  return rrData(
    {
      result: submission.reply(),
      intent,
      item: {
        id: savedItem.id,
        title: savedItem.title,
        ownerId: savedItem.ownerId,
        note: savedItem.note,
        url: savedItem.url,
        type: savedItem.type,
        priceCents: savedItem.priceCents,
        currency: savedItem.currency,
        categoryId: savedItem.categoryId,
        sortOrder: savedItem.sortOrder,
        updatedAt: savedItem.updatedAt,
        status: savedItem.status,
        hasImage: savedItem.hasImage,
        imageSource: savedItem.imageSource,
      },
      clientMutationId,
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
