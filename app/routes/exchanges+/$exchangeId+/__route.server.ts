import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getHints } from '#app/utils/client-hints.tsx';
import { prisma } from '#app/utils/db.server.ts';
import {
  GIFT_OUTCOME,
  GIFT_STAGE,
  REVEAL_MODE,
} from '#app/utils/exchange-constants.ts';
import {
  autoRevealInstant,
  dateInputToUtcMidnight,
  defaultAutoRevealInstant,
} from '#app/utils/exchange-dates.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import {
  addExclusion,
  cancelExchange,
  dismissJoinPrompt,
  drawNames,
  getViewerProjection,
  markAssignmentViewed,
  removeExclusion,
  reveal,
  setGiftLabel,
  setGiftStage,
  setParticipation,
  setReceived,
  updateExchangeSettings,
} from '#app/utils/exchanges.server.ts';
import { OCCASION_TYPE } from '#app/utils/pool-constants.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

// ─── Loader ───────────────────────────────────────────────────────────────────

// The single call. Every denial inside is one 404; the projection is already
// shaped for this viewer's role, so nothing pairing-shaped can reach the
// client by accident.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const { timeZone } = getHints(request);
  const now = new Date();
  const view = await getViewerProjection({
    exchangeId: params.exchangeId!,
    viewerId: userId,
    now,
    timeZone,
  });
  // The pre-draw participant page offers exactly one useful action: update
  // your own wishlist. The count makes that nudge concrete.
  const viewerWishlistItemCount =
    view.viewer.participation === 'IN' && view.exchange.status === 'GATHERING'
      ? await prisma.wishlistItem.count({
          where: { ownerId: userId, status: 'ACTIVE' },
        })
      : null;
  return { view, now: now.toISOString(), timeZone, viewerWishlistItemCount };
}

// ─── Action ───────────────────────────────────────────────────────────────────

const Base = z.object({ exchangeId: z.string().min(1) });
const OnOff = z.enum(['on', 'off']);

const ActionSchema = z.discriminatedUnion('intent', [
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.OptIn) }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.OptOut) }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.AddExclusion),
    userAId: z.string().min(1),
    userBId: z.string().min(1),
  }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.RemoveExclusion),
    exclusionId: z.string().min(1),
  }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.DrawNames) }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.SetGiftStage),
    stage: z.enum([
      GIFT_STAGE.NONE,
      GIFT_STAGE.GOT_IT,
      GIFT_STAGE.WRAPPED,
      GIFT_STAGE.GIVEN,
    ]),
  }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.SetReceived),
    outcome: z.enum([GIFT_OUTCOME.LOVED, GIFT_OUTCOME.OKAY]),
  }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.SetGiftLabel),
    label: z.string().max(120).optional(),
  }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.MarkAssignmentViewed) }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.Reveal) }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.Cancel) }),
  Base.extend({ intent: z.literal(EXCHANGE_INTENT.DismissJoinPrompt) }),
  Base.extend({
    intent: z.literal(EXCHANGE_INTENT.UpdateSettings),
    title: z.string().trim().max(100).optional(),
    occasionType: z.string().optional(),
    eventDate: z.string().optional(),
    spendingGuideline: z.string().trim().max(80).optional(),
    revealMode: z
      .enum([REVEAL_MODE.ORGANIZER, REVEAL_MODE.SECRET_FOREVER])
      .optional(),
    autoReveal: OnOff.optional(),
    autoRevealDate: z.string().optional(),
    avoidRepeats: OnOff.optional(),
  }),
]);

type ThrownData = { data: { error?: string }; init?: ResponseInit | null };

function isThrownData(error: unknown): error is ThrownData {
  return (
    !!error && typeof error === 'object' && 'data' in error && 'init' in error
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const exchangeId = params.exchangeId!;
  const { timeZone } = getHints(request);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData.entries());
  const parsed = ActionSchema.safeParse({ ...raw, exchangeId });
  if (!parsed.success) {
    return data({ error: 'That request was not understood.' }, { status: 400 });
  }
  const v = parsed.data;

  try {
    switch (v.intent) {
      case EXCHANGE_INTENT.OptIn:
        await setParticipation({ exchangeId, userId, status: 'IN' });
        return data({ ok: true });
      case EXCHANGE_INTENT.OptOut:
        await setParticipation({ exchangeId, userId, status: 'OUT' });
        return data({ ok: true });
      case EXCHANGE_INTENT.AddExclusion:
        await addExclusion({
          exchangeId,
          actorId: userId,
          userAId: v.userAId,
          userBId: v.userBId,
        });
        return data({ ok: true });
      case EXCHANGE_INTENT.RemoveExclusion:
        await removeExclusion({
          exchangeId,
          actorId: userId,
          exclusionId: v.exclusionId,
        });
        return data({ ok: true });
      case EXCHANGE_INTENT.DrawNames: {
        const result = await drawNames({ exchangeId, actorId: userId });
        if (result.status === 'DRAWN') return data({ ok: true, drawn: true });
        return data(
          {
            error:
              result.preview.kind === 'TOO_FEW'
                ? 'An exchange needs three people.'
                : `These exclusions leave nobody for ${result.preview.kind === 'INFEASIBLE' ? result.preview.blockedName : 'someone'}.`,
            preview: result.preview,
          },
          { status: 409 },
        );
      }
      case EXCHANGE_INTENT.SetGiftStage:
        await setGiftStage({ exchangeId, userId, stage: v.stage });
        return data({ ok: true });
      case EXCHANGE_INTENT.SetReceived:
        await setReceived({ exchangeId, userId, outcome: v.outcome });
        return data({ ok: true });
      case EXCHANGE_INTENT.SetGiftLabel:
        await setGiftLabel({ exchangeId, userId, label: v.label ?? null });
        return data({ ok: true });
      case EXCHANGE_INTENT.MarkAssignmentViewed:
        await markAssignmentViewed({ exchangeId, userId });
        return data({ ok: true });
      case EXCHANGE_INTENT.Reveal: {
        const result = await reveal({ exchangeId, actorId: userId });
        if (result.status === 'NOT_YET') {
          return data(
            { error: 'You can reveal from the exchange date onwards.' },
            { status: 409 },
          );
        }
        return data({ ok: true, revealed: true });
      }
      case EXCHANGE_INTENT.Cancel: {
        await cancelExchange({ exchangeId, actorId: userId });
        return redirectWithToast('/exchanges', {
          type: 'success',
          title: 'Exchange cancelled',
          description: 'Everyone who was in has been told.',
        });
      }
      case EXCHANGE_INTENT.DismissJoinPrompt:
        await dismissJoinPrompt({ exchangeId, userId });
        return data({ ok: true });
      case EXCHANGE_INTENT.UpdateSettings: {
        const current = await prisma.exchange.findUnique({
          where: { id: exchangeId },
          select: { eventDate: true },
        });
        const eventDate =
          v.eventDate !== undefined
            ? dateInputToUtcMidnight(v.eventDate)
            : undefined;
        if (v.eventDate !== undefined && !eventDate) {
          return data({ error: 'Pick a real date.' }, { status: 400 });
        }
        const effectiveEventDate = eventDate ?? current?.eventDate;
        let autoRevealAt: Date | null | undefined;
        if (v.autoReveal === 'off') {
          autoRevealAt = null;
        } else if (v.autoReveal === 'on' && effectiveEventDate) {
          autoRevealAt = v.autoRevealDate
            ? autoRevealInstant(v.autoRevealDate, timeZone)
            : defaultAutoRevealInstant(effectiveEventDate, timeZone);
          if (!autoRevealAt) {
            return data({ error: 'Pick a real date.' }, { status: 400 });
          }
        }
        await updateExchangeSettings({
          exchangeId,
          actorId: userId,
          patch: {
            ...(v.title !== undefined ? { title: v.title } : {}),
            ...(v.occasionType !== undefined
              ? {
                  occasionType: (v.occasionType in OCCASION_TYPE
                    ? v.occasionType
                    : OCCASION_TYPE.OTHER) as keyof typeof OCCASION_TYPE,
                }
              : {}),
            ...(eventDate ? { eventDate } : {}),
            ...(v.spendingGuideline !== undefined
              ? { spendingGuideline: v.spendingGuideline || null }
              : {}),
            ...(v.revealMode !== undefined ? { revealMode: v.revealMode } : {}),
            ...(autoRevealAt !== undefined ? { autoRevealAt } : {}),
            ...(v.avoidRepeats !== undefined
              ? { avoidRepeatsLookback: v.avoidRepeats === 'on' ? 2 : null }
              : {}),
          },
        });
        return data({ ok: true });
      }
    }
  } catch (error) {
    // Domain refusals (403/404/409/400) come back as data so a fetcher-driven
    // control can show them in place. A thrown response would bubble to the
    // route error boundary and destroy the page the user is looking at.
    if (isThrownData(error)) {
      return data(
        { error: error.data.error ?? 'Something went wrong.' },
        { status: error.init?.status ?? 400 },
      );
    }
    throw error;
  }
}
