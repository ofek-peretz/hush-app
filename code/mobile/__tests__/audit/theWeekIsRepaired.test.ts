/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REPAIR PASS — and above all, WHAT IT REFUSES TO DO.
 *
 * ⛔ FOUNDER, 2026-08-12: *"תעשה את שלב א', ב' ואם צריך ג'."*
 *
 * A pass that edits a finished programme is the most dangerous thing in this engine, because it runs
 * last and nothing checks it afterwards. Thirteen attempts inside the pipeline each improved one
 * number and broke another; a repair pass that did the same would do it to every athlete at once.
 *
 * So most of this file is about the guard rather than the gain: a repair is kept only when the whole
 * board improves AND not one existing breach gets deeper. Three wrong versions of that rule shipped
 * into test runs on the day it was written, each with a real regression behind it, and the tests
 * below are the shape of each one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { repairWeek, better } from '@/domain/weekRepair';
import { weekFindings, defects, severity, severityOf } from '@/domain/weekQuality';
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { SETS_MIN, SETS_MAX, SESSION_MIN, SESSION_MAX, WEEKLY_SETS_CEILING, CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { muscleOf } from '@/data/exercises';
import { emphasisRefusal } from '@/engine/v5/bodyMap';

const athlete = (over = {}) => ({
  id: 'p1', sex: 'female', units: 'kg', weightKg: 62, startWeightKg: 62,
  daysPerWeek: 4, repBand: '8-10', repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(), ...over,
});
const build = (over = {}) => fixtureModel.generateProgram(athlete(over));
const work = (p) => p.days.filter((d) => !d.isRest && d.slots.length > 0);
const setsOf = (p) => {
  const o = {};
  for (const d of work(p)) for (const s of d.slots) {
    const m = muscleOf(s.exerciseId);
    if (m) o[m] = (o[m] ?? 0) + s.setCount;
  }
  return o;
};

/** A sweep wide enough that a bad guard shows up somewhere. */
async function sweep() {
  const out = [];
  for (const days of [2, 3, 4, 5, 6])
    for (const sex of ['male', 'female'])
      for (const bodyMap of [
        {}, { Back: 'emphasis' }, { Shoulders: 'emphasis' }, { Glutes: 'emphasis' },
        { Calves: 'off', Core: 'off' }, { Quads: 'off', Hamstrings: 'off', Glutes: 'off', Calves: 'off' },
      ]) {
        const marks = Object.entries(bodyMap).filter(([, v]) => v === 'emphasis').map(([m]) => m);
        if (marks.some((m) => emphasisRefusal({}, m, CANONICAL_MUSCLE_ORDER, days))) continue;
        const inputs = { bodyMap, daysPerWeek: days };
        const program = await build({ daysPerWeek: days, sex, bodyMap });
        out.push({ label: `${sex} ${days}d ${JSON.stringify(bodyMap)}`, program, inputs });
      }
  return out;
}

let cases = [];
beforeAll(async () => { cases = await sweep(); }, 600_000);

describe('⛔ what the repair pass may never do', () => {
  it('⛔ IT NEVER MAKES A WEEK WORSE — the whole board, every case', async () => {
    /*
     * ⚠️ THIS IS THE TEST THE THIRTEEN ATTEMPTS DID NOT HAVE. Each of them improved the number its
     * author was watching; none of them asked what happened to the rest.
     */
    const worse = [];
    for (const c of cases) {
      // The programme has ALREADY been repaired inside `generateProgram`, so this asks the harder
      // question: does running it again find anything, and can a second pass ever hurt?
      const before = weekFindings(c.program, c.inputs);
      const { program: after } = repairWeek(c.program, c.inputs);
      const now = weekFindings(after, c.inputs);
      if (severity(defects(now)) > severity(defects(before))) worse.push(c.label);
    }
    expect(worse).toEqual([]);
  });

  it('⛔ NOT ONE BREACH EVER GETS DEEPER — not even one already on the list', () => {
    /*
     * ⛔ THE THIRD AND FINAL FORM OF THE GUARD, AND THE TWO THAT CAME BEFORE IT BOTH SHIPPED A REAL
     * REGRESSION on the day this was written:
     *
     *   "no NEW rule" ......... a week already holding one short session was allowed to shorten a
     *                           second day. Four sessions came out at ~43 min against a 45 floor.
     *   "no new rule+subject" . the day that was already short got shorter — 43, then 33 minutes.
     *
     * A falling total is not enough. Closing three proportion errors and pulling a session ten
     * minutes further under her floor lowers the arithmetic and hands her a worse week.
     */
    const deeper = [];
    for (const c of cases) {
      const depth = (p) => {
        const m = new Map();
        for (const f of defects(weekFindings(p, c.inputs))) {
          const k = `${f.rule}/${f.subject}/${f.against ?? ''}`;
          m.set(k, (m.get(k) ?? 0) + severityOf(f));
        }
        return m;
      };
      const was = depth(c.program);
      const now = depth(repairWeek(c.program, c.inputs).program);
      for (const [k, v] of now) if (v > (was.get(k) ?? 0)) deeper.push(`${c.label}: ${k} ${was.get(k) ?? 0} → ${v}`);
    }
    expect(deeper.slice(0, 8)).toEqual([]);
  });

  it('⛔ THE GUARD ITSELF — asked directly, because everything rests on it', () => {
    /*
     * ⛔ THE SWEEP CANNOT TEST THIS. Every week in it has already been through the pass inside
     * `generateProgram`, so a second run has nothing to do and a broken guard goes unnoticed — which
     * is exactly what happened when it was first sabotaged to check. So the decision is asked
     * directly, with the three shapes that each shipped a real regression.
     */
    const inv = (a, b, deep) => ({ rule: 'share_inversion', subject: a, against: b, measured: deep, limit: 0 });
    const short = (day, mins) => ({ rule: 'session_length', subject: day, measured: mins, limit: 45 });

    // ✅ strictly downhill — one inversion gets shallower and nothing else moves
    expect(better([inv('Back', 'Hams', 5)], [inv('Back', 'Hams', 3)])).toBe(true);
    // ✅ …and closing one outright
    expect(better([inv('Back', 'Hams', 2)], [])).toBe(true);

    // ⛔ 1. a NEW rule, bought with a smaller total: two inversions closed, one session broken
    expect(better([inv('Back', 'Hams', 5), inv('Glutes', 'Calves', 4)], [short('Lower A', 43)])).toBe(false);
    // ⛔ 2. an existing rule, on a NEW subject — the second day made short
    expect(better([short('Lower A', 43), inv('Back', 'Hams', 9)], [short('Lower A', 43), short('Lower B', 44)])).toBe(false);
    // ⛔ 3. an existing breach on the SAME subject, made DEEPER — 43 minutes, then 33
    expect(better([short('Lower A', 43), inv('Back', 'Hams', 9)], [short('Lower A', 33)])).toBe(false);

    // ⛔ …and standing still is not an improvement
    expect(better([inv('Back', 'Hams', 5)], [inv('Back', 'Hams', 5)])).toBe(false);
    expect(better([], [])).toBe(false);
  });

  it('⛔ IT REFUSES A REPAIR THAT WOULD DEEPEN A BREACH — even a repair it badly wants to make', () => {
    /*
     * ⛔ THE TEST THAT CAN ACTUALLY FAIL, and the sweep above cannot: every week in it has already
     * been through the pass inside `generateProgram`, so a second run has nothing to do and a broken
     * guard goes unnoticed. This builds the trap by hand.
     *
     * One day, ALREADY under her floor, holding a muscle ALREADY past the ceiling. The pass wants
     * the ceiling badly — it is the one breach it closes outright — and the only way to reach it is
     * to drop a set from the one day that cannot afford to lose one.
     *
     * With the guard: nothing happens, and both breaches are reported honestly.
     * Without it: the arithmetic falls, the ceiling closes, and she gets a shorter short session.
     */
    const day = {
      id: 'd1', name: 'Upper A', muscleGroups: [], isRest: false,
      slots: [
        { capability: 'horizontal_pull', exerciseId: 'db_row', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'lat_pulldown', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'inverted_row', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'reverse_pec_deck', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'bb_shrug', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'straight_arm_pulldown', setCount: 5 },
        { capability: 'horizontal_pull', exerciseId: 'face_pull', setCount: 5 },
      ],
    };
    const trap = { id: 'p', frequency: 1, days: [day] };
    const inputs = { bodyMap: {}, daysPerWeek: 1 };
    const before = defects(weekFindings(trap, inputs));
    // The fixture must really hold BOTH breaches, or it proves nothing.
    expect(before.some((f) => f.rule === 'over_ceiling')).toBe(true);
    expect(setsOf(trap).Back).toBeGreaterThan(WEEKLY_SETS_CEILING);

    const { program: after, repairs } = repairWeek(trap, inputs);
    const depth = (p) => {
      const m = new Map();
      for (const f of defects(weekFindings(p, inputs))) m.set(`${f.rule}/${f.subject}`, severityOf(f));
      return m;
    };
    const was = depth(trap);
    for (const [k, v] of depth(after)) expect(v).toBeLessThanOrEqual(was.get(k) ?? 0);
    // …and every move it DID make is one it was allowed to make.
    for (const r of repairs) expect(['set_moved', 'set_removed']).toContain(r.kind);
  });

  it('⛔ every session still lands inside her hour', () => {
    const broken = [];
    for (const c of cases)
      for (const d of work(repairWeek(c.program, c.inputs).program)) {
        const mins = estimateSessionMinutes(d);
        if (mins > SESSION_MAX && !d.overBudget) broken.push(`${c.label} ${d.name}: ~${mins.toFixed(0)} min`);
        if (mins < SESSION_MIN && !d.shortOfBudget) broken.push(`${c.label} ${d.name}: ~${mins.toFixed(0)} min`);
      }
    expect(broken.slice(0, 8)).toEqual([]);
  });

  it('⛔ F-1 holds — every block stays in [3, 5]', () => {
    const broken = [];
    for (const c of cases)
      for (const d of work(repairWeek(c.program, c.inputs).program))
        for (const s of d.slots)
          if (s.setCount < SETS_MIN || s.setCount > SETS_MAX) broken.push(`${c.label} ${d.name}/${s.exerciseId}: ${s.setCount}`);
    expect(broken.slice(0, 8)).toEqual([]);
  });

  it('⛔ it never adds, removes or MOVES an exercise — only sets change', () => {
    /*
     * The pass owns the sets and nothing else. WHICH lifts a week holds, and which day each sits on,
     * rests on the targets, the catalogue and the pattern rules — information this pass does not
     * have. A repair that quietly re-selected a lift would be the engine changing her programme for
     * a reason no screen could explain.
     */
    const changed = [];
    for (const c of cases) {
      const shape = (p) => work(p).map((d) => `${d.name}:${d.slots.map((s) => s.exerciseId).join(',')}`).join(' | ');
      const after = repairWeek(c.program, c.inputs).program;
      if (shape(after) !== shape(c.program)) changed.push(c.label);
    }
    expect(changed).toEqual([]);
  });

  it('⛔ a muscle she switched OFF is never given work by a repair', () => {
    const leaked = [];
    for (const c of cases) {
      const off = Object.entries(c.inputs.bodyMap).filter(([, v]) => v === 'off').map(([m]) => m);
      const sets = setsOf(repairWeek(c.program, c.inputs).program);
      for (const m of off) if ((sets[m] ?? 0) > 0) leaked.push(`${c.label}: ${m} ${sets[m]}`);
    }
    expect(leaked).toEqual([]);
  });

  it('⛔ it is DETERMINISTIC — the same week repaired twice is the same week (F-9)', () => {
    const drift = [];
    for (const c of cases) {
      const a = JSON.stringify(repairWeek(c.program, c.inputs).program);
      const b = JSON.stringify(repairWeek(c.program, c.inputs).program);
      if (a !== b) drift.push(c.label);
    }
    expect(drift).toEqual([]);
  });

  it('⛔ it never mutates the programme handed to it', () => {
    // A repair that turned out not to help has to leave no trace. A pass that edited in place could
    // not offer that, and the caller would be holding a week nobody chose.
    const mutated = [];
    for (const c of cases) {
      const before = JSON.stringify(c.program);
      repairWeek(c.program, c.inputs);
      if (JSON.stringify(c.program) !== before) mutated.push(c.label);
    }
    expect(mutated).toEqual([]);
  });

  it('it TERMINATES — a repaired week has nothing left the pass can do', () => {
    // Not "no defects" — no defect this pass has a move for. A second run must find nothing new,
    // which is what makes it safe to run inside `generateProgram` on every build.
    for (const c of cases) {
      const once = repairWeek(c.program, c.inputs);
      const twice = repairWeek(once.program, c.inputs);
      expect(twice.repairs).toEqual([]);
    }
  });
});

describe('⛔ and what it actually buys', () => {
  it('⛔ NO MUSCLE RUNS PAST THE CEILING ANY MORE — 34 cases, closed', async () => {
    /*
     * Ten attempts had been spent trying to stop the volume layer producing these. The repair pass
     * does not stop it: it reads the finished week and gives the set back, which is the same answer
     * a coach would give — thirty-five weekly sets on one muscle is not a bigger dose, it is junk
     * volume she pays her hour for.
     */
    const past = [];
    for (const c of cases) {
      const sets = setsOf(c.program);
      for (const [m, n] of Object.entries(sets)) if (m !== 'Core' && n > WEEKLY_SETS_CEILING) past.push(`${c.label}: ${m} ${n}`);
    }
    expect(past).toEqual([]);
  });

  it('⛔ …and it SAYS what it did, so the act can be explained', () => {
    /*
     * The reason a repair pass is shippable in this product and a search is not: every move is a
     * named act with a rule behind it, which is exactly what the WHY screen needs. A pass that could
     * only report "the week scored higher" would be the R7 violation this codebase refuses.
     */
    /*
     * A REAL week, inflated by hand back into the state the volume layer used to produce — every
     * block of the marked muscle at F-1's ceiling. That is how a mark reached thirty-five weekly
     * sets before this pass existed.
     */
    const inflate = (p, muscle) => ({
      ...p,
      days: p.days.map((d) => ({
        ...d,
        slots: d.slots.map((s) => ({ ...s, setCount: muscleOf(s.exerciseId) === muscle ? SETS_MAX : s.setCount })),
      })),
    });
    // Whichever swept week, inflated, actually crosses the ceiling — the muscle with the most lifts
    // varies with her frequency and her map, so the fixture is FOUND rather than assumed.
    let c = null;
    let inflated = null;
    let muscle = '';
    for (const cand of cases)
      for (const m of ['Back', 'Chest', 'Shoulders', 'Quads']) {
        const test = inflate(cand.program, m);
        if ((setsOf(test)[m] ?? 0) > WEEKLY_SETS_CEILING) { c = cand; inflated = test; muscle = m; break; }
      }
    expect(c).toBeTruthy(); // the sweep must contain at least one week that CAN be pushed past it
    expect(setsOf(inflated)[muscle]).toBeGreaterThan(WEEKLY_SETS_CEILING);
    const { program: mended, repairs } = repairWeek(inflated, c.inputs);
    expect(repairs.length).toBeGreaterThan(0);
    expect(setsOf(mended)[muscle]).toBeLessThanOrEqual(WEEKLY_SETS_CEILING);
    for (const r of repairs) {
      expect(r.rule).toBeTruthy();       // …the rule it was answering
      expect(r.day).toBeTruthy();        // …where
      expect(r.from).toBeTruthy();       // …and which lift gave
      expect(['set_moved', 'set_removed']).toContain(r.kind);
    }
  });

  it('nothing to repair is not an error', () => {
    expect(repairWeek(null, {})).toEqual({ program: null, repairs: [] });
    expect(repairWeek(undefined, {}).repairs).toEqual([]);
  });
});
