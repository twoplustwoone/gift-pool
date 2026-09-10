/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: vi.fn(),
  queueExchangeNamesDrawn: vi.fn(),
  queueExchangeRevealed: vi.fn(),
  queueExchangeCancelled: vi.fn(),
  queueExchangeNotesDelivered: vi.fn(),
  queueExchangeSpliceNotices: vi.fn(),
}));

import { EXCHANGE_STATUS } from './exchange-constants.ts';
import { NOTE_DIRECTION, NOTE_KIND } from './exchange-notes.ts';
import {
  computeClueCandidates,
  computeScoreboard,
  didGuessRight,
  getThanksReceived,
  getNoteThreads,
  getOwnGuess,
  runNoteDeliverySweep,
  sendNote,
  setGuess,
} from './exchange-notes.server.ts';
import {
  createExchange,
  drawNames,
  setParticipation,
} from './exchanges.server.ts';

vi.setConfig({ testTimeout: 20_000 });

const NOW = new Date('2026-12-12T19:00:00Z'); // 14:00 in New York
const EVENT = new Date('2026-12-24T00:00:00Z');
const NY = 'America/New_York';

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; init?: { status?: number } };
  return e?.init?.status ?? e?.status;
};

async function makeUser(name: string) {
  return prisma.user.create({
    data: { ...createUser(), name, timeZone: NY },
    select: { id: true, name: true },
  });
}

function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Fixture = Awaited<ReturnType<typeof makeDrawnExchange>>;

async function makeDrawnExchange() {
  const [organizer, a, b, c] = await Promise.all([
    makeUser('Francisco'),
    makeUser('Nicolas P'),
    makeUser('Nicolas B'),
    makeUser('Agustin'),
  ]);
  const group = await prisma.giftGroup.create({
    data: {
      name: 'The Painted',
      groupMembers: {
        create: [organizer, a, b, c].map((u, i) => ({
          userId: u.id,
          role: i === 0 ? 'OWNER' : 'MEMBER',
        })),
      },
    },
    select: { id: true },
  });
  const { id } = await createExchange({
    organizerId: organizer.id,
    title: 'The Painted 2026',
    eventDate: EVENT,
    giftGroupId: group.id,
    now: NOW,
  });
  for (const u of [a, b, c]) {
    await setParticipation({
      exchangeId: id,
      userId: u.id,
      status: 'IN',
      now: NOW,
    });
  }
  await drawNames({
    exchangeId: id,
    actorId: organizer.id,
    now: NOW,
    rng: seededRng(7),
  });
  const pairs = await prisma.exchangeAssignment.findMany({
    where: { exchangeId: id, supersededAt: null },
    select: { gifterId: true, gifteeId: true },
  });
  return { id, group, organizer, a, b, c, pairs };
}

let f: Fixture;
beforeEach(async () => {
  f = await makeDrawnExchange();
});

const gifteeOf = (f: Fixture, gifterId: string) =>
  f.pairs.find((p) => p.gifterId === gifterId)!.gifteeId;
const gifterOf = (f: Fixture, gifteeId: string) =>
  f.pairs.find((p) => p.gifteeId === gifteeId)!.gifterId;

describe('sendNote', () => {
  it("holds a note until the recipient's morning, and never names the sender", async () => {
    const sender = f.a;
    const recipient = gifteeOf(f, sender.id);
    await sendNote({
      exchangeId: f.id,
      senderId: sender.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    });

    // Nothing has landed yet, so the recipient's thread is still empty.
    const before = await getNoteThreads({
      exchangeId: f.id,
      viewerId: recipient,
      now: NOW,
    });
    expect(before.fromYourGifter).toHaveLength(0);

    const row = await prisma.exchangeNote.findFirstOrThrow({
      where: { exchangeId: f.id },
    });
    expect(row.scheduledFor.toISOString()).toBe('2026-12-13T14:00:00.000Z');

    await runNoteDeliverySweep({ now: new Date('2026-12-13T14:00:00Z') });

    const after = await getNoteThreads({
      exchangeId: f.id,
      viewerId: recipient,
      now: new Date('2026-12-13T15:00:00Z'),
    });
    expect(after.fromYourGifter).toHaveLength(1);
    expect(after.fromYourGifter[0]!.text).toBe("I've got your gift.");
    // The whole point: a note from your gifter carries no sender.
    expect(after.fromYourGifter[0]!.from).toBeNull();
    expect(after.fromYourGifter[0]!.mine).toBe(false);
    expect(JSON.stringify(after.fromYourGifter)).not.toContain(sender.id);
    // And no time of day, ever.
    expect(after.fromYourGifter[0]!.when).toBe('This morning');
  });

  it('shows the sender their own pending note before it lands', async () => {
    const sender = f.a;
    await sendNote({
      exchangeId: f.id,
      senderId: sender.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    });
    const threads = await getNoteThreads({
      exchangeId: f.id,
      viewerId: sender.id,
      now: NOW,
    });
    expect(threads.toYourPerson).toHaveLength(1);
    expect(threads.toYourPerson[0]!.pending).toBe(true);
    expect(threads.toYourPerson[0]!.mine).toBe(true);
    expect(threads.remainingToday).toBe(2);
  });

  it('stops at three a day, counting notes and clues together', async () => {
    const sender = f.a;
    for (const key of ['got-it', 'breadbox', 'insufferable']) {
      await sendNote({
        exchangeId: f.id,
        senderId: sender.id,
        direction: NOTE_DIRECTION.TO_GIFTEE,
        kind: NOTE_KIND.NOTE,
        presetKey: key,
        now: NOW,
      });
    }
    let caught: unknown;
    try {
      await sendNote({
        exchangeId: f.id,
        senderId: sender.id,
        direction: NOTE_DIRECTION.TO_GIFTEE,
        kind: NOTE_KIND.CLUE,
        presetKey: 'shared-groups',
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(429);
    const threads = await getNoteThreads({
      exchangeId: f.id,
      viewerId: sender.id,
      now: NOW,
    });
    expect(threads.remainingToday).toBe(0);

    // The next day it resets.
    const tomorrow = new Date('2026-12-13T19:00:00Z');
    const fresh = await getNoteThreads({
      exchangeId: f.id,
      viewerId: sender.id,
      now: tomorrow,
    });
    expect(fresh.remainingToday).toBe(3);
  });

  it('refuses a preset that belongs to the other direction', async () => {
    let caught: unknown;
    try {
      await sendNote({
        exchangeId: f.id,
        senderId: f.a.id,
        direction: NOTE_DIRECTION.TO_GIFTER,
        kind: NOTE_KIND.NOTE,
        presetKey: 'got-it', // a gifter's words, sent back up the loop
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(400);
  });

  it('will not carry a note before the draw or after the reveal', async () => {
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.REVEALED },
    });
    let caught: unknown;
    try {
      await sendNote({
        exchangeId: f.id,
        senderId: f.a.id,
        direction: NOTE_DIRECTION.TO_GIFTEE,
        kind: NOTE_KIND.NOTE,
        presetKey: 'got-it',
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(409);
  });

  it('delivers a thank-you at once, with a name on it', async () => {
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.REVEALED },
    });
    const giftee = f.a;
    const note = await sendNote({
      exchangeId: f.id,
      senderId: giftee.id,
      direction: NOTE_DIRECTION.TO_GIFTER,
      kind: NOTE_KIND.THANKS,
      presetKey: 'loved-it',
      now: NOW,
    });
    expect(note.pending).toBe(false);
    // The only note that carries a name.
    expect(note.from?.id).toBe(giftee.id);

    const gifter = gifterOf(f, giftee.id);
    const threads = await getNoteThreads({
      exchangeId: f.id,
      viewerId: gifter,
      now: NOW,
    });
    // It lands in the gifter's conversation with the person they drew,
    // attributed — the one note that carries a name.
    const thanks = threads.toYourPerson.find((n) => n.kind === 'THANKS');
    expect(thanks?.from?.id).toBe(giftee.id);
    expect(thanks?.mine).toBe(false);
  });
});

it('will not send a clue the sender cannot actually claim', async () => {
  // The picker's text is derived from real data. A crafted request naming a
  // clue that isn't true of this sender must not put a sentence — or
  // somebody else's true fact — in front of the recipient.
  let caught: unknown;
  try {
    await sendNote({
      exchangeId: f.id,
      senderId: f.a.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.CLUE,
      presetKey: 'friends-since', // no friendship exists in this fixture
      now: NOW,
    });
  } catch (err) {
    caught = err;
  }
  expect(statusOf(caught)).toBe(400);
  expect(await prisma.exchangeNote.count({ where: { exchangeId: f.id } })).toBe(
    0,
  );
});

it('stores the clue text the server derived, not anything sent to it', async () => {
  await sendNote({
    exchangeId: f.id,
    senderId: f.a.id,
    direction: NOTE_DIRECTION.TO_GIFTEE,
    kind: NOTE_KIND.CLUE,
    presetKey: 'shared-groups',
    now: NOW,
  });
  const row = await prisma.exchangeNote.findFirstOrThrow({
    where: { exchangeId: f.id },
  });
  expect(row.renderedText).toBe("We're in one of the same groups.");
});

it('gives an outsider the same 404 as a missing exchange, whatever the status', async () => {
  // The refusal must not describe the exchange to someone who cannot see
  // it: a status-shaped error would confirm it exists.
  const outsider = await makeUser('Outsider');
  const attempt = (exchangeId: string) =>
    sendNote({
      exchangeId,
      senderId: outsider.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    }).catch((err: unknown) => err);

  const real = await attempt(f.id);
  const imaginary = await attempt('does-not-exist');
  expect(statusOf(real)).toBe(404);
  expect(statusOf(imaginary)).toBe(404);
  expect((real as { data: unknown }).data).toEqual(
    (imaginary as { data: unknown }).data,
  );
});

it('promises the morning it will actually arrive', async () => {
  // Written at 02:04 in New York: it lands seven hours later, this morning,
  // so telling the sender "tomorrow" would be a lie they plan around.
  const overnight = new Date('2026-12-13T07:04:00Z');
  const note = await sendNote({
    exchangeId: f.id,
    senderId: f.a.id,
    direction: NOTE_DIRECTION.TO_GIFTEE,
    kind: NOTE_KIND.NOTE,
    presetKey: 'got-it',
    now: overnight,
  });
  expect(note.when).toBe('Arrives this morning');

  const evening = await sendNote({
    exchangeId: f.id,
    senderId: f.b.id,
    direction: NOTE_DIRECTION.TO_GIFTEE,
    kind: NOTE_KIND.NOTE,
    presetKey: 'got-it',
    now: new Date('2026-12-13T19:00:00Z'),
  });
  expect(evening.when).toBe('Arrives tomorrow morning');
});

describe('computeClueCandidates', () => {
  it('says exactly what the recipient will read, and how far it narrows', async () => {
    const sender = f.a;
    const recipient = gifteeOf(f, sender.id);
    // Everyone is in one group together, so that clue narrows to nobody in
    // particular; a friendship is the one thing that sets this pair apart.
    await prisma.friendship.create({
      data: {
        userAId: [sender.id, recipient].sort()[0]!,
        userBId: [sender.id, recipient].sort()[1]!,
        createdAt: new Date('2024-03-01T00:00:00Z'),
      },
    });

    const clues = await computeClueCandidates({
      exchangeId: f.id,
      viewerId: sender.id,
      now: NOW,
    });

    const friends = clues.find((c) => c.key === 'friends-since');
    expect(friends?.text).toBe("We've been friends on Gift Pool since 2024.");
    expect(friends?.narrowsTo).toBe(1);
    // Offered, not withheld — but flagged, so declining is one tap.
    expect(friends?.uniquelyIdentifies).toBe(true);

    const groups = clues.find((c) => c.key === 'shared-groups');
    expect(groups?.text).toBe("We're in one of the same groups.");
    // Everyone in the exchange shares the group, so it gives nothing away.
    expect(groups?.narrowsTo).toBe(3);
    expect(groups?.uniquelyIdentifies).toBe(false);
  });

  it('will not offer a birthday clue about a birthday the sender cannot see', async () => {
    // The clue only appears when the two halves match, so offering it at all
    // would tell the sender which half the recipient's birthday is in — even
    // when that person set their birthday to NOBODY.
    const sender = f.a;
    const recipient = gifteeOf(f, sender.id);
    const june = new Date('1990-02-02T00:00:00Z');
    await prisma.user.update({
      where: { id: sender.id },
      data: { birthday: june, birthdayVisibility: 'EVERYONE' },
    });
    await prisma.user.update({
      where: { id: recipient },
      data: { birthday: june, birthdayVisibility: 'NOBODY' },
    });

    const hidden = await computeClueCandidates({
      exchangeId: f.id,
      viewerId: sender.id,
      now: NOW,
    });
    expect(hidden.map((c) => c.key)).not.toContain('birthday-half');

    // Shared with the group, the same clue becomes available.
    await prisma.user.update({
      where: { id: recipient },
      data: { birthdayVisibility: 'EVERYONE' },
    });
    const shown = await computeClueCandidates({
      exchangeId: f.id,
      viewerId: sender.id,
      now: NOW,
    });
    expect(shown.map((c) => c.key)).toContain('birthday-half');
  });

  it('offers nothing to someone with no assignment', async () => {
    expect(
      await computeClueCandidates({
        exchangeId: f.id,
        viewerId: f.organizer.id,
        now: NOW,
      }),
    ).toBeDefined();
    const outsider = await makeUser('Outsider');
    expect(
      await computeClueCandidates({
        exchangeId: f.id,
        viewerId: outsider.id,
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe('setGuess', () => {
  it('keeps the last answer and counts the changes of mind', async () => {
    const guesser = f.a;
    await setGuess({
      exchangeId: f.id,
      guesserId: guesser.id,
      guessedUserId: f.b.id,
      now: NOW,
    });
    await setGuess({
      exchangeId: f.id,
      guesserId: guesser.id,
      guessedUserId: f.c.id,
      now: NOW,
    });
    // Landing back on the same person isn't a change of mind.
    const third = await setGuess({
      exchangeId: f.id,
      guesserId: guesser.id,
      guessedUserId: f.c.id,
      now: NOW,
    });
    expect(third.guessedUser?.id).toBe(f.c.id);
    expect(third.changeCount).toBe(1);

    const row = await prisma.exchangeGuess.findFirstOrThrow({
      where: { exchangeId: f.id, guesserId: guesser.id },
    });
    expect(row.firstGuessedUserId).toBe(f.b.id);
  });

  it('lets someone guess the person they drew', async () => {
    // Excluding them would tell the guesser their own giftee can't have them,
    // which is a pairing fact they were never given.
    const guesser = f.a;
    const own = gifteeOf(f, guesser.id);
    const guess = await setGuess({
      exchangeId: f.id,
      guesserId: guesser.id,
      guessedUserId: own,
      now: NOW,
    });
    expect(guess.guessedUser?.id).toBe(own);
  });

  it('gives an outsider the same 404 as a missing exchange', async () => {
    const outsider = await makeUser('Outsider');
    const attempt = (exchangeId: string) =>
      setGuess({
        exchangeId,
        guesserId: outsider.id,
        guessedUserId: f.b.id,
        now: NOW,
      }).catch((err: unknown) => err);
    const real = await attempt(f.id);
    const imaginary = await attempt('does-not-exist');
    expect(statusOf(real)).toBe(404);
    expect(statusOf(imaginary)).toBe(404);
    expect((real as { data: unknown }).data).toEqual(
      (imaginary as { data: unknown }).data,
    );
  });

  it('refuses the guesser themselves', async () => {
    let caught: unknown;
    try {
      await setGuess({
        exchangeId: f.id,
        guesserId: f.a.id,
        guessedUserId: f.a.id,
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(400);
  });

  it('tells nobody they were guessed', async () => {
    await setGuess({
      exchangeId: f.id,
      guesserId: f.a.id,
      guessedUserId: f.b.id,
      now: NOW,
    });
    // The person guessed has no way to see it.
    expect(
      await getOwnGuess({ exchangeId: f.id, viewerId: f.b.id }),
    ).toBeNull();
    expect(
      (await getOwnGuess({ exchangeId: f.id, viewerId: f.a.id }))?.guessedUser
        ?.id,
    ).toBe(f.b.id);
  });

  it('closes once the pairings are out', async () => {
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.REVEALED },
    });
    let caught: unknown;
    try {
      await setGuess({
        exchangeId: f.id,
        guesserId: f.a.id,
        guessedUserId: f.b.id,
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(409);
  });
});

describe('runNoteDeliverySweep', () => {
  it('leaves a note alone once its exchange is no longer readable', async () => {
    // The auto-reveal sweep runs in the same hour. A note delivered into a
    // revealed exchange would notify someone about a thread that is gone.
    await sendNote({
      exchangeId: f.id,
      senderId: f.a.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    });
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.REVEALED },
    });

    expect(
      await runNoteDeliverySweep({ now: new Date('2026-12-13T14:00:00Z') }),
    ).toEqual({ delivered: 0, failed: 0 });
    const row = await prisma.exchangeNote.findFirstOrThrow({
      where: { exchangeId: f.id },
    });
    expect(row.deliveredAt).toBeNull();
  });

  it('leaves a note alone once its thread has been spliced away', async () => {
    await sendNote({
      exchangeId: f.id,
      senderId: f.a.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    });
    await prisma.exchangeAssignment.updateMany({
      where: { exchangeId: f.id, gifterId: f.a.id },
      data: { supersededAt: NOW },
    });

    expect(
      await runNoteDeliverySweep({ now: new Date('2026-12-13T14:00:00Z') }),
    ).toEqual({ delivered: 0, failed: 0 });
  });

  it('delivers only what is due, and is a no-op on a second run', async () => {
    await sendNote({
      exchangeId: f.id,
      senderId: f.a.id,
      direction: NOTE_DIRECTION.TO_GIFTEE,
      kind: NOTE_KIND.NOTE,
      presetKey: 'got-it',
      now: NOW,
    });

    // An hour later nothing is due yet.
    expect(
      await runNoteDeliverySweep({ now: new Date('2026-12-12T20:00:00Z') }),
    ).toEqual({ delivered: 0, failed: 0 });

    expect(
      await runNoteDeliverySweep({ now: new Date('2026-12-13T14:00:00Z') }),
    ).toEqual({ delivered: 1, failed: 0 });
    expect(
      await runNoteDeliverySweep({ now: new Date('2026-12-13T15:00:00Z') }),
    ).toEqual({ delivered: 0, failed: 0 });
  });
});

describe('computeScoreboard', () => {
  // The drawn cycle is random, and which awards are even possible depends on
  // it — so this suite pins the loop to organizer → a → b → c → organizer and
  // plays a known game on top of it. Everyone accuses the organizer: a is
  // right (the organizer really does have them), b and c are wrong, and c
  // changes their mind twice on the way there.
  async function playOut() {
    const order = [f.organizer, f.a, f.b, f.c];
    await prisma.exchangeAssignment.deleteMany({ where: { exchangeId: f.id } });
    await prisma.exchangeAssignment.createMany({
      data: order.map((gifter, i) => ({
        exchangeId: f.id,
        gifterId: gifter.id,
        gifteeId: order[(i + 1) % order.length]!.id,
      })),
    });

    await setGuess({
      exchangeId: f.id,
      guesserId: f.a.id,
      guessedUserId: f.organizer.id, // right: the organizer has a
      now: NOW,
    });
    await setGuess({
      exchangeId: f.id,
      guesserId: f.b.id,
      guessedUserId: f.organizer.id, // wrong: a has b
      now: NOW,
    });
    // c dithers before landing on the same wrong answer.
    await setGuess({
      exchangeId: f.id,
      guesserId: f.c.id,
      guessedUserId: f.a.id,
      now: NOW,
    });
    await setGuess({
      exchangeId: f.id,
      guesserId: f.c.id,
      guessedUserId: f.b.id,
      now: NOW,
    });
    await setGuess({
      exchangeId: f.id,
      guesserId: f.c.id,
      guessedUserId: f.organizer.id, // wrong: b has c
      now: NOW,
    });
  }

  it('reads as sentences about people, and counts who called it', async () => {
    await playOut();
    const board = await computeScoreboard({ exchangeId: f.id });

    const best = board.awards.find((a) => a.kind === 'BEST_GUESSER');
    expect(best?.person.id).toBe(f.a.id);
    expect(best?.line).toBe('Got it first try');
    expect(board.correctCount).toBe(1);
    expect(board.summary).toBe('1 of 4 guessed right this year.');
    // All three put the organizer's name down; one of them was right.
    const accused = board.awards.find((a) => a.kind === 'MOST_ACCUSED');
    expect(accused?.person.id).toBe(f.organizer.id);
    expect(accused?.line).toBe('Three people accused them. One was right');

    const wavered = board.awards.find((a) => a.kind === 'WAVERED');
    expect(wavered?.person.id).toBe(f.c.id);
    expect(wavered?.line).toBe('Changed their mind twice');
  });

  it('names someone nobody guessed', async () => {
    // Only one guess, so three people go unguessed.
    await setGuess({
      exchangeId: f.id,
      guesserId: f.a.id,
      guessedUserId: f.b.id,
      now: NOW,
    });
    const board = await computeScoreboard({ exchangeId: f.id });
    const unguessable = board.awards.find((a) => a.kind === 'UNGUESSABLE');
    expect(unguessable?.line).toBe('Nobody guessed them');
    expect(unguessable?.person.id).not.toBe(f.b.id);
  });

  it('names no correct guesser when the pairings stay secret forever', async () => {
    await playOut();
    const secret = await computeScoreboard({
      exchangeId: f.id,
      secretForever: true,
    });
    // The best guesser remembers who they put down, so naming them as right
    // hands them their own gifter — the fact this mode exists to withhold.
    expect(secret.awards.map((a) => a.kind)).not.toContain('BEST_GUESSER');
    expect(secret.correctCount).toBeNull();
    // And the summary counts who played, not who was right: "4 of 4 guessed
    // right" would tell all four.
    expect(secret.summary).toBe('3 of 4 put a name down this year.');
    // Nothing in the awards states a correct guess.
    expect(JSON.stringify(secret.awards)).not.toContain('right');
  });

  it('drops the accusation award when the pairings stay secret forever', async () => {
    await playOut();
    const open = await computeScoreboard({ exchangeId: f.id });
    const secret = await computeScoreboard({
      exchangeId: f.id,
      secretForever: true,
    });

    // "Three accused them, one was right" tells three people that one of them
    // is holding the answer — which is the thing this mode never shows.
    expect(open.awards.map((a) => a.kind)).toContain('MOST_ACCUSED');
    expect(secret.awards.map((a) => a.kind)).not.toContain('MOST_ACCUSED');
    // What survives are the awards that imply no pairing at all: nobody
    // guessed them, and somebody kept changing their mind.
    expect(secret.awards.map((a) => a.kind).sort()).toEqual([
      'UNGUESSABLE',
      'WAVERED',
    ]);
  });

  it('says so plainly when nobody put a name down', async () => {
    const board = await computeScoreboard({ exchangeId: f.id });
    expect(board.awards).toEqual([]);
    expect(board.summary).toBe('Nobody put a name down this year.');
  });
});

describe('didGuessRight', () => {
  it('tells the viewer whether they called it, and nothing about anyone else', async () => {
    await setGuess({
      exchangeId: f.id,
      guesserId: f.a.id,
      guessedUserId: gifterOf(f, f.a.id),
      now: NOW,
    });
    await setGuess({
      exchangeId: f.id,
      guesserId: f.b.id,
      guessedUserId: f.a.id === gifterOf(f, f.b.id) ? f.c.id : f.a.id,
      now: NOW,
    });

    expect(await didGuessRight({ exchangeId: f.id, viewerId: f.a.id })).toBe(
      true,
    );
    expect(await didGuessRight({ exchangeId: f.id, viewerId: f.b.id })).toBe(
      false,
    );
    // Someone who never guessed gets nothing, not a false.
    expect(
      await didGuessRight({ exchangeId: f.id, viewerId: f.organizer.id }),
    ).toBeNull();
  });
});

describe('getThanksReceived', () => {
  it('gives a gifter the thank-you their person sent, with the name on it', async () => {
    await prisma.exchange.update({
      where: { id: f.id },
      data: { status: EXCHANGE_STATUS.REVEALED },
    });
    const giftee = f.a;
    const gifter = gifterOf(f, giftee.id);

    expect(
      await getThanksReceived({ exchangeId: f.id, viewerId: gifter }),
    ).toBeNull();

    await sendNote({
      exchangeId: f.id,
      senderId: giftee.id,
      direction: NOTE_DIRECTION.TO_GIFTER,
      kind: NOTE_KIND.THANKS,
      presetKey: 'loved-it',
      now: NOW,
    });

    // It reaches the gifter without waiting for a delivery sweep: a thank-you
    // is attributed and expected, so there is nothing to anonymise.
    const received = await getThanksReceived({
      exchangeId: f.id,
      viewerId: gifter,
    });
    expect(received?.text).toBe('Thank you — I loved it.');
    expect(received?.from.id).toBe(giftee.id);

    // And nobody else sees it.
    const bystander = [f.organizer, f.a, f.b, f.c].find(
      (u) => u.id !== gifter && u.id !== giftee.id,
    )!;
    expect(
      await getThanksReceived({ exchangeId: f.id, viewerId: bystander.id }),
    ).toBeNull();
  });
});
