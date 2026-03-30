import { invariantResponse } from '@epic-web/invariant';
import { data, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  assertExactIdSet,
  buildDenseSortOrder,
  normalizeCategoryId,
  parseIdArrayField,
} from '#app/utils/wishlist-reorder.server.ts';

async function reorderCategories({
  orderedCategoryIds,
  userId,
}: {
  orderedCategoryIds: string[];
  userId: string;
}) {
  const categories = await prisma.wishlistCategory.findMany({
    where: {
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });
  assertExactIdSet({
    actualIds: categories.map((category) => category.id),
    submittedIds: orderedCategoryIds,
    fieldName: 'orderedCategoryIds',
  });

  await prisma.$transaction(
    buildDenseSortOrder(orderedCategoryIds).map(({ id, sortOrder }) =>
      prisma.wishlistCategory.update({
        where: {
          id,
        },
        data: {
          order: sortOrder,
        },
      }),
    ),
  );
}

async function assertOwnedRequestedCategories({
  requestedCategoryIds,
  userId,
}: {
  requestedCategoryIds: string[];
  userId: string;
}) {
  if (requestedCategoryIds.length === 0) return;

  const ownedCategories = await prisma.wishlistCategory.findMany({
    where: {
      ownerId: userId,
      id: {
        in: requestedCategoryIds,
      },
    },
    select: {
      id: true,
    },
  });
  invariantResponse(
    ownedCategories.length === requestedCategoryIds.length,
    'Categories must belong to the current user.',
    {
      status: 400,
    },
  );
}

function validateCrossCategoryReorder({
  sourceActualIds,
  sourceOrderedItemIds,
  targetActualIds,
  targetOrderedItemIds,
}: {
  sourceActualIds: string[];
  sourceOrderedItemIds: string[];
  targetActualIds: string[];
  targetOrderedItemIds: string[];
}) {
  const uniqueSourceIds = new Set(sourceOrderedItemIds);
  invariantResponse(
    uniqueSourceIds.size === sourceOrderedItemIds.length,
    'sourceOrderedItemIds cannot contain duplicate ids.',
    {
      status: 400,
    },
  );
  invariantResponse(
    sourceOrderedItemIds.every((id) => sourceActualIds.includes(id)),
    'sourceOrderedItemIds includes unknown ids.',
    {
      status: 400,
    },
  );

  const movedOutIds = sourceActualIds.filter((id) => !uniqueSourceIds.has(id));
  invariantResponse(
    movedOutIds.length === 1,
    'Cross-category reorder must move exactly one item.',
    {
      status: 400,
    },
  );

  const [movedOutId] = movedOutIds;
  invariantResponse(Boolean(movedOutId), 'Moved item id is required.', {
    status: 400,
  });

  const uniqueTargetIds = new Set(targetOrderedItemIds);
  invariantResponse(
    uniqueTargetIds.size === targetOrderedItemIds.length,
    'targetOrderedItemIds cannot contain duplicate ids.',
    {
      status: 400,
    },
  );

  const expectedTargetIds = new Set([...targetActualIds, movedOutId!]);
  invariantResponse(
    expectedTargetIds.size === targetOrderedItemIds.length,
    'targetOrderedItemIds does not match expected target items.',
    {
      status: 400,
    },
  );
  invariantResponse(
    targetOrderedItemIds.every((id) => expectedTargetIds.has(id)),
    'targetOrderedItemIds includes unknown ids.',
    {
      status: 400,
    },
  );
}

function buildReorderUpdates({
  sameCategory,
  sourceCategoryId,
  sourceOrderedItemIds,
  targetCategoryId,
  targetOrderedItemIds,
}: {
  sameCategory: boolean;
  sourceCategoryId: string | null;
  sourceOrderedItemIds: string[];
  targetCategoryId: string | null;
  targetOrderedItemIds: string[];
}) {
  if (sameCategory) {
    return buildDenseSortOrder(sourceOrderedItemIds).map(({ id, sortOrder }) =>
      prisma.wishlistItem.update({
        where: {
          id,
        },
        data: {
          sortOrder,
        },
      }),
    );
  }

  return [
    ...buildDenseSortOrder(sourceOrderedItemIds).map(({ id, sortOrder }) =>
      prisma.wishlistItem.update({
        where: {
          id,
        },
        data: {
          categoryId: sourceCategoryId,
          sortOrder,
        },
      }),
    ),
    ...buildDenseSortOrder(targetOrderedItemIds).map(({ id, sortOrder }) =>
      prisma.wishlistItem.update({
        where: {
          id,
        },
        data: {
          categoryId: targetCategoryId,
          sortOrder,
        },
      }),
    ),
  ];
}

async function reorderItems({
  formData,
  userId,
}: {
  formData: FormData;
  userId: string;
}) {
  const sourceCategoryId = normalizeCategoryId(formData.get('sourceCategoryId'));
  const targetCategoryId = normalizeCategoryId(formData.get('targetCategoryId'));
  const sourceOrderedItemIds = parseIdArrayField(
    formData.get('sourceOrderedItemIds'),
    'sourceOrderedItemIds',
  );
  const sameCategory = sourceCategoryId === targetCategoryId;
  const requestedCategoryIds = [
    ...new Set(
      [sourceCategoryId, targetCategoryId].filter(
        (categoryId): categoryId is string => Boolean(categoryId),
      ),
    ),
  ];
  await assertOwnedRequestedCategories({
    requestedCategoryIds,
    userId,
  });

  const targetOrderedItemIds = sameCategory
    ? sourceOrderedItemIds
    : parseIdArrayField(formData.get('targetOrderedItemIds'), 'targetOrderedItemIds');
  const [sourceItems, targetItems] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: {
        ownerId: userId,
        status: 'ACTIVE',
        categoryId: sourceCategoryId,
      },
      select: {
        id: true,
      },
    }),
    sameCategory
      ? Promise.resolve([])
      : prisma.wishlistItem.findMany({
          where: {
            ownerId: userId,
            status: 'ACTIVE',
            categoryId: targetCategoryId,
          },
          select: {
            id: true,
          },
        }),
  ]);
  const sourceActualIds = sourceItems.map((item) => item.id);
  if (sameCategory) {
    assertExactIdSet({
      actualIds: sourceActualIds,
      submittedIds: sourceOrderedItemIds,
      fieldName: 'sourceOrderedItemIds',
    });
  } else {
    validateCrossCategoryReorder({
      sourceActualIds,
      sourceOrderedItemIds,
      targetActualIds: targetItems.map((item) => item.id),
      targetOrderedItemIds,
    });
  }

  await prisma.$transaction(
    buildReorderUpdates({
      sameCategory,
      sourceCategoryId,
      sourceOrderedItemIds,
      targetCategoryId,
      targetOrderedItemIds,
    }),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const clientMutationIdRaw = formData.get('clientMutationId');
  const clientMutationId =
    typeof clientMutationIdRaw === 'string' && clientMutationIdRaw.length > 0
      ? clientMutationIdRaw
      : null;
  try {
    if (intent === 'reorder-categories') {
      await reorderCategories({
        orderedCategoryIds: parseIdArrayField(
          formData.get('orderedCategoryIds'),
          'orderedCategoryIds',
        ),
        userId,
      });
      return {
        ok: true,
        clientMutationId,
      };
    }
    if (intent === 'reorder-items') {
      await reorderItems({ formData, userId });
      return {
        ok: true,
        clientMutationId,
      };
    }
    return data(
      {
        ok: false,
        error: 'Invalid intent.',
        clientMutationId,
      },
      {
        status: 400,
      },
    );
  } catch (error) {
    const responseError =
      error instanceof Response
        ? error
        : new Response('Unable to reorder wishlist items.', {
            status: 400,
          });
    return data(
      {
        ok: false,
        error: await responseError.text(),
        clientMutationId,
      },
      {
        status: responseError.status || 400,
      },
    );
  }
}
