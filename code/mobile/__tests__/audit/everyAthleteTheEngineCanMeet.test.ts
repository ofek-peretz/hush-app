/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * EVERY ATHLETE THE ENGINE CAN MEET â€” the sweep, not the sample.
 *
 * â›” Founder, 2026-08-08: *"××ª×” ×—×•×ª× ×¢×œ ×–×” ×©×¢×‘×•×¨ ×›×œ ×ž×ª××ž×Ÿ, ×¢×‘×•×¨ ×›×œ ×©×¨×™×¨ ×©×”×•× ×ž×›×‘×” / ×ž×“×œ×™×§ â€¦ ×¢×‘×•×¨ ×›×œ
 * ×™×•× ××¤×©×¨×™ â€¦ ×”×ž×©×ª×ž×© ×™×§×‘×œ ××ª ×ª×•×›× ×™×•×ª ×”××™×ž×•×Ÿ ×”×˜×•×‘×•×ª ×‘×™×•×ª×¨? â€¦ ×”×›×œ ×¡×’×•×¨ ×•× ×¢×•×œ ×•×ž××•×ž×ª ×‘×˜×¡×˜×™×?"*
 *
 * He was right to press. `everyProgramme` builds TEN programmes â€” male and female at 2â€¦6 days, all
 * on an all-normal map â€” and `theProgrammeIsWorthTraining` adds three hand-picked maps. The body map
 * has 3^10 = 59,049 states before frequency, sex or bodyweight multiply it. Thirteen of them had
 * been looked at, and a claim about all of them was not a claim any test supported.
 *
 * This sweeps the space SYSTEMATICALLY rather than exhaustively, which is the honest middle: every
 * single-muscle off, every single-muscle emphasis, every legal emphasis PAIR (F-4 caps it at two),
 * whole regions off, and a deterministic pseudo-random tail â€” across both sexes, five frequencies
 * and three bodyweights.
 *
 * It asserts the bounds the founder named, and nothing about taste. "The best programme in the
 * world" is not a testable proposition; "no session under 45 minutes, no session over her ceiling,
 * a back that is trained with both pulls, no muscle she turned off, and no day that is a twin of
 * another" is â€” and those are the ones a defect actually hides behind.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
// @ts-nocheck

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { muscleOf, exerciseById } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import type { Profile, Program } from '@/data/local/models';

const MUSCLES = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');
const LOWER = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
const VERTICAL = ['lat_pulldown', 'pull_up', 'chin_up', 'assisted_pull_up'];
const HORIZONTAL = ['bb_row', 't_bar_row', 'cable_row', 'single_arm_cable_row', 'db_row', 'incline_db_row', 'machine_row', 'smith_row'];

/** Deterministic â€” a sweep may not pass or fail by luck. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The body maps swept. Systematic first, pseudo-random tail second. */
function maps(): { label: string; map: Record<string, string> }[] {
  const out: { label: string; map: Record<string, string> }[] = [{ label: 'all normal', map: {} }];
  for (const m of MUSCLES) out.push({ label: `${m} off`, map: { [m]: 'off' } });
  for (const m of MUSCLES) out.push({ label: `${m} emphasis`, map: { [m]: 'emphasis' } });
  for (let i = 0; i < MUSCLES.length; i++)
    for (let j = i + 1; j < MUSCLES.length; j++)
      out.push({ label: `${MUSCLES[i]}+${MUSCLES[j]} emphasis`, map: { [MUSCLES[i]]: 'emphasis', [MUSCLES[j]]: 'emphasis' } });
  out.push({ label: 'lower off', map: Object.fromEntries(LOWER.map((m) => [m, 'off'])) });
  out.push({ label: 'upper off', map: Object.fromEntries(MUSCLES.filter((m) => !LOWER.includes(m)).map((m) => [m, 'off'])) });
  const r = rng(20260808);
  for (let n = 0; n < 40; n++) {
    const map: Record<string, string> = {};
    let marks = 0;
    for (const m of MUSCLES) {
      const roll = r();
      if (roll < 0.18) map[m] = 'off';
      else if (roll < 0.28 && marks < 2) { map[m] = 'emphasis'; marks++; }
    }
    if (MUSCLES.every((m) => map[m] === 'off')) continue; // S-3: everything off yields no programme
    out.push({ label: `random #${n}`, map });
  }
  return out;
}

interface Case { label: string; profile: Profile; program: Program }

const BUILDS: Case[] = [];

beforeAll(async () => {
  const bodies: { sex: 'male' | 'female'; kg: number }[] = [
    { sex: 'male', kg: 80 },
    { sex: 'female', kg: 52 },
    { sex: 'female', kg: 75 },
  ];
  for (const { label, map } of maps()) {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const b of bodies) {
        const profile = { id: 'x', name: 'X', sex: b.sex, units: 'kg', weightKg: b.kg, daysPerWeek: days, bodyMap: map, repBandByMuscle: {} } as unknown as Profile;
        await db.clear?.();
        BUILDS.push({ label: `${b.sex} ${b.kg}kg Â· ${days}Ã— Â· ${label}`, profile, program: await fixtureModel.generateProgram(profile) });
      }
    }
  }
}, 600000);

const sessions = (c: Case) => c.program.days.filter((d) => !d.isRest && d.slots.length > 0);

it('the sweep really covered the space (it is not passing on an empty read)', () => {
  expect(BUILDS.length).toBeGreaterThan(1400); // 97 maps x 5 frequencies x 3 bodies = 1455
  expect(new Set(BUILDS.map((b) => JSON.stringify(b.profile.bodyMap))).size).toBeGreaterThan(80);
});

it('no muscle she turned OFF is ever programmed', () => {
  const breaches: string[] = [];
  for (const c of BUILDS) {
    const off = Object.entries(c.profile.bodyMap ?? {}).filter(([, v]) => v === 'off').map(([m]) => m);
    if (!off.length) continue;
    for (const d of sessions(c))
      for (const s of d.slots) {
        const m = muscleOf(s.exerciseId);
        if (m && off.includes(m)) breaches.push(`${c.label} Â· ${d.name}: ${s.exerciseId} (${m})`);
      }
  }
  expect({ offMusclesProgrammed: breaches.slice(0, 12), total: breaches.length }).toEqual({ offMusclesProgrammed: [], total: 0 });
});

it('every session she is given lands inside her minutes', () => {
  const short: string[] = [];
  const long: string[] = [];
  for (const c of BUILDS)
    for (const d of sessions(c)) {
      const min = estimateSessionMinutes(d);
      // A day whose every lift already sits at F-1's five-set ceiling has nothing left to give, and
      // the test below proves that is the ONLY reason any day is ever short. Exempting on that
      // condition rather than on a lift count keeps this about the engine and not about a string.
      const couldGrow = d.slots.some((s) => !s.supplemental && s.setCount < 5);
      if (min < 45 && couldGrow) short.push(`${c.label} · ${d.name}: ${d.slots.length} lifts, ~${min} min`);
      /*
       * ⛔ AN EMPHASIS MARK MAY COST UP TO FIVE MINUTES, AND ONLY AN EMPHASIS MARK.
       *
       * A marked muscle draws a larger weekly target, and that buys it exercises as well as sets. On
       * a three-day FULL-BODY week every muscle is already on every day, so the extra lift lands on a
       * session where the cap has nothing legal left to remove: every other muscle is down to its
       * single lift, and the row and the pulldown are protected as essential patterns. The measured
       * overshoot is three minutes, and only on maps where she asked for more work on a muscle.
       *
       * Widening the bound for everyone would hide a real defect. Widening it only where she made a
       * mark states the PRICE of the mark. An unmarked map is still held to the minute.
       */
      /*
       * ⛔ 67, NOT 65 (founder 2026-08-11, approving the measured cost of the pattern split).
       *
       * The allowance was tuned when `Back/row`, `Quads/squat` and `Hamstrings/hinge` each carried
       * one name over seven to nine lifts. Splitting them on the axis a coach uses — free axial load
       * versus supported — changes which lifts the diversity score reaches for, and the whole cost is:
       *
       *     1 programme of 1,455, a MARKED map, at ~66 min against 65
       *
       * ⚠️ WIDENING A BOUND TO LET A CHANGE THROUGH IS NORMALLY THE WRONG MOVE, and it was refused
       * four times over this engine on 2026-08-10. It is right here for one reason: this number was
       * never a law, it is a MEASUREMENT of what a mark costs — its own note says *"the measured
       * overshoot is three minutes… widening it only where she made a mark states the PRICE of the
       * mark."* The selection changed, so the measurement changed. An unmarked map is still held to
       * the minute, which is the half that guards anything.
       */
      const marked = Object.values(c.profile.bodyMap ?? {}).includes('emphasis');
      if (min > (marked ? 67 : 60)) long.push(`${c.label} · ${d.name}: ~${min} min`);
    }
  expect({ overHerCeiling: long.slice(0, 12), overCount: long.length }).toEqual({ overHerCeiling: [], overCount: 0 });
  expect({ under45: short.slice(0, 12), underCount: short.length }).toEqual({ under45: [], underCount: 0 });
});

it('a session may only fall short when it physically cannot be longer', () => {
  /*
   * The one honest exception to the 45-minute floor, and it is narrow.
   *
   * `fillToSessionFloor` grows SETS and refuses to add exercises, because choosing an exercise is a
   * training decision that belongs to the assembler. So a day whose every lift already sits at F-1's
   * ceiling of five sets has nothing left to give: three lifts × five sets is about 35 minutes, and
   * that is the whole day. It shows up where you would expect — the lowest frequency on a map with
   * most muscles switched off, where one region has almost nothing left to train.
   *
   * ⛔ What this must never become is a hiding place. A short day is legal ONLY when every slot is
   * maxed; a short day with a slot at three sets is the floor failing, and the test above catches it.
   */
  const notMaxed: string[] = [];
  for (const c of BUILDS)
    for (const d of sessions(c)) {
      if (estimateSessionMinutes(d) >= 45) continue;
      const growable = d.slots.filter((s) => !s.supplemental && s.setCount < 5);
      if (growable.length) notMaxed.push(`${c.label} · ${d.name}: ${growable.length} slots still below 5 sets`);
    }
  expect({ shortDaysThatCouldHaveGrown: notMaxed.slice(0, 12), total: notMaxed.length }).toEqual({ shortDaysThatCouldHaveGrown: [], total: 0 });
});

it('a back that is trained at all is trained with BOTH pulls', () => {
  const gaps: string[] = [];
  for (const c of BUILDS) {
    if ((c.profile.bodyMap ?? {}).Back === 'off') continue;
    const ids = sessions(c).flatMap((d) => d.slots.map((s) => s.exerciseId));
    if (!ids.some((id) => muscleOf(id) === 'Back')) continue;
    const v = ids.some((id) => VERTICAL.includes(id));
    const h = ids.some((id) => HORIZONTAL.includes(id));
    if (!v || !h) gaps.push(`${c.label}: ${!v ? 'no vertical' : ''}${!v && !h ? ' + ' : ''}${!h ? 'no horizontal' : ''}`);
  }
  expect({ backsMissingAPull: gaps.slice(0, 12), total: gaps.length }).toEqual({ backsMissingAPull: [], total: 0 });
});

/*
 * ════ A BACK IS NOT A CALF ════
 *
 * Founder, 2026-08-09, on whether these would pass an international coach. The printed male 4× week
 * read Quads 15 · Calves 12 · … · Chest 8 · Back 8, and no coach signs a programme that trains the
 * calves harder than the back, or gives the biceps — already worked by every pull — more direct
 * volume than the largest muscle group in the body.
 *
 * The bound is deliberately WEAK: it does not name a target for any muscle, only that the big groups
 * are not out-trained by the small ones. Anything tighter would be a taste, and tastes do not belong
 * in a law. It reports the median across every athlete swept, so one odd frequency cannot hide.
 */
it('the large groups are not out-trained by the small ones', () => {
  const BIG = ['Back', 'Chest', 'Quads', 'Hamstrings'];
  const SMALL = ['Biceps', 'Triceps', 'Calves'];
  const setsByMuscle = (c: Case): Record<string, number> => {
    const n: Record<string, number> = {};
    for (const d of sessions(c)) for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (m) n[m] = (n[m] ?? 0) + s.setCount;
    }
    return n;
  };
  const inversions: string[] = [];
  for (const c of BUILDS) {
    const map = c.profile.bodyMap ?? {};
    const n = setsByMuscle(c);
    for (const big of BIG) {
      if (map[big] === 'off' || !n[big]) continue;
      for (const small of SMALL) {
        if (map[small] === 'off' || !n[small]) continue;
        if (map[small] === 'emphasis' && map[big] !== 'emphasis') continue; // she asked for it
        if (n[small] > n[big]) inversions.push(`${c.label}: ${small} ${n[small]} > ${big} ${n[big]}`);
      }
    }
  }
  /*
   * ⛔ A RATCHET, NOT A PASS. The target is zero and this is not there yet.
   *
   * Measured over the 1,455-programme sweep, isolating one change at a time:
   *
   *     flat shares (every muscle the same target) ......... 2375 inversions
   *     MUSCLE_VOLUME_SHARE ............................... 743   ← where this sits
   *     …plus a share-scaled day-one set count ............ 557, but it broke the 45-minute floor
   *
   * The last 743 are one known cause: `enforceTimeCap` drops slots by POSITION — trailing first —
   * so the muscle it takes from is whichever sits late in `CANONICAL_MUSCLE_ORDER`, not whichever
   * can best spare the work. `trimV5ToBudget` already knows the right rule (`chooseDonor`: never an
   * emphasis muscle, never one at its floor, otherwise the one with the most sets). Until the cap
   * gives up sets the same way, a bigger target for the back just means a harder cut to the back —
   * which is exactly why scaling set counts made it WORSE, not better.
   *
   * The number may only ever go DOWN. Raising it to make a change pass is how a ratchet becomes a
   * rubber stamp; if a change needs a higher number, the change is wrong.
   */
  const CEILING = 743;
  expect({ sample: inversions.slice(0, 6), withinRatchet: inversions.length <= CEILING }).toEqual({
    sample: inversions.slice(0, 6),
    withinRatchet: true,
  });
  expect(inversions.length).toBeLessThanOrEqual(CEILING);
});

/*
 * ════ A MUSCLE SHE LEFT ON IS GROWN, NOT MAINTAINED ════
 *
 * ⛔ Founder, 2026-08-10, on three cases the reading found: Triceps at 3 weekly sets on a three-day
 * week with Back off, Calves at 3 on a four-day week with Quads off, Shoulders at 6 on a plain
 * four-day week. There was a floor under a SESSION and a ceiling over it, and nothing at all under a
 * MUSCLE — so a muscle could leave the week on one lift at F-1's minimum while the day it sat in was
 * a perfectly legal sixty minutes.
 *
 * `raiseToWeeklyFloor` fixes what is fixable: it grows the thinnest muscle's existing lifts where the
 * clock has room, and where it has not, TRANSFERS a set from a muscle comfortably clear of the floor
 * on the same day — so the day's length never moves.
 *
 * ⛔ WHAT IS LEFT IS PHYSICS, AND THIS TEST NAMES IT RATHER THAN HIDING IT. Two bounds cannot be
 * argued with: a muscle holding ONE exercise cannot exceed five sets, because F-1 caps a slot at
 * five; and a day already at her ceiling cannot lend anything. So the law is not "every muscle
 * reaches six" — it is "a muscle below six is a muscle one of those two bounds is holding down".
 * If a muscle is ever short with room to spare, that is a defect and this goes red.
 */
it('a muscle below the effective dose is one that physically could not reach it', () => {
  const unexplained: string[] = [];
  for (const c of BUILDS) {
    const sets: Record<string, number> = {};
    const lifts: Record<string, number> = {};
    for (const d of sessions(c))
      for (const s of d.slots) {
        if (s.supplemental) continue;
        const m = muscleOf(s.exerciseId);
        if (!m) continue;
        sets[m] = (sets[m] ?? 0) + s.setCount;
        lifts[m] = (lifts[m] ?? 0) + 1;
      }
    for (const [m, n] of Object.entries(sets)) {
      if (n >= 6) continue;
      const cappedByF1 = lifts[m] === 1 && n >= 5; // one lift, already at the ceiling
      const daysAtBudget = sessions(c)
        .filter((d) => d.slots.some((s) => muscleOf(s.exerciseId) === m))
        .every((d) => estimateSessionMinutes(d) >= 55); // no room left to lend
      if (!cappedByF1 && !daysAtBudget) unexplained.push(`${c.label}: ${m} ${n} sets across ${lifts[m]} lifts`);
    }
  }
  expect({ shortWithRoomToSpare: unexplained.slice(0, 12), total: unexplained.length }).toEqual({ shortWithRoomToSpare: [], total: 0 });
});

/*
 * ════ A MARK SHE PLACES IS A MARK SHE SEES ════
 *
 * ⛔ Founder, 2026-08-10: does emphasis work for one muscle, and for two (F-4 caps it at two)?
 *
 * Reading the marked weeks said no. Marking CALVES changed the programme not at all — six weekly
 * sets before and after — and so did marking Biceps, Triceps or Shoulders. The mark raised the
 * muscle's target, the target became an exercise COUNT, and for a small share that still rounded to
 * the same number of lifts; the day was already at sixty minutes, so there was nowhere for the extra
 * work to go. With two marks it was worse: the first muscle in the day's order took everything and
 * the second was untouched, so one of her two marks did nothing at all.
 *
 * A mark she can place and not see is worse than no mark. This asserts the mark MOVED the muscle,
 * for every legal single mark and every legal pair, at every frequency the sweep builds.
 */
it('every emphasis mark moves the muscle it is placed on', () => {
  const byMap = new Map(BUILDS.map((b) => [`${b.profile.sex}|${b.profile.weightKg}|${b.profile.daysPerWeek}|${JSON.stringify(b.profile.bodyMap)}`, b]));
  const setsFor = (c: Case, muscle: string) =>
    sessions(c).flatMap((d) => d.slots).filter((s) => !s.supplemental && muscleOf(s.exerciseId) === muscle).reduce((n, s) => n + s.setCount, 0);

  const inert: string[] = [];
  for (const c of BUILDS) {
    const marked = Object.entries(c.profile.bodyMap ?? {}).filter(([, v]) => v === 'emphasis').map(([m]) => m);
    if (marked.length === 0) continue;
    // The same athlete with the marks removed, and everything else about her identical.
    const plainMap = Object.fromEntries(Object.entries(c.profile.bodyMap ?? {}).filter(([, v]) => v !== 'emphasis'));
    const plain = byMap.get(`${c.profile.sex}|${c.profile.weightKg}|${c.profile.daysPerWeek}|${JSON.stringify(plainMap)}`);
    if (!plain) continue; // no like-for-like control in the sweep for this map
    for (const m of marked) {
      const withMark = setsFor(c, m);
      const without = setsFor(plain, m);
      if (withMark <= without) inert.push(`${c.label}: ${m} ${without} -> ${withMark}`);
    }
  }
  /*
   * ⛔ A RATCHET AT 192, AND THE TARGET IS ZERO. Measured over the 1,455-programme sweep:
   *
   *     without the same-day transfer in `growEmphasised` ....... 498 inert marks
   *     with it ................................................. 192   ← where this sits
   *
   * What remains is concentrated where the week has no slack to move: at two and three days a
   * session is already at her ceiling and every other muscle is at the weekly floor, so there is no
   * donor a transfer is allowed to take from. Serving the mark there would mean either breaking her
   * hour or dropping an unmarked muscle below the effective dose, and neither is a trade she asked
   * for when she marked ONE muscle.
   *
   * The honest fix is upstream — a marked muscle should be able to claim an extra EXERCISE at
   * assembly, where her map and her volume targets are both in scope, rather than negotiating for
   * sets afterwards. That is a design change, not a constant.
   *
   * The number may only ever go DOWN. Raising it to make a change pass is how a ratchet becomes a
   * rubber stamp.
   */
  const CEILING = 192;
  expect({ sample: inert.slice(0, 6), withinRatchet: inert.length <= CEILING }).toEqual({
    sample: inert.slice(0, 6),
    withinRatchet: true,
  });
  expect(inert.length).toBeLessThanOrEqual(CEILING);
});

it('no two sessions in one week are twins', () => {
  const twins: string[] = [];
  for (const c of BUILDS) {
    const seen = new Map<string, string>();
    for (const d of sessions(c)) {
      const key = d.slots.map((s) => s.exerciseId).sort().join('|');
      if (seen.has(key)) twins.push(`${c.label}: ${seen.get(key)} === ${d.name}`);
      else seen.set(key, d.name);
    }
  }
  expect({ twinSessions: twins.slice(0, 12), total: twins.length }).toEqual({ twinSessions: [], total: 0 });
});

it('compounds lead every session, but for an isolation riding its own machine', () => {
  // The one documented exception (orderForFlow): an isolation sharing a catalogue `station` with the
  // compound before it rides directly behind it, because they are literally the same machine â€” the
  // leg press and its calf raise. Anything else in front of a compound is a breach.
  const breaches: string[] = [];
  for (const c of BUILDS)
    for (const d of sessions(c)) {
      const lifts = d.slots.filter((x) => !x.supplemental).map((s) => exerciseById(s.exerciseId)).filter(Boolean);
      let sawIsolation = false;
      for (let i = 0; i < lifts.length; i++) {
        const e = lifts[i];
        if (e.tier === 'isolation') {
          const prev = lifts[i - 1];
          if (!(prev && prev.station && prev.station === e.station)) sawIsolation = true; // not the exception
          continue;
        }
        if (sawIsolation) { breaches.push(`${c.label} Â· ${d.name}: ${e.id} after an isolation`); break; }
      }
    }
  expect({ isolationBeforeCompound: breaches.slice(0, 12), total: breaches.length }).toEqual({ isolationBeforeCompound: [], total: 0 });
});
