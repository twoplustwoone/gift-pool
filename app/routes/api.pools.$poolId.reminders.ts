import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  OrganizerNudgeError,
  isOrganizerNudgeKind,
  previewOrganizerNudge,
  sendOrganizerNudge,
} from '#app/utils/organizer-nudges.server.ts';

const SendOrganizerNudgeSchema = z.object({
  kind: z.string().refine(isOrganizerNudgeKind),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const senderId = await requireUserId(request);
  const poolId = params.poolId;
  const kind = new URL(request.url).searchParams.get('kind');
  if (!poolId || !isOrganizerNudgeKind(kind)) {
    return data({ error: 'Invalid reminder request.' }, { status: 400 });
  }

  try {
    return data(await previewOrganizerNudge({ poolId, senderId, kind }));
  } catch (error) {
    return organizerNudgeErrorResponse(error);
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const senderId = await requireUserId(request);
  const poolId = params.poolId;
  if (!poolId) {
    return data({ error: 'Invalid reminder request.' }, { status: 400 });
  }

  const parsed = SendOrganizerNudgeSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success || !isOrganizerNudgeKind(parsed.data.kind)) {
    return data({ error: 'Invalid reminder request.' }, { status: 400 });
  }

  try {
    return data(
      await sendOrganizerNudge({
        poolId,
        senderId,
        kind: parsed.data.kind,
        idempotencyKey: parsed.data.idempotencyKey,
      }),
    );
  } catch (error) {
    return organizerNudgeErrorResponse(error);
  }
}

function organizerNudgeErrorResponse(error: unknown) {
  if (!(error instanceof OrganizerNudgeError)) throw error;
  const status = organizerNudgeErrorStatus(error.code);
  return data({ error: error.message, code: error.code }, { status });
}

function organizerNudgeErrorStatus(code: OrganizerNudgeError['code']) {
  switch (code) {
    case 'POOL_NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'TASK_UNAVAILABLE':
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'INVALID_IDEMPOTENCY_KEY':
      return 400;
  }
}
