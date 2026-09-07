/**
 * Pilot benchmarks (squat / row / pulldown) — the CI guarantee that each demonstration matches
 * Hush's own cues, across the three movement families the bench press could not exercise: a body
 * that travels (squat), a frozen hinge (row), and a machine/cable pull (pulldown).
 *
 * Same contract as the bench test: the FormSpec is the canonical definition and these assert the
 * rig renders it; and each family proves the validator has TEETH — a deliberately broken rig (a
 * lifted heel, a swinging torso, a partial pull) must be caught, or "validation passes" is hollow.
 */
// @ts-nocheck

// 

import { bbBackSquat } from '@/motion/library/bbBackSquat';
import { bbRow } from '@/motion/library/bbRow';
import { latPulldown } from '@/motion/library/latPulldown';
import { validate } from '@/motion/formspec';
import { angleAt, segAngle } from '@/motion/geometry';
import { exerciseMotion, hasExerciseMotion } from '@/motion/registry';
import type { Rig } from '@/motion/types';
import { exerciseById } from '@/data/exercises';

const broken = (rig: Rig, mutate: (rom: number, pose: ReturnType<Rig['poseAt']>) => void): Rig => ({
  ...rig,
  poseAt: (rom: number) => {
    const pose = rig.poseAt(rom);
    mutate(rom, pose);
    return pose;
  },
});

describe.each([
  ['bb_back_squat', bbBackSquat],
  ['bb_row', bbRow],
  ['lat_pulldown', latPulldown],
] as const)('%s — FormSpec + catalog', (id, rig) => {
  it('passes: every canonical predicate holds across the whole loop', () => {
    const res = validate(rig, 240);
    if (!res.ok) throw new Error('unexpected violations:\n' + res.violations.map((v) => `  ${v.where}: ${v.detail}`).join('\n'));
    expect(res.ok).toBe(true);
  });

  it('keeps the tracked point on a straight vertical path (x constant)', () => {
    const track = rig.formspec.path.track;
    const x0 = rig.poseAt(0).j[track].x;
    for (let i = 0; i <= 100; i++) {
      expect(Math.abs(rig.poseAt(i / 100).j[track].x - x0)).toBeLessThanOrEqual(rig.formspec.path.tol);
    }
  });

  it('is registered, resolvable, and keys a real catalog exercise', () => {
    expect(exerciseMotion(id)).toBe(rig);
    expect(hasExerciseMotion(id)).toBe(true);
    expect(exerciseById(id)).toBeTruthy();
  });
});

describe('back squat — the body travels correctly', () => {
  it('stands tall at the top and hits depth (hip crease below the knee) at the bottom', () => {
    const top = bbBackSquat.poseAt(0);
    const bottom = bbBackSquat.poseAt(1);
    // stand tall: knee + hip near-extended
    expect(angleAt(top.j.ankle, top.j.knee, top.j.hip)).toBeGreaterThanOrEqual(160);
    expect(angleAt(top.j.knee, top.j.hip, top.j.shoulder)).toBeGreaterThanOrEqual(160);
    // depth: the hip drops below the knee
    expect(bottom.j.hip.y).toBeGreaterThan(bottom.j.knee.y + 2);
  });

  it('never lets a heel leave the floor and never hyperextends the knee', () => {
    const ref = bbBackSquat.poseAt(0);
    for (let i = 0; i <= 60; i++) {
      const p = bbBackSquat.poseAt(i / 60);
      for (const pt of ['heel', 'toe', 'ankle'] as const) {
        expect(Math.hypot(p.j[pt].x - ref.j[pt].x, p.j[pt].y - ref.j[pt].y)).toBeLessThanOrEqual(0.5);
      }
      expect(angleAt(p.j.ankle, p.j.knee, p.j.hip)).toBeLessThanOrEqual(179);
    }
  });

  it('catches a lifted heel (feet must stay planted)', () => {
    const rig = broken(bbBackSquat, (rom, pose) => { pose.j.heel = { x: pose.j.heel.x, y: pose.j.heel.y - 6 * rom }; });
    expect(validate(rig, 120).ok).toBe(false);
  });

  it('catches a squat that never reaches depth', () => {
    const rig = broken(bbBackSquat, (_rom, pose) => { pose.j.hip = { x: pose.j.hip.x, y: pose.j.knee.y - 5 }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /depth/i.test(v.detail))).toBe(true);
  });
});

describe('barbell row — the hinge is frozen', () => {
  it('holds the torso angle within 3° for the entire rep (no swing)', () => {
    const ref = segAngle(bbRow.poseAt(0).j.hip, bbRow.poseAt(0).j.shoulder);
    for (let i = 0; i <= 60; i++) {
      const p = bbRow.poseAt(i / 60);
      expect(Math.abs(segAngle(p.j.hip, p.j.shoulder) - ref)).toBeLessThanOrEqual(3);
    }
  });

  it('starts at a dead hang and finishes with the bar at the lower ribs', () => {
    const hang = bbRow.poseAt(0);
    const top = bbRow.poseAt(1);
    /* 155, not 165: the hang is solved at elbow 160° (bbRow.ts) because near a straight arm the
       IK elbow jumps between frames — arms-long is a range, not 170° (execution pass, 2026-09-03). */
    expect(angleAt(hang.j.shoulder, hang.j.elbow, hang.j.hand)).toBeGreaterThanOrEqual(155);
    const rib = bbRow.formspec.end.find((p) => p.kind === 'contactY');
    expect(rib && rib.kind === 'contactY' ? Math.abs(top.j.bar.y - rib.y) : 99).toBeLessThanOrEqual(2);
    // the bar actually travels a meaningful distance
    expect(hang.j.bar.y - top.j.bar.y).toBeGreaterThan(10);
  });

  it('catches a swinging torso (the defining row fault)', () => {
    const rig = broken(bbRow, (rom, pose) => { pose.j.shoulder = { x: pose.j.shoulder.x, y: pose.j.shoulder.y - 8 * rom }; });
    const res = validate(rig, 120);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /torso|swing/i.test(v.detail))).toBe(true);
  });
});

describe('lat pulldown — seated, torso frozen, bar to the collarbone', () => {
  it('holds the torso lean within 3° for the whole rep (no swing)', () => {
    const ref = segAngle(latPulldown.poseAt(0).j.hip, latPulldown.poseAt(0).j.shoulder);
    for (let i = 0; i <= 60; i++) {
      const p = latPulldown.poseAt(i / 60);
      expect(Math.abs(segAngle(p.j.hip, p.j.shoulder) - ref)).toBeLessThanOrEqual(3);
    }
  });

  it('stretches overhead at the top and pulls to the collarbone, never lower', () => {
    const stretch = latPulldown.poseAt(0);
    const bottom = latPulldown.poseAt(1);
    /* 158, not 165: the stretch is solved at elbow 164° (latPulldown.ts) for the same continuity
       reason as the row's hang (execution pass, 2026-09-03). */
    expect(angleAt(stretch.j.shoulder, stretch.j.elbow, stretch.j.hand)).toBeGreaterThanOrEqual(158);
    const collar = latPulldown.formspec.end.find((p) => p.kind === 'contactY');
    const collarY = collar && collar.kind === 'contactY' ? collar.y : 0;
    expect(Math.abs(bottom.j.bar.y - collarY)).toBeLessThanOrEqual(2);
    // never lower than the collarbone: the bar's y never exceeds the endpoint (+ tolerance)
    for (let i = 0; i <= 100; i++) {
      expect(latPulldown.poseAt(i / 100).j.bar.y).toBeLessThanOrEqual(collarY + 2);
    }
  });

  it('catches a bar pulled past the collarbone (chest bounce)', () => {
    const rig = broken(latPulldown, (_rom, pose) => { pose.j.bar = { x: pose.j.bar.x, y: pose.j.bar.y + 12 }; });
    expect(validate(rig, 120).ok).toBe(false);
  });
});
