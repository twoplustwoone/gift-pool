const RANDOM_SEGMENT_LENGTH = 10;

export const createClientMutationId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `cmid_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 2 + RANDOM_SEGMENT_LENGTH)}`;
};
