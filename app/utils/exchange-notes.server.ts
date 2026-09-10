// Notes, clues and guesses — the half of the exchange that happens between the
// draw and the reveal. Routes reach all of this through `exchanges.server.ts`,
// which re-exports it; this file exists so that module stays readable.
//
// The secrecy rules that shape everything here:
//   - An inbound note NEVER carries its sender. `senderId` is stored so the
//     allowance can be counted and a thread can be retired, and is stripped
//     from every projection.
//   - A note belongs to an ASSIGNMENT, not to a pair of people. A splice
//     retires the assignment, so a retired thread can never be re-attributed
//     to whoever inherited the person.
//   - Delivery is batched to one morning slot in the RECIPIENT's zone, and
//     every timestamp shown anywhere is coarsened to that slot.
//   - Nobody is ever told they were guessed.
import { data } from 'react-router';
import { type Prisma } from '@prisma/client';
import { prisma } from '#app/utils/db.server.ts';
import { canViewBirthday } from './birthday-visibility.server.ts';
import { EXCHANGE_STATUS, PARTICIPANT_STATUS } from './exchange-constants.ts';
import {
  coarsenToSlot,
  findPreset,
  nextMorningSlot,
  NOTE_DAILY_ALLOWANCE,
  NOTE_DIRECTION,
  NOTE_KIND,
  pendingSlotLabel,
  type NoteDirection,
  type NoteKind,
} from './exchange-notes.ts';
import { requireExchangeVisible } from './exchange-access.server.ts';
import {
  queueExchangeNotesDelivered,
  type DeliveredNoteBatch,
} from './exchange-notifications.server.ts';

type Db = Prisma.TransactionClient | typeof prisma;

const notFound = () => data({ error: 'Exchange not found.' }, { status: 404 });

export type ExchangeNoteSender = {
  id: string;
  name: string | null;
  username: string;
};

export type NoteView = {
  id: string;
  text: string;
  kind: NoteKind;
  /** Coarse slot label — never a time of day. */
  when: string;
  /** Still on its way. Only ever true for a note the viewer sent. */
  pending: boolean;
  /** Yours: right-aligned and teal. Theirs: left-aligned and unattributed. */
  mine: boolean;
  /** Thanks is the only note that carries a name. */
  from: { id: string; name: string | null; username: string } | null;
};

// Two threads, never merged (board §7). Each holds both sides of one
// conversation: what they said and what you said back. Within a thread your
// own notes are yours to see the moment you send them; theirs only exist once
// the morning batch has delivered them.
export type NoteThreads = {
  /** The conversation with whoever has you. Their half is never attributed. */
  fromYourGifter: NoteView[];
  /** The conversation with the person you drew. */
  toYourPerson: NoteView[];
  /** Shared between notes and clues, per exchange, per day. */
  remainingToday: number;
  /**
   * Which morning a note sent right now would land on, in the recipient's
   * zone — "tomorrow morning" usually, "this morning" for one written
   * overnight. The composer promises this, so it cannot be a guess.
   */
  nextDeliveryLabel: string;
};

export type ClueCandidate = {
  key: string;
  text: string;
  /** How many participants the recipient could still be choosing between. */
  narrowsTo: number;
  /** Offered anyway, flagged in red: declining is one tap. */
  uniquelyIdentifies: boolean;
};

export type GuessView = {
  guessedUser: { id: string; name: string | null; username: string } | null;
  changeCount: number;
};

const noteSenderVisible = (kind: string) => kind === NOTE_KIND.THANKS;

const capitalise = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function toNoteView(
  row: {
    id: string;
    kind: string;
    senderId: string;
    renderedText: string;
    scheduledFor: Date;
    deliveredAt: Date | null;
    sender: { id: string; name: string | null; username: string };
  },
  viewerId: string,
  now: Date,
  timeZone: string,
): NoteView {
  return {
    id: row.id,
    text: row.renderedText,
    kind: row.kind as NoteKind,
    when: row.deliveredAt
      ? coarsenToSlot(row.deliveredAt, now, timeZone)
      : // An overnight note lands the same morning, so it must not claim
        // otherwise: the composer's promise is the thing people plan around.
        capitalise(pendingSlotLabel(row.scheduledFor, now, timeZone)),
    pending: row.deliveredAt === null,
    mine: row.senderId === viewerId,
    from: noteSenderVisible(row.kind) ? row.sender : null,
  };
}

async function liveAssignment(db: Db, exchangeId: string, gifterId: string) {
  return db.exchangeAssignment.findFirst({
    where: { exchangeId, gifterId, supersededAt: null },
    select: { id: true, gifteeId: true },
  });
}

async function zoneOf(db: Db, userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timeZone: true },
  });
  return user?.timeZone ?? 'UTC';
}

// Counts against the sender's own calendar day: the allowance is a limit on
// them, so it resets when their day does, not the recipient's.
async function usedToday(
  db: Db,
  exchangeId: string,
  senderId: string,
  now: Date,
  senderZone: string,
): Promise<number> {
  // 48 hours, not 24: a local day is 25 hours long when the clocks go back,
  // so a 24-hour prefilter can drop notes sent earlier on the same date. The
  // date label below is what actually decides; this only bounds the scan.
  const dayStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const recent = await db.exchangeNote.findMany({
    where: {
      exchangeId,
      senderId,
      kind: { in: [NOTE_KIND.NOTE, NOTE_KIND.CLUE] },
      createdAt: { gte: dayStart },
    },
    select: { createdAt: true },
  });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(senderZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const label = today.format(now);
  return recent.filter((r) => today.format(r.createdAt) === label).length;
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export async function getNoteThreads({
  exchangeId,
  viewerId,
  now = new Date(),
}: {
  exchangeId: string;
  viewerId: string;
  now?: Date;
}): Promise<NoteThreads> {
  const viewerZone = await zoneOf(prisma, viewerId);
  const [mine, incoming] = await Promise.all([
    liveAssignment(prisma, exchangeId, viewerId),
    prisma.exchangeAssignment.findFirst({
      where: { exchangeId, gifteeId: viewerId, supersededAt: null },
      select: { id: true },
    }),
  ]);

  const noteSelect = {
    id: true,
    kind: true,
    senderId: true,
    renderedText: true,
    scheduledFor: true,
    deliveredAt: true,
    sender: { select: { id: true, name: true, username: true } },
  } as const;

  // You always see what you sent, pending or not. Everything else has to have
  // landed: showing an undelivered note would say when it was written.
  const readable = {
    OR: [{ senderId: viewerId }, { deliveredAt: { not: null } }],
  };

  const [gifterThread, personThread, used] = await Promise.all([
    incoming
      ? prisma.exchangeNote.findMany({
          where: { threadId: incoming.id, ...readable },
          select: noteSelect,
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    mine
      ? prisma.exchangeNote.findMany({
          where: { threadId: mine.id, ...readable },
          select: noteSelect,
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    usedToday(prisma, exchangeId, viewerId, now, viewerZone),
  ]);

  const view = (rows: typeof gifterThread) =>
    rows.map((r) => toNoteView(r, viewerId, now, viewerZone));

  // The slot belongs to whoever receives it, so the label is computed against
  // their zone and then described to the sender.
  const recipientId = mine
    ? (
        await prisma.exchangeAssignment.findUnique({
          where: { id: mine.id },
          select: { gifteeId: true },
        })
      )?.gifteeId
    : null;
  const recipientZone = recipientId
    ? await zoneOf(prisma, recipientId)
    : viewerZone;

  return {
    fromYourGifter: view(gifterThread),
    toYourPerson: view(personThread),
    remainingToday: Math.max(0, NOTE_DAILY_ALLOWANCE - used),
    nextDeliveryLabel: pendingSlotLabel(
      nextMorningSlot(now, recipientZone),
      now,
      recipientZone,
    ).replace('arrives ', ''),
  };
}

export type SendNoteInput = {
  exchangeId: string;
  senderId: string;
  direction: NoteDirection;
  kind: NoteKind;
  presetKey: string;
  now?: Date;
};

export async function sendNote({
  exchangeId,
  senderId,
  direction,
  kind,
  presetKey,
  now = new Date(),
}: SendNoteInput): Promise<NoteView> {
  // The visibility seam first, so someone who can't see this exchange learns
  // nothing from the shape of the refusal — one 404 for every reason.
  await requireExchangeVisible(senderId, exchangeId);

  const created = await prisma.$transaction(async (tx) => {
    // Every read goes through `tx`: a read on the shared client here would
    // queue behind this transaction's own write lock.
    const exchange = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { id: true, status: true },
    });
    if (!exchange) throw notFound();

    const thanks = kind === NOTE_KIND.THANKS;
    const allowedStatuses = thanks
      ? [EXCHANGE_STATUS.REVEALED]
      : [EXCHANGE_STATUS.DRAWN];
    if (!allowedStatuses.includes(exchange.status as never)) {
      throw data(
        {
          error: thanks
            ? 'Thank-yous open once the pairings are revealed.'
            : 'Notes run between the draw and the reveal.',
        },
        { status: 409 },
      );
    }

    // The thread is always the sender's own live assignment when they are the
    // gifter, and the assignment pointing AT them when they are the giftee.
    const assignment =
      direction === NOTE_DIRECTION.TO_GIFTEE
        ? await liveAssignment(tx, exchangeId, senderId)
        : await tx.exchangeAssignment.findFirst({
            where: { exchangeId, gifteeId: senderId, supersededAt: null },
            select: { id: true, gifteeId: true },
          });
    if (!assignment) {
      throw data({ error: "You're not in this exchange." }, { status: 403 });
    }

    // Clue text is DERIVED here, never accepted from the caller: it is built
    // from real data about the sender, so a crafted request must not be able
    // to put an arbitrary sentence — or someone else's true fact — in front
    // of the recipient. Re-deriving inside the transaction also means a clue
    // that stopped being true between opening the picker and sending is gone.
    const text =
      kind === NOTE_KIND.CLUE
        ? (
            await computeClueCandidates({
              exchangeId,
              viewerId: senderId,
              db: tx,
              now,
            })
          ).find((c) => c.key === presetKey)?.text
        : findPreset(direction, kind, presetKey)?.text;
    if (!text) {
      throw data({ error: 'Pick something to send.' }, { status: 400 });
    }

    const senderZone = await zoneOf(tx, senderId);
    if (!thanks) {
      // Rechecked inside the transaction: two taps in the same tick must not
      // both see two left.
      const used = await usedToday(tx, exchangeId, senderId, now, senderZone);
      if (used >= NOTE_DAILY_ALLOWANCE) {
        throw data(
          {
            error: `That's your ${NOTE_DAILY_ALLOWANCE} notes for today. You can send another tomorrow morning.`,
          },
          { status: 429 },
        );
      }
    }

    const recipientId =
      direction === NOTE_DIRECTION.TO_GIFTEE
        ? assignment.gifteeId
        : // The gifter of the assignment pointing at the sender.
          (
            await tx.exchangeAssignment.findUniqueOrThrow({
              where: { id: assignment.id },
              select: { gifterId: true },
            })
          ).gifterId;
    const recipientZone = await zoneOf(tx, recipientId);

    // A thank-you is attributed and expected, so it goes straight through;
    // everything else waits for the morning batch that anonymises it.
    const scheduledFor = thanks ? now : nextMorningSlot(now, recipientZone);

    return tx.exchangeNote.create({
      data: {
        exchangeId,
        threadId: assignment.id,
        senderId,
        direction,
        kind,
        presetKey,
        renderedText: text,
        // Explicit rather than the database default: the allowance counts
        // against the moment the note was sent, which is what `now` means.
        createdAt: now,
        scheduledFor,
        deliveredAt: thanks ? now : null,
      },
      select: {
        id: true,
        kind: true,
        threadId: true,
        senderId: true,
        renderedText: true,
        scheduledFor: true,
        deliveredAt: true,
        sender: { select: { id: true, name: true, username: true } },
      },
    });
  });

  // A thank-you is attributed, expected and already delivered, so the
  // delivery sweep never sees it — it has to announce itself.
  if (kind === NOTE_KIND.THANKS) {
    const thread = await prisma.exchangeAssignment.findUnique({
      where: { id: created.threadId },
      select: { gifterId: true },
    });
    if (thread) {
      queueExchangeNotesDelivered([
        {
          recipientId: thread.gifterId,
          exchangeId,
          noteId: created.id,
          thread: 'FROM_YOUR_PERSON',
          noteCount: 1,
        },
      ]);
    }
  }

  return toNoteView(created, senderId, now, await zoneOf(prisma, senderId));
}

// Clue text is built from things both people can check, so it must be true at
// the moment it is offered AND say exactly what the recipient will read — no
// paraphrase (board §16).
export async function computeClueCandidates({
  exchangeId,
  viewerId,
  db = prisma,
  now = new Date(),
}: {
  exchangeId: string;
  viewerId: string;
  db?: Db;
  now?: Date;
}): Promise<ClueCandidate[]> {
  const assignment = await liveAssignment(db, exchangeId, viewerId);
  if (!assignment) return [];
  const recipientId = assignment.gifteeId;

  // The field the recipient is choosing between: everyone still in, minus
  // themselves. The narrowing number is only honest against this list.
  const participants = await db.exchangeParticipant.findMany({
    where: {
      exchangeId,
      status: PARTICIPANT_STATUS.IN,
      userId: { not: recipientId },
    },
    select: { userId: true },
  });
  const candidateIds = participants.map((p) => p.userId);
  if (candidateIds.length === 0) return [];

  const [groupsOfRecipient, friendships, birthdays] = await Promise.all([
    db.usersInGiftGroups.findMany({
      where: { userId: recipientId },
      select: { giftGroupId: true },
    }),
    db.friendship.findMany({
      where: {
        OR: [
          { userAId: recipientId, userBId: { in: candidateIds } },
          { userBId: recipientId, userAId: { in: candidateIds } },
        ],
      },
      select: { userAId: true, userBId: true, createdAt: true },
    }),
    db.user.findMany({
      where: { id: { in: [...candidateIds, recipientId] } },
      select: { id: true, birthday: true, birthdayVisibility: true },
    }),
  ]);

  const recipientGroupIds = new Set(
    groupsOfRecipient.map((g) => g.giftGroupId),
  );
  const sharedGroupCounts = new Map<string, number>();
  if (recipientGroupIds.size > 0) {
    const rows = await db.usersInGiftGroups.findMany({
      where: {
        userId: { in: candidateIds },
        giftGroupId: { in: [...recipientGroupIds] },
      },
      select: { userId: true },
    });
    for (const r of rows) {
      sharedGroupCounts.set(
        r.userId,
        (sharedGroupCounts.get(r.userId) ?? 0) + 1,
      );
    }
  }

  const friendSince = new Map<string, number>();
  for (const f of friendships) {
    const otherId = f.userAId === recipientId ? f.userBId : f.userAId;
    friendSince.set(otherId, f.createdAt.getUTCFullYear());
  }

  const birthdayHalf = new Map<string, number | null>();
  for (const b of birthdays) {
    birthdayHalf.set(
      b.id,
      b.birthday ? (b.birthday.getUTCMonth() < 6 ? 1 : 2) : null,
    );
  }
  const birthdayVisibility = new Map(
    birthdays.map((b) => [b.id, b.birthdayVisibility]),
  );

  const candidates: ClueCandidate[] = [];
  const add = (
    key: string,
    text: string,
    matches: (candidateId: string) => boolean,
  ) => {
    const narrowsTo = candidateIds.filter(matches).length;
    if (narrowsTo === 0) return; // Not true of the sender either: not a clue.
    candidates.push({
      key,
      text,
      narrowsTo,
      uniquelyIdentifies: narrowsTo === 1,
    });
  };

  const myShared = sharedGroupCounts.get(viewerId) ?? 0;
  if (myShared > 0) {
    add(
      'shared-groups',
      myShared === 1
        ? "We're in one of the same groups."
        : `We're in ${numberWord(myShared)} of the same groups.`,
      (id) => (sharedGroupCounts.get(id) ?? 0) === myShared,
    );
  }

  const mySince = friendSince.get(viewerId);
  if (mySince) {
    add(
      'friends-since',
      `We've been friends on Gift Pool since ${mySince}.`,
      (id) => friendSince.get(id) === mySince,
    );
  }

  // A birthday clue is only truthful if the sender can actually see the
  // recipient's birthday — and offering it at all would otherwise leak that
  // birthday, since the clue appears only when the two halves match. Someone
  // who set their birthday to NOBODY must not be readable through the
  // presence of a clue. Same rule as every other birthday surface.
  const myHalf = birthdayHalf.get(viewerId) ?? null;
  const theirHalf = birthdayHalf.get(recipientId) ?? null;
  const canSeeRecipientBirthday = await canViewBirthdayOf({
    db,
    viewerId,
    targetId: recipientId,
    visibility: birthdayVisibility.get(recipientId) ?? 'FRIENDS',
  });
  if (myHalf && theirHalf && myHalf === theirHalf && canSeeRecipientBirthday) {
    // The narrowing figure is exactly what the RECIPIENT could work out for
    // themselves, so it counts only the candidates whose birthday they can
    // see. A count built from birthdays hidden from them would hand the
    // sender something nobody in the exchange is allowed to know.
    const visibleToRecipient = new Set<string>();
    await Promise.all(
      candidateIds.map(async (id) => {
        if (
          await canViewBirthdayOf({
            db,
            viewerId: recipientId,
            targetId: id,
            visibility: birthdayVisibility.get(id) ?? 'FRIENDS',
          })
        ) {
          visibleToRecipient.add(id);
        }
      }),
    );
    add(
      'birthday-half',
      'My birthday is in the same half of the year as yours.',
      (id) => visibleToRecipient.has(id) && birthdayHalf.get(id) === theirHalf,
    );
  }

  return candidates;
}

// The repo's one birthday rule, applied to a pair. `canViewBirthday` is pure,
// so the facts are gathered here.
async function canViewBirthdayOf({
  db,
  viewerId,
  targetId,
  visibility,
}: {
  db: Db;
  viewerId: string;
  targetId: string;
  visibility: string;
}): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (visibility === 'NOBODY') return false;
  const [pair] = await Promise.all([
    db.friendship.findFirst({
      where: {
        OR: [
          { userAId: viewerId, userBId: targetId },
          { userAId: targetId, userBId: viewerId },
        ],
      },
      select: { id: true },
    }),
  ]);
  const sharedGroup = await db.usersInGiftGroups.findFirst({
    where: {
      userId: targetId,
      shareBirthday: true,
      removedAt: null,
      giftGroup: {
        groupMembers: { some: { userId: viewerId, removedAt: null } },
      },
    },
    select: { userId: true },
  });
  return canViewBirthday(
    { birthdayVisibility: visibility },
    {
      isDirectFriend: pair !== null,
      // Friend-of-friend is not computed here: a clue is a stronger signal
      // than a profile view, so this errs towards not offering one.
      isMutualFriend: false,
      sharesActiveBirthdayGroup: sharedGroup !== null,
    },
  );
}

function numberWord(n: number): string {
  return (
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][n] ??
    String(n)
  );
}

// One active guess, changeable until the reveal. The candidate list includes
// the person the guesser drew — excluding them would leak that they can't be
// the guesser's gifter (board §18).
export async function setGuess({
  exchangeId,
  guesserId,
  guessedUserId,
  now = new Date(),
}: {
  exchangeId: string;
  guesserId: string;
  guessedUserId: string;
  now?: Date;
}): Promise<GuessView> {
  // Same seam as `sendNote`: an outsider must not be able to tell a live
  // drawn exchange from a missing one by the shape of the refusal.
  await requireExchangeVisible(guesserId, exchangeId);

  return prisma.$transaction(async (tx) => {
    const exchange = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { status: true },
    });
    if (exchange?.status !== EXCHANGE_STATUS.DRAWN) {
      throw data(
        { error: 'Guessing is open between the draw and the reveal.' },
        { status: 409 },
      );
    }
    if (guessedUserId === guesserId) {
      throw data({ error: "You can't have drawn yourself." }, { status: 400 });
    }
    const [guesser, guessed] = await Promise.all([
      tx.exchangeParticipant.findUnique({
        where: { exchangeId_userId: { exchangeId, userId: guesserId } },
        select: { status: true },
      }),
      tx.exchangeParticipant.findUnique({
        where: { exchangeId_userId: { exchangeId, userId: guessedUserId } },
        select: { status: true },
      }),
    ]);
    if (
      guesser?.status !== PARTICIPANT_STATUS.IN ||
      guessed?.status !== PARTICIPANT_STATUS.IN
    ) {
      throw data({ error: "They're not in this exchange." }, { status: 400 });
    }

    const existing = await tx.exchangeGuess.findUnique({
      where: { exchangeId_guesserId: { exchangeId, guesserId } },
      select: { id: true, guessedUserId: true, changeCount: true },
    });
    const row = existing
      ? await tx.exchangeGuess.update({
          where: { id: existing.id },
          data: {
            guessedUserId,
            // Landing back on the same person isn't a change of mind.
            changeCount:
              existing.guessedUserId === guessedUserId
                ? existing.changeCount
                : existing.changeCount + 1,
          },
          select: {
            changeCount: true,
            guessedUser: { select: { id: true, name: true, username: true } },
          },
        })
      : await tx.exchangeGuess.create({
          data: {
            exchangeId,
            guesserId,
            guessedUserId,
            firstGuessedUserId: guessedUserId,
            firstGuessedAt: now,
          },
          select: {
            changeCount: true,
            guessedUser: { select: { id: true, name: true, username: true } },
          },
        });
    return { guessedUser: row.guessedUser, changeCount: row.changeCount };
  });
}

// Only ever the viewer's own guess. Nobody is told they were guessed, and the
// change count is stored for the scoreboard but shown to no one before the
// reveal.
export async function getOwnGuess({
  exchangeId,
  viewerId,
}: {
  exchangeId: string;
  viewerId: string;
}): Promise<GuessView | null> {
  const row = await prisma.exchangeGuess.findUnique({
    where: { exchangeId_guesserId: { exchangeId, guesserId: viewerId } },
    select: {
      changeCount: true,
      guessedUser: { select: { id: true, name: true, username: true } },
    },
  });
  return row
    ? { guessedUser: row.guessedUser, changeCount: row.changeCount }
    : null;
}

export type NoteDeliverySweepSummary = {
  delivered: number;
  failed: number;
};

// Run hourly by the exchange sweep: every note whose morning has arrived is
// delivered together, which is what makes any single one anonymous.
export async function runNoteDeliverySweep({
  now = new Date(),
}: { now?: Date } = {}): Promise<NoteDeliverySweepSummary> {
  const due = await prisma.exchangeNote.findMany({
    // A note is only worth delivering while there is a thread to read it in.
    // If the exchange revealed or was cancelled first — the auto-reveal sweep
    // runs in the same hour — or the recipient was spliced out, telling them
    // about a note they cannot open is worse than silence.
    where: {
      deliveredAt: null,
      scheduledFor: { lte: now },
      exchange: { status: EXCHANGE_STATUS.DRAWN },
      thread: { supersededAt: null },
    },
    select: {
      id: true,
      exchangeId: true,
      direction: true,
      thread: { select: { gifterId: true, gifteeId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (due.length === 0) return { delivered: 0, failed: 0 };
  const result = await prisma.exchangeNote.updateMany({
    where: { id: { in: due.map((d) => d.id) }, deliveredAt: null },
    data: { deliveredAt: now },
  });

  // One notification per person per thread per morning. Told only after the
  // delivery has committed, and fire-and-forget: a fan-out failure must not
  // turn a delivered batch into an undelivered one.
  const batches = new Map<string, DeliveredNoteBatch>();
  for (const note of due) {
    const toGiftee = note.direction === NOTE_DIRECTION.TO_GIFTEE;
    const recipientId = toGiftee ? note.thread.gifteeId : note.thread.gifterId;
    const thread = toGiftee ? 'FROM_YOUR_GIFTER' : 'FROM_YOUR_PERSON';
    const key = `${recipientId}:${note.exchangeId}:${thread}`;
    const existing = batches.get(key);
    batches.set(key, {
      recipientId,
      exchangeId: note.exchangeId,
      noteId: note.id,
      thread,
      noteCount: (existing?.noteCount ?? 0) + 1,
    });
  }
  queueExchangeNotesDelivered([...batches.values()]);

  return { delivered: result.count, failed: due.length - result.count };
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

export type ScoreboardAward = {
  kind: 'BEST_GUESSER' | 'UNGUESSABLE' | 'MOST_ACCUSED' | 'WAVERED';
  /** The label under the person, e.g. "Best guesser". */
  title: string;
  /** A sentence about them, never a metric. */
  line: string;
  person: { id: string; name: string | null; username: string };
};

export type Scoreboard = {
  awards: ScoreboardAward[];
  /** Null on a secret-forever exchange — see `computeScoreboard`. */
  correctCount: number | null;
  guesserCount: number;
  participantCount: number;
  /** "2 of 5 guessed right this year." */
  summary: string;
};

const displayName = (p: { name: string | null; username: string }) =>
  p.name ?? p.username;

const timesWord = (n: number) =>
  n === 1 ? 'once' : n === 2 ? 'twice' : `${numberWord(n)} times`;

// Written as sentences about people rather than metrics (board §3):
// "Wavered" is affectionate, and nothing here is a ranking anyone loses.
//
// A SECRET_FOREVER exchange keeps the scoreboard and drops the loop, so the
// awards it shows must state right and wrong WITHOUT implying a pairing:
// "most accused — one of them was right" would tell three people that one of
// them is holding the answer. That award is revealed-only.
export async function computeScoreboard({
  exchangeId,
  secretForever = false,
}: {
  exchangeId: string;
  secretForever?: boolean;
}): Promise<Scoreboard> {
  const [assignments, guesses, participants] = await Promise.all([
    prisma.exchangeAssignment.findMany({
      where: { exchangeId, supersededAt: null },
      select: { gifterId: true, gifteeId: true },
    }),
    prisma.exchangeGuess.findMany({
      where: { exchangeId },
      select: {
        guesserId: true,
        guessedUserId: true,
        changeCount: true,
        firstGuessedAt: true,
        firstGuessedUserId: true,
        guesser: { select: { id: true, name: true, username: true } },
        guessedUser: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.exchangeParticipant.findMany({
      where: { exchangeId, status: PARTICIPANT_STATUS.IN },
      select: { user: { select: { id: true, name: true, username: true } } },
    }),
  ]);

  // Who actually had each person: gifteeId → gifterId.
  const gifterOf = new Map(assignments.map((a) => [a.gifteeId, a.gifterId]));
  const correct = guesses.filter(
    (g) => gifterOf.get(g.guesserId) === g.guessedUserId,
  );

  const awards: ScoreboardAward[] = [];

  // Best guesser: right, and least helped by changing their mind. Ties go to
  // whoever landed on it first.
  // Naming a correct guesser is naming a pairing. They remember who they put
  // down, so "Guessed right" hands them their own gifter — the exact fact
  // `didGuessRight` refuses to compute here. The board's finished frame does
  // show this award, but its own promise ("not now, not next year, not to
  // Francisco") is the stronger of the two, and it wins.
  const best = secretForever
    ? undefined
    : [...correct].sort(
        (a, b) =>
          a.changeCount - b.changeCount ||
          a.firstGuessedAt.getTime() - b.firstGuessedAt.getTime(),
      )[0];
  if (best) {
    const firstTry =
      best.changeCount === 0 && best.firstGuessedUserId === best.guessedUserId;
    awards.push({
      kind: 'BEST_GUESSER',
      title: 'Best guesser',
      line: firstTry
        ? 'Got it first try'
        : `Got there after changing their mind ${timesWord(best.changeCount)}`,
      person: best.guesser,
    });
  }

  // Unguessable: in the exchange, and nobody put their name down.
  const accusedIds = new Set(guesses.map((g) => g.guessedUserId));
  const unguessed = participants
    .map((p) => p.user)
    .filter((user) => !accusedIds.has(user.id));
  if (unguessed.length > 0 && guesses.length > 0) {
    awards.push({
      kind: 'UNGUESSABLE',
      title: 'Unguessable',
      line: 'Nobody guessed them',
      person: unguessed[0]!,
    });
  }

  if (!secretForever) {
    // Most accused: the name most people wrote down.
    const accusations = new Map<string, typeof guesses>();
    for (const g of guesses) {
      accusations.set(g.guessedUserId, [
        ...(accusations.get(g.guessedUserId) ?? []),
        g,
      ]);
    }
    const [mostAccusedId, theirAccusers] =
      [...accusations.entries()].sort((a, b) => b[1].length - a[1].length)[0] ??
      [];
    if (mostAccusedId && theirAccusers && theirAccusers.length > 1) {
      const rightOnes = theirAccusers.filter(
        (g) => gifterOf.get(g.guesserId) === g.guessedUserId,
      ).length;
      awards.push({
        kind: 'MOST_ACCUSED',
        title: 'Most accused',
        line: `${capitalise(numberWord(theirAccusers.length))} people accused them. ${
          rightOnes === 0
            ? 'None of them was right'
            : rightOnes === 1
              ? 'One was right'
              : `${capitalise(numberWord(rightOnes))} were right`
        }`,
        person: theirAccusers[0]!.guessedUser,
      });
    }
  }

  // Wavered: affectionate, never a ranking anyone loses.
  const wavered = [...guesses].sort((a, b) => b.changeCount - a.changeCount)[0];
  if (wavered && wavered.changeCount > 1) {
    awards.push({
      kind: 'WAVERED',
      title: 'Wavered',
      line: `Changed their mind ${timesWord(wavered.changeCount)}`,
      person: wavered.guesser,
    });
  }

  // "4 of 5 guessed right" is invertible when everybody played: each of the
  // five would learn whether they were one of the four. A secret-forever
  // exchange therefore counts who played, not who was right.
  const summary =
    guesses.length === 0
      ? 'Nobody put a name down this year.'
      : secretForever
        ? `${guesses.length} of ${participants.length} put a name down this year.`
        : `${correct.length} of ${participants.length} guessed right this year.`;

  return {
    awards,
    // Withheld entirely under secret-forever: the page must not be able to
    // reconstruct who was right from what it was given.
    correctCount: secretForever ? null : correct.length,
    guesserCount: guesses.length,
    participantCount: participants.length,
    summary,
  };
}

// A thank-you is one-way and one-time in the UI: knowing it was sent is what
// turns the composer into a receipt.
export async function hasSentThanks({
  exchangeId,
  viewerId,
}: {
  exchangeId: string;
  viewerId: string;
}): Promise<boolean> {
  const row = await prisma.exchangeNote.findFirst({
    where: { exchangeId, senderId: viewerId, kind: NOTE_KIND.THANKS },
    select: { id: true },
  });
  return row !== null;
}

// The thank-you their giftee sent them, if any. Attributed by design: the
// exchange is over, so there is nothing left to give away.
export async function getThanksReceived({
  exchangeId,
  viewerId,
}: {
  exchangeId: string;
  viewerId: string;
}): Promise<{ text: string; from: ExchangeNoteSender } | null> {
  const row = await prisma.exchangeNote.findFirst({
    where: {
      exchangeId,
      kind: NOTE_KIND.THANKS,
      thread: { gifterId: viewerId, supersededAt: null },
    },
    select: {
      renderedText: true,
      sender: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return row ? { text: row.renderedText, from: row.sender } : null;
}

// Whether the viewer called it. REVEALED only — on a secret-forever exchange
// this would hand someone their own pairing, which is the one thing that page
// promises never to show.
export async function didGuessRight({
  exchangeId,
  viewerId,
}: {
  exchangeId: string;
  viewerId: string;
}): Promise<boolean | null> {
  const [guess, assignment] = await Promise.all([
    prisma.exchangeGuess.findUnique({
      where: { exchangeId_guesserId: { exchangeId, guesserId: viewerId } },
      select: { guessedUserId: true },
    }),
    prisma.exchangeAssignment.findFirst({
      where: { exchangeId, gifteeId: viewerId, supersededAt: null },
      select: { gifterId: true },
    }),
  ]);
  if (!guess || !assignment) return null;
  return guess.guessedUserId === assignment.gifterId;
}
