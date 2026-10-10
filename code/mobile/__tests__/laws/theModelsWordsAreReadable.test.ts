/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ NOTHING THE MODEL WRITES REACHES HER SCREEN AS GIBBERISH.
 *
 * FOUNDER, 2026-09-16: *"היה לי גם מקרה שהבינה בנתה תוכנית אבל חלק מהכתב יצא גיבריש."*
 *
 * The week's title and the day names are the only prose in the product that is neither bundled copy
 * nor typed by her: they cross a network, a Worker and two JSON parses, and they are then STORED as
 * literal text in her programme. One decoding fault anywhere on that path and she is the only reader
 * of the damage — for as long as she keeps the week.
 *
 * This law is the reader's half. `domain/modelText` decides what unreadable means; `readCoachWeek`
 * drops it and records where; the week itself — every lift, set, pair and rep band — survives whole,
 * because a week with an honest name beats no week at all.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
//

import { proseFault, proseFingerprint, readableProse } from '@/domain/modelText';
import { readCoachWeek } from '@/domain/coachDraft';

/** UTF-8 Hebrew read one byte at a time — the fault the founder actually saw. */
const MOJIBAKE = Buffer.from('גב וכתפיים', 'utf8').toString('latin1');

describe('⛔ what counts as unreadable', () => {
  it('passes prose in every language the model may answer in', () => {
    for (const ok of ['גב וכתפיים', 'Upper body A', 'יום דחיפה · Push', 'Ρωμαϊκά', 'כוח מתפרץ 💪', 'A/B']) {
      expect({ s: ok, fault: proseFault(ok) }).toEqual({ s: ok, fault: null });
    }
  });

  it('⛔ UTF-8 read as Latin-1 — the classic, and the one that was seen', () => {
    // Every Hebrew letter becomes two glyphs, the second of them a C1 control character.
    expect(MOJIBAKE).not.toEqual('גב וכתפיים');
    expect(proseFault(MOJIBAKE)).toBe('control');
  });

  it('⛔ a replacement character is an upstream decoder that already gave up', () => {
    expect(proseFault('יום א��')).toBe('replacement');
  });

  it('⛔ half a character — the wrist’s own `wc:badframe:json`, made by any cut', () => {
    expect(proseFault('יום כוח \uD83D')).toBe('surrogate');
    // …and the cap is applied BEFORE the judgement, so a name is judged as it would be stored.
    const cutThroughAnEmoji = readableProse('אימון 💪', 7);
    expect(cutThroughAnEmoji).toEqual({ fault: 'surrogate' });
  });

  it('⛔ and a name with no letter in it is not a name', () => {
    expect(proseFault('— 4 · 8')).toBe('no_letter');
  });

  it('the fingerprint carries code points, never her words', () => {
    const shape = proseFingerprint('גב');
    expect(shape).toBe('5d2,5d1');
    expect(shape).not.toContain('גב');
  });
});

describe('⛔ the reader drops the name and keeps the week', () => {
  const reply = (over: Record<string, unknown>) => ({
    name: 'שבוע כוח',
    days: [
      { name: 'גב וכתפיים', lifts: [{ ex: 'lat_pulldown', sets: 3 }] },
      { name: 'רגליים', lifts: [{ ex: 'back_squat', sets: 4 }] },
    ],
    ...over,
  });

  it('a clean reply is read exactly as it was written', () => {
    const week = readCoachWeek(reply({}))!;
    expect(week.name).toBe('שבוע כוח');
    expect(week.days.map((d) => d.name)).toEqual(['גב וכתפיים', 'רגליים']);
    expect(week.unreadable).toEqual([]);
  });

  it('⛔ a mangled DAY NAME loses its label and keeps every lift', () => {
    const week = readCoachWeek(reply({
      days: [
        { name: MOJIBAKE, lifts: [{ ex: 'lat_pulldown', sets: 3, reps: [8, 10] }] },
        { name: 'רגליים', lifts: [{ ex: 'back_squat', sets: 4 }] },
      ],
    }))!;
    // The label is gone — `draftFromCoachWeek`'s `dayNamer` writes "אימון A" in her own language.
    expect(week.days[0].name).toBe('');
    // …and NOTHING else about the day moved.
    expect(week.days[0].lifts).toEqual([{ ex: 'lat_pulldown', sets: 3, reps: [8, 10] }]);
    expect(week.days[1].name).toBe('רגליים');
    expect(week.unreadable).toEqual([{ at: 'day[0].name', fault: 'control', shape: proseFingerprint(MOJIBAKE) }]);
  });

  it('⛔ a mangled TITLE is no title — the shape heuristic names the week, and cannot lie', () => {
    const week = readCoachWeek(reply({ name: MOJIBAKE }))!;
    expect(week.name).toBeUndefined();
    expect(week.days).toHaveLength(2);
    expect(week.unreadable.map((u) => u.at)).toEqual(['name']);
  });

  it('⚠️ …and a week whose prose is all broken is still a week she can train', () => {
    const week = readCoachWeek(reply({
      name: MOJIBAKE,
      days: [{ name: MOJIBAKE, lifts: [{ ex: 'back_squat', sets: 4 }] }],
    }))!;
    expect(week).not.toBeNull();
    expect(week.days[0].lifts).toHaveLength(1);
    expect(week.unreadable).toHaveLength(2);
  });
});
