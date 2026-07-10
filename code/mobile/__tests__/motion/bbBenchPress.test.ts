/**
 * Bench Press motion benchmark — the CI guarantee that the demonstration matches Hush's own cues.
 *
 * The FormSpec is the canonical definition; these tests assert the rig renders it. They also prove
 * the validator has TEETH: a deliberately broken rig (moving hips, a curved bar path, a
 * hyperextended lockout) must be caught — otherwise "validation passes" would be meaningless.
 *
 * The rig is FRONT-VIEW (head-end camera) per §3.4 Amendment 7 — the chest family is a frontal
 * identity family. The canon is unchanged: bar to the chest line, vertical path, anchored body;
 * the frontal staging adds SYMMETRY, which these tests assert as mirror geometry.
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
    expect(contact && contact.kind === 'contactY' ? Math.abs(bottom.j.bar.y - contact.y) : 99).toBeLessThanOrEqual(2);
    // full press at the top — canonical in-plane arm, no projection license needed at lockout
    const lockout = angleAt(top.j.shoulderR, top.j.elbowR, top.j.handR);
    expect(lockout).toBeGreaterThanOrEqual(165);
    // and the bar actually travels a meaningful distance
    expect(bottom.j.bar.y - top.j.bar.y).toBeGreaterThan(15);
  });

  it('never hyperextends the elbow through the whole press', () => {
    for (let i = 0; i <= 100; i++) {
      const pose = bbBenchPress.poseAt(i / 100);
      expect(angleAt(pose.j.shoulderR, pose.j.elbowR, pose.j.handR)).toBeLessThanOrEqual(179);
    }
  });

  it('keeps the bar on a straight vertical path (hand x constant)', () => {
    const x0 = bbBenchPress.poseAt(0).j.handR.x;
    for (let i = 0; i <= 100; i++) {
      expect(Math.abs(bbBenchPress.poseAt(i / 100).j.handR.x - x0)).toBeLessThanOrEqual(1.5);
    }
  });

  it('is symmetric — the frontal identity statement: left mirrors right every frame', () => {
    for (let i = 0; i <= 40; i++) {
      const p = bbBenchPress.poseAt(i / 40);
      const cx = p.j.bar.x;
      for (const [r, l] of [['handR', 'handL'], ['elbowR', 'elbowL'], ['shoulderR', 'shoulderL']] as const) {
        expect(Math.abs(p.j[r].x + p.j[l].x - 2 * cx)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(p.j[r].y - p.j[l].y)).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('anchors the body — feet, hips, shoulders and head never move', () => {
    const ref = bbBenchPress.poseAt(0);
    for (const pt of ['ankleR', 'toeR', 'hipC', 'shoulderR', 'head'] as const) {
      for (let i = 0; i <= 40; i++) {
        const p = bbBenchPress.poseAt(i / 40);
        expect(Math.hypot(p.j[pt].x - ref.j[pt].x, p.j[pt].y - ref.j[pt].y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the hands always hold the bar (IK contact) — never float off', () => {
    // the tracked joints ride the bar's y exactly; the forearm is a real limb, never degenerate
    for (let i = 0; i <= 20; i++) {
      const pose = bbBenchPress.poseAt(i / 20);
      expect(Math.abs(pose.j.handR.y - pose.j.bar.y)).toBeLessThanOrEqual(0.01);
      const forearm = Math.hypot(pose.j.handR.x - pose.j.elbowR.x, pose.j.handR.y - pose.j.elbowR.y);
      expect(forearm).toBeGreaterThan(0);
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
    const rig = broken((rom, pose) => { pose.j.hipC = { x: pose.j.hipC.x, y: pose.j.hipC.y - 8 * rom }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /hip/i.test(v.detail))).toBe(true);
  });

  it('catches a bar path that curves off vertical', () => {
    const rig = broken((rom, pose) => { pose.j.handR = { x: pose.j.handR.x + 6 * rom, y: pose.j.handR.y }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /vertical|axis|path/i.test(v.where + v.detail))).toBe(true);
  });

  it('catches a partial press that never reaches the chest', () => {
    const rig = broken((rom, pose) => { pose.j.bar = { x: pose.j.bar.x, y: pose.j.bar.y - 10 }; });
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
