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
      if (min < 45) short.push(`${c.label} Â· ${d.name}: ${d.slots.length} lifts, ~${min} min`);
      if (min > 60) long.push(`${c.label} Â· ${d.name}: ~${min} min`);
    }
  expect({ over60: long.slice(0, 12), overCount: long.length }).toEqual({ over60: [], overCount: 0 });
  expect({ under45: short.slice(0, 12), underCount: short.length }).toEqual({ under45: [], underCount: 0 });
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
