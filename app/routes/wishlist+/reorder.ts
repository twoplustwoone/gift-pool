import { invariantResponse } from '@epic-web/invariant';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  assertExactIdSet,
  buildDenseSortOrder,
  normalizeCategoryId,
  parseIdArrayField,
} from '#app/utils/wishlist-reorder.server.ts';

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
      const orderedCategoryIds = parseIdArrayField(
        formData.get('orderedCategoryIds'),
        'orderedCategoryIds',
      );

      const categories = await prisma.wishlistCategory.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });

      assertExactIdSet({
        actualIds: categories.map((category) => category.id),
        submittedIds: orderedCategoryIds,
        fieldName: 'orderedCategoryIds',
      });

      await prisma.$transaction(
        buildDenseSortOrder(orderedCategoryIds).map(({ id, sortOrder }) =>
          prisma.wishlistCategory.update({
            where: { id },
            data: { order: sortOrder },
          }),
        ),
      );

      return json({ ok: true, clientMutationId });
    }

    if (intent === 'reorder-items') {
      const sourceCategoryId = normalizeCategoryId(formData.get('sourceCategoryId'));
      const targetCategoryId = normalizeCategoryId(formData.get('targetCategoryId'));
      const sourceOrderedItemIds = parseIdArrayField(
        formData.get('sourceOrderedItemIds'),
        'sourceOrderedItemIds',
      );

      const sameCategory = sourceCategoryId === targetCategoryId;
      const requestedCategoryIds = [...new Set(
        [sourceCategoryId, targetCategoryId].filter(
          (categoryId): categoryId is string => Boolean(categoryId),
        ),
      )];

      if (requestedCategoryIds.length > 0) {
        const ownedCategories = await prisma.wishlistCategory.findMany({
          where: {
            ownerId: userId,
            id: { in: requestedCategoryIds },
          },
          select: { id: true },
        });

        invariantResponse(
          ownedCategories.length === requestedCategoryIds.length,
          'Categories must belong to the current user.',
          { status: 400 },
        );
      }

      const targetOrderedItemIds = sameCategory
        ? sourceOrderedItemIds
        : parseIdArrayField(
            formData.get('targetOrderedItemIds'),
            'targetOrderedItemIds',
          );

      const [sourceItems, targetItems] = await Promise.all([
        prisma.wishlistItem.findMany({
          where: {
            ownerId: userId,
            status: 'ACTIVE',
            categoryId: sourceCategoryId,
          },
          select: { id: true },
        }),
        sameCategory
          ? Promise.resolve([])
          : prisma.wishlistItem.findMany({
              where: {
                ownerId: userId,
                status: 'ACTIVE',
                categoryId: targetCategoryId,
              },
              select: { id: true },
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
        const targetActualIds = targetItems.map((item) => item.id);
        const uniqueSourceIds = new Set(sourceOrderedItemIds);
        invariantResponse(
          uniqueSourceIds.size === sourceOrderedItemIds.length,
          'sourceOrderedItemIds cannot contain duplicate ids.',
          { status: 400 },
        );
        invariantResponse(
          sourceOrderedItemIds.every((id) => sourceActualIds.includes(id)),
          'sourceOrderedItemIds includes unknown ids.',
          { status: 400 },
        );

        const sourceRemaining = uniqueSourceIds;
        const movedOutIds = sourceActualIds.filter((id) => !sourceRemaining.has(id));

        invariantResponse(
          movedOutIds.length === 1,
          'Cross-category reorder must move exactly one item.',
          { status: 400 },
        );

        const [movedOutId] = movedOutIds;
        invariantResponse(Boolean(movedOutId), 'Moved item id is required.', {
          status: 400,
        });

        const uniqueTargetIds = new Set(targetOrderedItemIds);
        invariantResponse(
          uniqueTargetIds.size === targetOrderedItemIds.length,
          'targetOrderedItemIds cannot contain duplicate ids.',
          { status: 400 },
        );

        const expectedTargetIds = new Set([...targetActualIds, movedOutId!]);
        invariantResponse(
          expectedTargetIds.size === targetOrderedItemIds.length,
          'targetOrderedItemIds does not match expected target items.',
          { status: 400 },
        );
        invariantResponse(
          targetOrderedItemIds.every((id) => expectedTargetIds.has(id)),
          'targetOrderedItemIds includes unknown ids.',
          { status: 400 },
        );
      }

      const updateItems = sameCategory
        ? buildDenseSortOrder(sourceOrderedItemIds).map(({ id, sortOrder }) =>
            prisma.wishlistItem.update({
              where: { id },
              data: { sortOrder },
            }),
          )
        : [
            ...buildDenseSortOrder(sourceOrderedItemIds).map(({ id, sortOrder }) =>
              prisma.wishlistItem.update({
                where: { id },
                data: { categoryId: sourceCategoryId, sortOrder },
              }),
            ),
            ...buildDenseSortOrder(targetOrderedItemIds).map(({ id, sortOrder }) =>
              prisma.wishlistItem.update({
                where: { id },
                data: { categoryId: targetCategoryId, sortOrder },
              }),
            ),
          ];

      await prisma.$transaction(updateItems);
      return json({ ok: true, clientMutationId });
    }

    return json(
      { ok: false, error: 'Invalid intent.', clientMutationId },
      { status: 400 },
    );
  } catch (error) {
    const responseError =
      error instanceof Response
        ? error
        : new Response('Unable to reorder wishlist items.', { status: 400 });

    return json(
      {
        ok: false,
        error: await responseError.text(),
        clientMutationId,
      },
      { status: responseError.status || 400 },
    );
  }
}
