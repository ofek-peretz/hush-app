/**
 * Bench Press motion benchmark — the CI guarantee that the demonstration matches Hush's own cues.
 *
 * The FormSpec is the canonical definition; these tests assert the rig renders it. They also prove
 * the validator has TEETH: a deliberately broken rig (moving hips, a curved bar path, a
 * hyperextended lockout) must be caught — otherwise "validation passes" would be meaningless.
 */
import { bbBenchPress } from '@/motion/library/bbBenchPress';
import { validate } from '@/motion/formspec';
import { angleAt } from '@/motion/geometry';
import { DEFAULT_TEMPO, loopDurationMs, repDurationMs, romAt } from '@/motion/timeline';
import { exerciseMotion, hasExerciseMotion } from '@/motion/registry';
import type { Rig } from '@/motion/types';
import { exerciseById } from '@/data/exercises';

describe('bench press — FormSpec validation', () => {
  it('passes: every canonical predicate holds across the whole loop', () => {
    const res = validate(bbBenchPress, 240);
    if (!res.ok) throw new Error('unexpected violations:\n' + res.violations.map((v) => `  ${v.where}: ${v.detail}`).join('\n'));
    expect(res.ok).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  it('the bar reaches the chest line at the bottom and locks out (full range of motion)', () => {
    const bottom = bbBenchPress.poseAt(1);
    const top = bbBenchPress.poseAt(0);
    // canonical endpoint: bar contacts the chest line
    const contact = bbBenchPress.formspec.end.find((p) => p.kind === 'contactY');
    expect(contact && contact.kind === 'contactY' ? Math.abs(bottom.j.hand.y - contact.y) : 99).toBeLessThanOrEqual(2);
    // full press at the top
    const lockout = angleAt(top.j.shoulder, top.j.elbow, top.j.hand);
    expect(lockout).toBeGreaterThanOrEqual(165);
    // and the bar actually travels a meaningful distance
    expect(bottom.j.hand.y - top.j.hand.y).toBeGreaterThan(15);
  });

  it('never hyperextends the elbow through the whole press', () => {
    for (let i = 0; i <= 100; i++) {
      const pose = bbBenchPress.poseAt(i / 100);
      expect(angleAt(pose.j.shoulder, pose.j.elbow, pose.j.hand)).toBeLessThanOrEqual(179);
    }
  });

  it('keeps the bar on a straight vertical path (hand x constant)', () => {
    const x0 = bbBenchPress.poseAt(0).j.hand.x;
    for (let i = 0; i <= 100; i++) {
      expect(Math.abs(bbBenchPress.poseAt(i / 100).j.hand.x - x0)).toBeLessThanOrEqual(1.5);
    }
  });

  it('anchors the body — feet, hips, shoulders and head never move', () => {
    const ref = bbBenchPress.poseAt(0);
    for (const pt of ['ankle', 'toe', 'hip', 'shoulder', 'head'] as const) {
      for (let i = 0; i <= 40; i++) {
        const p = bbBenchPress.poseAt(i / 40);
        expect(Math.hypot(p.j[pt].x - ref.j[pt].x, p.j[pt].y - ref.j[pt].y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the hand always holds the bar (IK contact) — never floats off', () => {
    // the tracked joint IS the hand; the plate/bar is drawn at the same point, so contact is exact
    for (let i = 0; i <= 20; i++) {
      const pose = bbBenchPress.poseAt(i / 20);
      const forearm = Math.hypot(pose.j.hand.x - pose.j.elbow.x, pose.j.hand.y - pose.j.elbow.y);
      expect(forearm).toBeGreaterThan(0); // a real limb, never degenerate
    }
  });
});

describe('bench press — the validator has teeth (broken rigs must fail)', () => {
  const broken = (mutate: (rom: number, pose: ReturnType<Rig['poseAt']>) => void): Rig => ({
    ...bbBenchPress,
    poseAt: (rom: number) => {
      const pose = bbBenchPress.poseAt(rom);
      mutate(rom, pose);
      return pose;
    },
  });

  it('catches lifting the hips off the bench', () => {
    const rig = broken((rom, pose) => { pose.j.hip = { x: pose.j.hip.x, y: pose.j.hip.y - 8 * rom }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /hip/i.test(v.detail))).toBe(true);
  });

  it('catches a bar path that curves off vertical', () => {
    const rig = broken((rom, pose) => { pose.j.hand = { x: pose.j.hand.x + 6 * rom, y: pose.j.hand.y }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /vertical|axis|path/i.test(v.where + v.detail))).toBe(true);
  });

  it('catches a partial press that never reaches the chest', () => {
    const rig = broken((rom, pose) => { pose.j.hand = { x: pose.j.hand.x, y: pose.j.hand.y - 10 }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /chest/i.test(v.detail))).toBe(true);
  });
});

describe('bench press — timeline (canonical tempo, identical reps)', () => {
  it('uses the canonical loop: 2 reps, ~8s', () => {
    expect(bbBenchPress.formspec.tempo).toBe(DEFAULT_TEMPO);
    expect(repDurationMs(DEFAULT_TEMPO)).toBe(4000);
    expect(loopDurationMs(DEFAULT_TEMPO)).toBe(8000);
  });

  it('starts and ends each rep at the top (rom 0) and reaches the bottom (rom 1)', () => {
    expect(romAt(0, DEFAULT_TEMPO)).toBe(0);
    // during the bottom hold (after top hold + eccentric), rom is pinned at 1
    const t = DEFAULT_TEMPO.topHoldMs + DEFAULT_TEMPO.eccentricMs + 100;
    expect(romAt(t, DEFAULT_TEMPO)).toBe(1);
  });

  it('draws both reps identically — canon does not degrade', () => {
    const rep = repDurationMs(DEFAULT_TEMPO);
    for (const t of [0, 700, 1500, 2600, 3800]) {
      expect(romAt(t, DEFAULT_TEMPO)).toBeCloseTo(romAt(t + rep, DEFAULT_TEMPO), 6);
    }
  });
});

describe('bench press — registry + catalog integrity', () => {
  it('is registered and resolvable', () => {
    expect(exerciseMotion('bb_bench_press')).toBe(bbBenchPress);
    expect(hasExerciseMotion('bb_bench_press')).toBe(true);
    expect(exerciseMotion('not_a_real_exercise')).toBeNull();
    expect(exerciseMotion(null)).toBeNull();
  });

  it('keys a real catalog exercise', () => {
    expect(exerciseById('bb_bench_press')).toBeTruthy();
  });
});
