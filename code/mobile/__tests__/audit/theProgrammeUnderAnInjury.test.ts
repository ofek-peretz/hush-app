/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE SAID SOMETHING HURTS — is the week she gets actually safe?
 *
 * ⛔ FOUNDER, 2026-08-10: *"איך אנחנו מטפלים במצב פציעה? יש כמה רמות ואנחנו צריכים לדעת איך מתנהלים
 * בכל אחת מהן."*
 *
 * There was no audit here at all. `painReport` had unit tests for its windows, and the programme
 * built UNDER one had never been read — which is where the hole was: a hurt shoulder switched off
 * `Shoulders` and chest pressing kept loading that shoulder the next day.
 *
 * ⚠️ THE THREE RUNGS DIFFER IN KIND, NOT ONLY IN LENGTH, and each is checked for what it promises:
 *   · a TWINGE keeps the muscle training and takes the movement away;
 *   · PAIN takes the muscle out, and its movements with it;
 *   · SHARP takes those movements out of the WHOLE week, wherever they appear.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { exerciseById, muscleOf } from '@/data/exercises';
import { FORBIDDEN_PATTERNS, allPatternsFor, patternsAt, easeFor, effectiveBodyMap, type PainSeverity } from '@/domain/painReport';
import type { Profile, Program } from '@/data/local/models';

/*
 * ⛔ THE REPORT IS MADE *NOW*, NOT ON A FROZEN DATE — and the frozen date is how a real defect was
 * found (2026-08-16). This read `Date.UTC(2026, 7, 11)` while `programAssembly.pickExercises` judged
 * the windows against `Date.now()` four frames deep, so the audit passed on the day it was written
 * and started failing the moment real time walked past the three-day TWINGE window: twinge red, the
 * seven-day pain case and the fourteen-day sharp case still green, and both due to break within the
 * fortnight. The clock now enters the assembler as an argument (see `assembleV5DayLists`), and this
 * asks what it always meant to ask — *she reported it recently*.
 */
const NOW = Date.now();

/** An athlete who reported `muscle` at `severity`, exactly as `reportPain` would leave her. */
const hurt = (muscle: string, severity: PainSeverity): Profile => {
  const painEases = [easeFor(muscle, severity, NOW)];
  return {
    id: 'p1',
    sex: 'female',
    units: 'kg',
    weightKg: 62,
    startWeightKg: 62,
    daysPerWeek: 4,
    repBand: '8-10',
    repBandByMuscle: {},
    memberSince: new Date('2026-01-01').toISOString(),
    painEases,
    /* What `programProfile` hands the engine: her map with the rested muscles composed over it. */
    bodyMap: effectiveBodyMap(undefined, painEases, NOW),
  } as Profile;
};

const build = (p: Profile): Promise<Program> => fixtureModel.generateProgram(p);
const lifts = (p: Program) => p.days.filter((d) => !d.isRest).flatMap((d) => d.slots.map((s) => s.exerciseId));
const patternsIn = (p: Program) => new Set(lifts(p).map((id) => exerciseById(id)?.pattern).filter(Boolean));
const musclesIn = (p: Program) => new Set(lifts(p).map((id) => muscleOf(id)).filter(Boolean));

const SITES = CANONICAL_MUSCLE_ORDER.filter((m) => FORBIDDEN_PATTERNS[m]);

describe('⛔ the movement she reported is not handed back to her', () => {
  it('a SHARP report removes its patterns from the ENTIRE week — the hole the muscle-only model left', async () => {
    /*
     * The case that proves the table earns its place. A sharp shoulder must take the bench press
     * with it, and no amount of switching `Shoulders` off reaches a lift filed under `Chest`.
     */
    const leaked: string[] = [];
    for (const site of SITES) {
      const p = await build(hurt(site, 'sharp'));
      const drawn = patternsIn(p);
      for (const pat of allPatternsFor(site)) {
        if (drawn.has(pat)) leaked.push(`${site} sharp → ${pat} still programmed`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('a PAIN report removes the muscle AND the lifts that muscle owns', async () => {
    const leaked: string[] = [];
    for (const site of SITES) {
      if (site === 'Core') continue; // supplemental — its own path (addWeeklyCore), tested below
      const p = await build(hurt(site, 'pain'));
      if (musclesIn(p).has(site)) leaked.push(`${site} pain → still trained`);
    }
    expect(leaked).toEqual([]);
  });

  it('⛔ a TWINGE keeps her training the muscle — it takes the MOVEMENT, not the week', async () => {
    /*
     * ⚠️ THE RUNG THAT USED TO BE INDISTINGUISHABLE. All three severities switched the muscle off;
     * only the window length differed. Stopping a whole muscle because something twinged is how an
     * athlete learns not to report anything — so the mildest rung must cost the least.
     *
     * Asserted where the muscle has lifts OUTSIDE its banned patterns; where it does not, resting is
     * the honest answer and the sweep below covers it.
     */
    const stopped: string[] = [];
    for (const site of ['Back', 'Chest', 'Quads', 'Glutes']) {
      const p = await build(hurt(site, 'twinge'));
      if (!musclesIn(p).has(site)) stopped.push(`${site} twinge → muscle stopped entirely`);
      for (const pat of patternsAt(site, 'twinge')) {
        const own = lifts(p).filter((id) => muscleOf(id) === site).map((id) => exerciseById(id)?.pattern);
        if (own.includes(pat)) stopped.push(`${site} twinge → ${pat} still programmed on it`);
      }
    }
    expect(stopped).toEqual([]);
  });
});

describe('⛔ an injured week is still a week', () => {
  it('every severity on every site still yields real sessions, none empty', async () => {
    /*
     * The failure that matters more than any single ban: a report must never leave her with a
     * broken programme. She is already dealing with something that hurts.
     */
    const broken: string[] = [];
    for (const site of SITES)
      for (const severity of ['twinge', 'pain', 'sharp'] as PainSeverity[]) {
        const p = await build(hurt(site, severity));
        const w = p.days.filter((d) => !d.isRest);
        if (w.length !== 4) broken.push(`${site}/${severity}: ${w.length} workouts`);
        else if (w.some((d) => d.slots.length === 0)) broken.push(`${site}/${severity}: an EMPTY session`);
      }
    expect(broken).toEqual([]);
  });

  it('⚠️ and the rest of her body still gets trained — one report is not a lost week', async () => {
    // A shoulder she reported must not cost her legs. The week keeps most of its muscles whatever
    // was reported; what it loses is the reported one and the movements that load it.
    const thin: string[] = [];
    for (const site of SITES)
      for (const severity of ['twinge', 'pain', 'sharp'] as PainSeverity[]) {
        const n = musclesIn(await build(hurt(site, severity))).size;
        if (n < 5) thin.push(`${site}/${severity}: only ${n} muscles trained`);
      }
    expect(thin).toEqual([]);
  });

  it('is deterministic — the same report twice builds the same week (I-24)', async () => {
    for (const site of ['Shoulders', 'Back']) {
      const a = lifts(await build(hurt(site, 'pain')));
      const b = lifts(await build(hurt(site, 'pain')));
      expect(a).toEqual(b);
    }
  });
});

describe('⛔ and it ends by itself', () => {
  it('a lapsed window forbids nothing and rests nothing — the muscle returns on its own', async () => {
    /*
     * `activeEases` filters on `untilMs > now`, so a window that has passed has no force: the muscle
     * is back in the map and its movements are offered again. Nothing has to be cleared, which is
     * what makes the return safe against an app that was closed for a fortnight.
     *
     * ⚠️ THE ASK IS A SEPARATE MATTER and is not asserted here: the founder's rule is that Hush must
     * TELL her the time is up and ask how it feels. Today that message is an AI call, so with no
     * signal the muscle returns silently. That is the next thing.
     */
    const stale = { ...hurt('Shoulders', 'sharp') };
    stale.painEases = [easeFor('Shoulders', 'sharp', NOW - 40 * 24 * 60 * 60 * 1000)];
    stale.bodyMap = effectiveBodyMap(undefined, stale.painEases, NOW);
    const p = await build(stale);
    expect(musclesIn(p).has('Shoulders')).toBe(true);
    expect([...patternsIn(p)].some((pat) => allPatternsFor('Shoulders').includes(pat as string))).toBe(true);
  });
});

/**
 * ⛔ THE CORE IS DEALT ON ITS OWN PATH, AND THAT PATH DID NOT ASK (2026-08-19).
 *
 * The suite above skips Core with the note "supplemental — its own path (addWeeklyCore), tested
 * there", and there was no there: no test in this repo named `addWeeklyCore` and a pain report in
 * the same breath. `addWeeklyCore` took no ban argument at all, so it dealt straight out of
 * `CORE_POOL` whatever she had reported.
 *
 * A TWINGE is the case that bites. It bans `crunch` and `rotation` and — correctly — does NOT rest
 * the muscle, so Core stays on and the supplemental path runs. `pain` and `sharp` were safe only by
 * accident, because they switch the muscle off and `coreStance === 'off'` returns early.
 */
describe('⛔ a core report reaches the core she is actually dealt', () => {
  const coreLifts = (p: Program) =>
    p.days.flatMap((d) => d.slots).map((s) => exerciseById(s.exerciseId)).filter((e) => e && e.muscle === 'Core');

  /*
   * ⚠️ SWEPT ACROSS FREQUENCIES, AND THAT IS NOT THOROUGHNESS — IT IS THE ONLY WAY THIS TEST WORKS.
   *
   * `addWeeklyCore` walks `CORE_POOL` from a cursor derived from her days per week, so a single
   * four-day athlete lands on ONE entry. The first version of this test did exactly that, passed,
   * and passed just as happily with the fix ripped out — the cursor happened to sit on a leg raise,
   * which a twinge does not ban. A test that cannot fail is worse than no test. The sweep visits
   * every cursor position, so the banned entries are certainly reached.
   */
  const FREQUENCIES = [2, 3, 4, 5, 6];
  const atDays = (base: Profile, days: number): Profile => ({ ...base, daysPerWeek: days });

  it('a TWINGE takes the banned movements out of the supplemental core, at every frequency', async () => {
    const banned = patternsAt('Core', 'twinge');
    expect(banned.length).toBeGreaterThan(0); // the test is worthless if the grade bans nothing

    const leaked: string[] = [];
    let drawnAnywhere = 0;
    for (const days of FREQUENCIES) {
      const drawn = coreLifts(await build(atDays(hurt('Core', 'twinge'), days)));
      drawnAnywhere += drawn.length;
      for (const e of drawn) if (banned.includes(e.pattern)) leaked.push(`${days}d → ${e.id} (${e.pattern})`);
    }
    // A twinge does not rest the muscle, so she must still be given core work…
    expect(drawnAnywhere).toBeGreaterThan(0);
    // …and none of it may be a movement she just reported.
    expect(leaked).toEqual([]);
  });

  it('⚠️ and the ban does not quietly cost her the work — she gets as much core as before', async () => {
    /*
     * A banned entry must be walked PAST, not skipped in place. Skipping it would take the movement
     * away twice: once from the pool, and again from her allowance.
     */
    for (const days of FREQUENCIES) {
      const before = coreLifts(await build(atDays(hurt('Chest', 'twinge'), days))).length; // unrelated report
      const after = coreLifts(await build(atDays(hurt('Core', 'twinge'), days))).length;
      expect({ days, after }).toEqual({ days, after: before });
    }
  });

  it('a PAIN report on the core takes the core out entirely', async () => {
    for (const days of FREQUENCIES) {
      expect(coreLifts(await build(atDays(hurt('Core', 'pain'), days)))).toEqual([]);
    }
  });
});
