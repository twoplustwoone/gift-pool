/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  coarsenToSlot,
  findPreset,
  nextMorningSlot,
  NOTE_DIRECTION,
  NOTE_KIND,
  pendingSlotLabel,
  presetsFor,
} from './exchange-notes.ts';

const NY = 'America/New_York';
const SYDNEY = 'Australia/Sydney';

describe('nextMorningSlot', () => {
  it('waits for tomorrow when this morning has already gone', () => {
    // 14:00 in New York on 12 Dec → 09:00 on 13 Dec, which is 14:00Z.
    const slot = nextMorningSlot(new Date('2026-12-12T19:00:00Z'), NY);
    expect(slot.toISOString()).toBe('2026-12-13T14:00:00.000Z');
  });

  it('uses this morning when the note is written overnight', () => {
    // 02:04 in New York, the hour the coarsening exists for: the note waits
    // seven hours, not thirty-one.
    const slot = nextMorningSlot(new Date('2026-12-12T07:04:00Z'), NY);
    expect(slot.toISOString()).toBe('2026-12-12T14:00:00.000Z');
  });

  it('puts a note written just before the batch into that batch', () => {
    // 08:59 local: it joins this morning's delivery rather than waiting a
    // full day. The batch is what anonymises a note, not the delay — once it
    // lands with everyone else's, nobody can tell when it was written.
    const now = new Date('2026-12-12T13:59:00Z'); // 08:59 in New York
    expect(nextMorningSlot(now, NY).toISOString()).toBe(
      '2026-12-12T14:00:00.000Z',
    );
  });

  it("is the recipient's morning, not the sender's", () => {
    // Same instant, two zones: Sydney is already into the next day.
    const now = new Date('2026-12-12T19:00:00Z');
    expect(nextMorningSlot(now, NY).toISOString()).toBe(
      '2026-12-13T14:00:00.000Z',
    );
    expect(nextMorningSlot(now, SYDNEY).toISOString()).toBe(
      '2026-12-12T22:00:00.000Z',
    );
  });

  it('lands on 09:00 local across a DST boundary', () => {
    // US clocks go forward on 8 March 2026. A note written on the 7th must
    // still arrive at 09:00 local, not 08:00 or 10:00.
    const slot = nextMorningSlot(new Date('2026-03-07T20:00:00Z'), NY);
    const localHour = new Intl.DateTimeFormat('en-US', {
      timeZone: NY,
      hour: '2-digit',
      hour12: false,
    }).format(slot);
    expect(Number(localHour)).toBe(9);
    expect(slot.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('falls back to UTC for a zone we do not recognise', () => {
    const slot = nextMorningSlot(new Date('2026-12-12T19:00:00Z'), 'Mars/Base');
    expect(slot.toISOString()).toBe('2026-12-13T09:00:00.000Z');
  });
});

describe('coarsenToSlot', () => {
  const now = new Date('2026-12-12T15:00:00Z'); // Saturday morning in NY

  it('never exposes a time of day', () => {
    expect(coarsenToSlot(new Date('2026-12-12T14:00:00Z'), now, NY)).toBe(
      'This morning',
    );
    expect(coarsenToSlot(new Date('2026-12-11T14:00:00Z'), now, NY)).toBe(
      'Yesterday morning',
    );
    expect(coarsenToSlot(new Date('2026-12-08T14:00:00Z'), now, NY)).toBe(
      'Tuesday morning',
    );
  });

  it('falls back to a date once the weekday stops being useful', () => {
    expect(coarsenToSlot(new Date('2026-12-01T14:00:00Z'), now, NY)).toBe(
      '1 Dec',
    );
  });
});

describe('pendingSlotLabel', () => {
  it('tells the sender when it lands, in their words', () => {
    const now = new Date('2026-12-12T19:00:00Z');
    expect(pendingSlotLabel(new Date('2026-12-13T14:00:00Z'), now, NY)).toBe(
      'arrives tomorrow morning',
    );
    expect(
      pendingSlotLabel(
        new Date('2026-12-12T14:00:00Z'),
        new Date('2026-12-12T07:00:00Z'),
        NY,
      ),
    ).toBe('arrives this morning');
  });
});

describe('presets', () => {
  it('offers each direction its own words, and only its own', () => {
    const gifter = presetsFor(NOTE_DIRECTION.TO_GIFTEE, NOTE_KIND.NOTE);
    const giftee = presetsFor(NOTE_DIRECTION.TO_GIFTER, NOTE_KIND.NOTE);
    expect(gifter.map((p) => p.key)).toContain('got-it');
    expect(giftee.map((p) => p.key)).not.toContain('got-it');
    // A gifter's preset key can't be smuggled into a note going the other way.
    expect(
      findPreset(NOTE_DIRECTION.TO_GIFTER, NOTE_KIND.NOTE, 'got-it'),
    ).toBeNull();
  });

  it('gives thanks the same words in both directions — it is the named one', () => {
    expect(
      findPreset(NOTE_DIRECTION.TO_GIFTER, NOTE_KIND.THANKS, 'loved-it')?.text,
    ).toBe('Thank you — I loved it.');
  });

  it('has no duplicate keys anywhere, since the key is what gets stored', () => {
    const all = [
      ...presetsFor(NOTE_DIRECTION.TO_GIFTEE, NOTE_KIND.NOTE),
      ...presetsFor(NOTE_DIRECTION.TO_GIFTER, NOTE_KIND.NOTE),
      ...presetsFor(NOTE_DIRECTION.TO_GIFTER, NOTE_KIND.THANKS),
    ];
    expect(new Set(all.map((p) => p.key)).size).toBe(all.length);
  });
});
