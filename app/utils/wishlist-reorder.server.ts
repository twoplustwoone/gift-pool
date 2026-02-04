import { invariantResponse } from '@epic-web/invariant';

type FieldName = string;

export function parseIdArrayField(
  value: FormDataEntryValue | null,
  fieldName: FieldName,
) {
  invariantResponse(typeof value === 'string', `${fieldName} is required`, {
    status: 400,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Response(`${fieldName} must be valid JSON`, { status: 400 });
  }

  invariantResponse(Array.isArray(parsed), `${fieldName} must be an array`, {
    status: 400,
  });

  const ids = parsed.filter((entry) => typeof entry === 'string') as string[];
  invariantResponse(
    ids.length === parsed.length && ids.every((id) => id.trim().length > 0),
    `${fieldName} must contain only non-empty string ids`,
    { status: 400 },
  );

  return ids;
}

export function normalizeCategoryId(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'default' || trimmed === 'null') {
    return null;
  }
  return trimmed;
}

export function assertExactIdSet({
  actualIds,
  submittedIds,
  fieldName,
}: {
  actualIds: string[];
  submittedIds: string[];
  fieldName: FieldName;
}) {
  const uniqueSubmitted = new Set(submittedIds);
  invariantResponse(
    uniqueSubmitted.size === submittedIds.length,
    `${fieldName} cannot contain duplicate ids`,
    { status: 400 },
  );

  invariantResponse(
    actualIds.length === submittedIds.length,
    `${fieldName} does not match current records`,
    { status: 400 },
  );

  const actual = new Set(actualIds);
  const sameMembers = submittedIds.every((id) => actual.has(id));
  invariantResponse(sameMembers, `${fieldName} includes unknown ids`, {
    status: 400,
  });
}

export function buildDenseSortOrder(ids: string[]) {
  return ids.map((id, sortOrder) => ({ id, sortOrder }));
}

export function reorderIdsInList({
  orderedIds,
  activeId,
  overId,
}: {
  orderedIds: string[];
  activeId: string;
  overId: string;
}) {
  const activeIndex = orderedIds.indexOf(activeId);
  const overIndex = orderedIds.indexOf(overId);
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
    return orderedIds;
  }

  const next = [...orderedIds];
  const [item] = next.splice(activeIndex, 1);
  if (!item) return orderedIds;
  next.splice(overIndex, 0, item);
  return next;
}

export function moveIdBetweenLists({
  sourceIds,
  targetIds,
  movedId,
  targetIndex,
}: {
  sourceIds: string[];
  targetIds: string[];
  movedId: string;
  targetIndex: number;
}) {
  const nextSource = sourceIds.filter((id) => id !== movedId);
  const nextTarget = targetIds.filter((id) => id !== movedId);
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextTarget.length));
  nextTarget.splice(boundedIndex, 0, movedId);
  return { sourceIds: nextSource, targetIds: nextTarget };
}
