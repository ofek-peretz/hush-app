/**
 * Bench Press motion benchmark — the CI guarantee that the demonstration matches Hush's own cues.
 *
 * The FormSpec is the canonical definition; these tests assert the rig renders it. They also prove
 * the validator has TEETH: a deliberately broken rig (moving hips, a bar off its rail, a partial
 * press) must be caught — otherwise "validation passes" would be meaningless.
 *
 * ── THE STAGING CHANGED, AND SO DID WHAT THESE TESTS PIN (2026-08-29) ───────────────────────────
 *
 * The rig was head-end (§3.4 Amendment 7, "a frontal identity family"), and this file used to
 * assert SYMMETRY as its identity statement — left mirroring right, every frame. It is side-view
 * now, because a clip in this app is the whole instruction rather than a label: nobody reads the
 * cues, so the picture has to be enough to perform from, and every fact a bench press is judged on
 * — bar path, touch point, elbow tuck, the bench, the planted feet — lay along the axis the old
 * camera looked down. The reasoning in full is on the rig.
 *
 * So the identity assertions moved with the camera. What is pinned now is what the new view exists
 * to show: the bar travels a real distance on a real diagonal, it arrives at the CHEST, and the
 * elbow drops below the shoulder line on the way. A test that still asserted mirror symmetry would
 * be pinning a camera nobody chose any more.
 */
// @ts-nocheck

//

import { ATHLETE } from '@/motion/anthro';
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

  it('the bar reaches the chest at the bottom and locks out (full range of motion)', () => {
    const bottom = bbBenchPress.poseAt(1);
    const top = bbBenchPress.poseAt(0);
    const contact = bbBenchPress.formspec.end.find((p) => p.kind === 'contactY');
    expect(contact && contact.kind === 'contactY' ? Math.abs(bottom.j.bar.y - contact.y) : 99).toBeLessThanOrEqual(2);
    const lockout = angleAt(top.j.shoulder, top.j.elbow, top.j.hand);
    expect(lockout).toBeGreaterThanOrEqual(158);
    expect(bottom.j.bar.y - top.j.bar.y).toBeGreaterThan(15);
  });

  it('never hyperextends the elbow through the whole press', () => {
    for (let i = 0; i <= 100; i++) {
      const pose = bbBenchPress.poseAt(i / 100);
      expect(angleAt(pose.j.shoulder, pose.j.elbow, pose.j.hand)).toBeLessThanOrEqual(179);
    }
  });

  it('the bar path is the shallow J it actually is — down, and toward the feet', () => {
    /* The one thing the head-end camera could not say. The bar leaves the lockout over the
       shoulder and arrives at the sternum, which is BOTH lower and nearer the feet; a path that
       only descended would be teaching a bar dropped onto the throat. */
    const top = bbBenchPress.poseAt(0).j.bar;
    const bottom = bbBenchPress.poseAt(1).j.bar;
    expect(bottom.y - top.y).toBeGreaterThan(25); // it descends
    expect(bottom.x - top.x).toBeGreaterThan(6); // and travels toward the feet
    // and it is monotone: no drifting back up or away mid-rep
    for (let i = 1; i <= 60; i++) {
      const a = bbBenchPress.poseAt((i - 1) / 60).j.bar;
      const b = bbBenchPress.poseAt(i / 60).j.bar;
      expect(b.y).toBeGreaterThanOrEqual(a.y - 1e-6);
      expect(b.x).toBeGreaterThanOrEqual(a.x - 1e-6);
    }
  });

  it('the elbow drops below the shoulder line at the bottom — the tuck, made visible', () => {
    const bottom = bbBenchPress.poseAt(1);
    expect(bottom.j.elbow.y).toBeGreaterThan(bottom.j.shoulder.y + 6);
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

  it('the hands always hold the bar (IK contact) — never float off', () => {
    for (let i = 0; i <= 20; i++) {
      const pose = bbBenchPress.poseAt(i / 20);
      expect(Math.abs(pose.j.hand.y - pose.j.bar.y)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(pose.j.hand.x - pose.j.bar.x)).toBeLessThanOrEqual(0.01);
      const forearm = Math.hypot(pose.j.hand.x - pose.j.elbow.x, pose.j.hand.y - pose.j.elbow.y);
      expect(forearm).toBeGreaterThan(0);
    }
  });

  it('both arm bones are canonical in three dimensions — the drawn ones are a projection', () => {
    /* The side view foreshortens the humerus, because the grip is 35u out in DEPTH from here. That
       is only legitimate if the bone underneath is real, so this reads `Pose.z` and measures it. */
    for (let i = 0; i <= 40; i++) {
      const p = bbBenchPress.poseAt(i / 40);
      const d3 = (a: string, b: string) =>
        Math.hypot(p.j[a].x - p.j[b].x, p.j[a].y - p.j[b].y, (p.z?.[a] ?? 0) - (p.z?.[b] ?? 0));
      expect(d3('shoulder', 'elbow')).toBeCloseTo(ATHLETE.upperArm, 1); // the skeleton's own number, not a literal (arm grew to 27/25, 2026-09-07)
      expect(d3('elbow', 'hand')).toBeCloseTo(ATHLETE.foreArm, 1);
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

  it('catches a bar that wanders off its declared rail', () => {
    const rig = broken((rom, pose) => { pose.j.bar = { x: pose.j.bar.x + 9 * rom, y: pose.j.bar.y - 9 * rom }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /rail|axis|path/i.test(v.where + v.detail))).toBe(true);
  });

  it('catches a partial press that never reaches the chest', () => {
    const rig = broken((rom, pose) => { pose.j.bar = { x: pose.j.bar.x, y: pose.j.bar.y - 10 }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /chest/i.test(v.detail))).toBe(true);
  });

  it('catches an elbow that never drops below the shoulder — a flared, unpressed bottom', () => {
    const rig = broken((rom, pose) => { pose.j.elbow = { x: pose.j.elbow.x, y: pose.j.shoulder.y - 2 }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /elbow/i.test(v.detail))).toBe(true);
  });
});

describe('bench press — the clip is wired to the exercise it illustrates', () => {
  it('the registry serves it under the card id', () => {
    expect(hasExerciseMotion('bb_bench_press')).toBe(true);
    expect(exerciseMotion('bb_bench_press')?.id).toBe('bb_bench_press');
    expect(exerciseById('bb_bench_press')).toBeTruthy();
  });

  it('the loop is a whole number of reps at the declared tempo', () => {
    const rep = repDurationMs(DEFAULT_TEMPO);
    const loop = loopDurationMs(DEFAULT_TEMPO);
    expect(loop % rep).toBe(0);
    expect(romAt(0, DEFAULT_TEMPO)).toBeCloseTo(0, 6);
  });
});
