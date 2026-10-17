/**
 * hinge — the deadlift family (bb_deadlift · bb_rdl · db_rdl · good_morning), the first rollout
 * batch of the founder's world-class pass (2026-08-23): a beginner's scariest lifts are exactly
 * the ones that must demonstrate themselves.
 *
 * Same contract as the pilot benchmarks: the FormSpec is the canonical definition, these assert
 * the rig renders it — and each new mechanism proves the validator has TEETH against it, or
 * "validation passes" is hollow.
 */
// @ts-nocheck

//

import { bbDeadlift, bbRdl, dbRdl, goodMorning } from '@/motion/library/hinge';
import { validate } from '@/motion/formspec';
import { hasExerciseMotion } from '@/motion/registry';
import { exerciseById } from '@/data/exercises';
import type { Rig } from '@/motion/types';

const broken = (rig: Rig, mutate: (rom: number, pose: ReturnType<Rig['poseAt']>) => void): Rig => ({
  ...rig,
  poseAt: (rom: number) => {
    const pose = rig.poseAt(rom);
    mutate(rom, pose);
    return pose;
  },
});

describe.each([
  ['bb_deadlift', bbDeadlift],
  ['bb_rdl', bbRdl],
  ['db_rdl', dbRdl],
  ['good_morning', goodMorning],
] as const)('%s — FormSpec + catalog', (id, rig) => {
  it('passes: every canonical predicate holds across the whole loop', () => {
    const res = validate(rig, 240);
    if (!res.ok) throw new Error('unexpected violations:\n' + res.violations.map((v) => `  ${v.where}: ${v.detail}`).join('\n'));
    expect(res.ok).toBe(true);
  });

  it('is registered, and demonstrates a lift the catalogue actually prescribes', () => {
    expect(rig.id).toBe(id);
    expect(hasExerciseMotion(id)).toBe(true);
    expect(exerciseById(id)).toBeTruthy();
  });
});

describe('the clock tells the hinge story (§3.6)', () => {
  it('⛔ the deadlift opens at the FLOOR and pulls first — the bar honestly rests there', () => {
    expect(bbDeadlift.formspec.tempo.startAt).toBe('bottom');
  });

  it('the RDLs unrack standing and lower first, like every barbell press', () => {
    expect(bbRdl.formspec.tempo.startAt).toBe('top');
    expect(dbRdl.formspec.tempo.startAt).toBe('top');
  });
});

describe('the cues, measured', () => {
  it('⛔ "keep the bar close": the RDL bar never drifts off the SHIN, measured to the shin', () => {
    /*
     * Measured perpendicular to the ankle→knee segment, not as |bar.x − knee.x|.
     *
     * The old form compared the bar to the knee JOINT's x, which is only the same thing while the
     * shin is vertical. The RDL's shin now leans 5° back — the knee sits over the heel, which is
     * what lets the hip travel above the knee instead of below it — and the knee joint is 5.2u
     * behind the bar while the bar is still touching the shin's front surface. The cue is about
     * the shin, so the test measures the shin.
     */
    /** Distance from `p` to the segment a→b (not to its infinite line — the leg is finite). */
    const toSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    for (let i = 0; i <= 40; i++) {
      const j = bbRdl.poseAt(i / 40).j;
      const off = Math.min(toSeg(j.bar, j.ankle, j.knee), toSeg(j.bar, j.knee, j.hip));
      /*
       * To the nearest LEG BONE, and the bound is the plate's own radius plus a little: the bar
       * hangs plumb under a shoulder that travels forward while the thigh sweeps back, so the two
       * do separate through the middle of the descent (18.5u at the widest, about 11u of air past
       * the thigh's surface) and the 45cm plate is what still covers the gap. What the cue rules
       * out is the bar swinging out in FRONT of the athlete, and at 20 it cannot.
       */
      expect(off).toBeLessThanOrEqual(20);
    }
  });

  it('⛔ the deadlift bottom is the PLATES ON THE FLOOR — a 45cm plate, exactly grounded', () => {
    const { PLATE_R } = require('@/motion/anthro');
    const bar = bbDeadlift.poseAt(1).j.bar;
    /* Read from `PLATE_R` rather than repeating it. The literal 16 was the plate radius AND the
       assertion, so when the radius was corrected to a true 45 cm plate (20u — the old one was a
       36 cm plate under a comment claiming 45) this test failed for the one reason it should never
       fail: the drawing and the constant agreeing with each other. */
    expect(bar.y).toBeCloseTo(193 - PLATE_R, 5); // floor − plate radius: resting, not hovering
    expect(PLATE_R).toBe(20);
  });

  it('the good morning hinges DEEP — the hip closes at least 60° from standing', () => {
    const { angleAt } = require('@/motion/geometry');
    const at = (rom) => {
      const j = goodMorning.poseAt(rom).j;
      return angleAt(j.knee, j.hip, j.shoulder);
    };
    expect(at(0) - at(1)).toBeGreaterThanOrEqual(60);
  });
});

describe('the validator has teeth against the new mechanisms', () => {
  it('catches a heel that leaves the floor mid-pull', () => {
    const bad = broken(bbDeadlift, (rom, pose) => {
      if (rom > 0.4) pose.j.heel = { x: pose.j.heel.x, y: pose.j.heel.y - 3 };
    });
    expect(validate(bad, 120).ok).toBe(false);
  });

  it('catches an RDL knee that travels — the squat creeping into the hinge', () => {
    const bad = broken(bbRdl, (rom, pose) => {
      pose.j.knee = { x: pose.j.knee.x + 6 * rom, y: pose.j.knee.y };
    });
    expect(validate(bad, 120).ok).toBe(false);
  });

  it('catches a bar that drifts off its vertical line', () => {
    const bad = broken(bbDeadlift, (rom, pose) => {
      pose.j.bar = { x: pose.j.bar.x + 4 * rom, y: pose.j.bar.y };
    });
    expect(validate(bad, 120).ok).toBe(false);
  });
});

/*
 * ── THE TEMPO'S PHASES LAND ON THE RIGHT HALVES ────────────────────────────────────────────────
 * `DEFAULT_TEMPO` documents itself as "2.0s down · 0.4s hold · 1.1s up": the ECCENTRIC is the slow
 * one. Which half of a rep that is depends on the exercise — a bench press lowers to rom 1, a curl
 * SQUEEZES to it — and the timeline used to assume the first case for all 136 clips. These pin the
 * classification so a future edit that flips one gets caught.
 */
describe('the tempo, measured', () => {
  const { EXERCISE_MOTION } = require('@/motion/registry') as typeof import('@/motion/registry');
  const { romAt, repDurationMs } = require('@/motion/timeline') as typeof import('@/motion/timeline');

  /** Milliseconds the loop spends travelling from where the rep opens to the far end. */
  const msToFarEnd = (id: string): number => {
    const t = EXERCISE_MOTION[id].formspec.tempo;
    const open = romAt(0, t);
    for (let ms = 0; ms < repDurationMs(t); ms += 5) {
      if (Math.abs(romAt(ms, t) - open) > 0.98) return ms;
    }
    throw new Error(`${id} never reaches its far end`);
  };

  it('⛔ lowers slowly and lifts quickly — never the other way round', () => {
    // the eccentric half: a press, a squat, a lowering
    for (const id of ['bb_bench_press', 'bb_back_squat', 'push_up', 'skullcrusher', 'walking_lunge']) {
      expect(msToFarEnd(id)).toBeGreaterThan(1800);
    }
    // the concentric half: a curl, a row, a pull, a raise, a press to lockout
    for (const id of ['bb_curl', 'bb_row', 'lat_pulldown', 'pull_up', 'standing_calf_raise', 'hip_thrust', 'bb_overhead_press', 'leg_press']) {
      expect(msToFarEnd(id)).toBeLessThan(1700);
    }
    // …and the deadlift, which opens ON THE FLOOR and therefore pulls first
    expect(msToFarEnd('bb_deadlift')).toBeLessThan(1700);
  });
});
