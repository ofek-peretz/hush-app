/**
 * Hermetic program-quality verification (founder-directed 2026-06-23). Every athlete
 * category — sex × daysPerWeek × goal × age — must yield a program that satisfies EVERY
 * requirement, with NO scheduling/recovery-day logic (the athlete trains N workouts whenever
 * they choose). Requirements verified here:
 *   • prescribed work ≤ 60 min (warm-ups excluded)
 *   • the six fundamental movement patterns are covered each week (incl. VERTICAL PULL)
 *   • compounds before isolation in every day; supplemental core last
 *   • sane weekly volume per muscle; valid slots (capability + set bounds)
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { exerciseById, fundamentalPattern, FUNDAMENTAL_PATTERNS, movementPattern } from '@/data/exercises';
import type { Capability, Goal, Profile, Program } from '@/data/local/models';

const GOALS: Goal[] = ['get_stronger', 'build_muscle', 'general_fitness', 'toning'];
const AGES = [undefined, 25, 45, 68, 72];
const profile = (over: Partial<Profile>): Profile => ({
  units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, ...over,
});

async function eachProgram(fn: (p: Program, ctx: { sex: 'male' | 'female'; days: number }) => void) {
  for (const sex of ['male', 'female'] as const) {
    for (let days = 1; days <= 6; days++) {
      for (const goal of GOALS) {
        for (const age of AGES) {
          const prog = await fixtureModel.generateProgram(profile({ sex, daysPerWeek: days, goal, age }));
          fn(prog, { sex, days });
        }
      }
    }
  }
}

describe('every program fits in one hour of prescribed work (warm-ups excluded)', () => {
  it('no generated day exceeds 60 minutes', async () => {
    await eachProgram((prog, { sex, days }) => {
      for (const d of prog.days) {
        expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(60);
      }
      void sex; void days;
    });
  });
});

describe('movement-pattern coverage — the six fundamentals, including vertical pull', () => {
  it('every 2+ day week covers all six patterns from its compound lifts', async () => {
    await eachProgram((prog, { days }) => {
      if (days < 2) return;
      const patterns = new Set(
        prog.days.flatMap((d) => d.slots.map((s) => fundamentalPattern(s.exerciseId)).filter(Boolean)),
      );
      for (const p of FUNDAMENTAL_PATTERNS) expect(patterns.has(p)).toBe(true);
    });
  });

  it('vertical pull is present and distinct (not folded away) in every 2+ day week', async () => {
    await eachProgram((prog, { days }) => {
      if (days < 2) return;
      const hasVerticalPull = prog.days.some((d) =>
        d.slots.some((s) => movementPattern(s.exerciseId) === 'vertical_pull'),
      );
      expect(hasVerticalPull).toBe(true);
    });
  });
});

describe('exercise ordering — compounds precede isolation; core is last', () => {
  it('no isolation lift is placed before a compound in any day', async () => {
    await eachProgram((prog) => {
      for (const d of prog.days) {
        let seenIsolation = false;
        for (const s of d.slots) {
          const tier = exerciseById(s.exerciseId)!.tier;
          if (tier === 'isolation') seenIsolation = true;
          else expect(seenIsolation).toBe(false); // a compound after an isolation => fail
        }
      }
    });
  });

  it('same-equipment lifts are adjacent within each phase (no leave-and-return)', async () => {
    // Founder gym-flow rule: don't bounce off a station and come back. Verified per phase
    // (compounds, isolation) on the primary work — the supplemental core is exempt (it is
    // pinned last by its own rule, which may cost one revisit).
    const contiguous = (equips: string[]): boolean => {
      let prev: string | null = null;
      const closed = new Set<string>();
      for (const e of equips) {
        if (e === prev) continue;
        if (closed.has(e)) return false; // this station was already finished — a revisit
        if (prev !== null) closed.add(prev);
        prev = e;
      }
      return true;
    };
    await eachProgram((prog) => {
      for (const d of prog.days) {
        const primary = d.slots.filter((s) => !s.supplemental);
        for (const tier of ['compound', 'isolation'] as const) {
          const equips = primary
            .filter((s) => exerciseById(s.exerciseId)!.tier === tier)
            .map((s) => exerciseById(s.exerciseId)!.equipment);
          expect(contiguous(equips)).toBe(true);
        }
      }
    });
  });

  it('the supplemental core block, when present, is the final slot of its day', async () => {
    await eachProgram((prog) => {
      for (const d of prog.days) {
        const coreAt = d.slots.findIndex((s) => exerciseById(s.exerciseId)?.muscle === 'Core');
        if (coreAt >= 0) expect(coreAt).toBe(d.slots.length - 1);
      }
    });
  });
});

describe('volume + slot validity', () => {
  it('weekly sets per muscle stay in a sane band; every slot is valid', async () => {
    await eachProgram((prog) => {
      const perMuscle = new Map<string, number>();
      for (const d of prog.days) {
        for (const s of d.slots) {
          const ex = exerciseById(s.exerciseId)!;
          expect(ex.capability).toBe(s.capability); // slot capability contract
          expect(s.setCount).toBeGreaterThanOrEqual(3);
          expect(s.setCount).toBeLessThanOrEqual(5);
          perMuscle.set(ex.muscle, (perMuscle.get(ex.muscle) ?? 0) + s.setCount);
        }
      }
      for (const [, sets] of perMuscle) {
        expect(sets).toBeGreaterThanOrEqual(3); // a trained muscle gets a real dose
        expect(sets).toBeLessThanOrEqual(40); // nothing runs away (e.g. duplicate insertion)
      }
    });
  });
});

describe('capability coverage (5 active capabilities) holds for 3+ day weeks', () => {
  const CAPS: Capability[] = [
    'horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant',
  ];
  it('every 3+ day week trains all five capabilities', async () => {
    await eachProgram((prog, { days }) => {
      if (days < 3) return;
      const caps = new Set(prog.days.flatMap((d) => d.slots.map((s) => s.capability)));
      for (const c of CAPS) expect(caps.has(c)).toBe(true);
    });
  });
});
