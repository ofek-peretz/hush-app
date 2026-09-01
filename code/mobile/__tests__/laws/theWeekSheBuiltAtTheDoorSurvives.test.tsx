/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A WEEK SHE WROTE BEFORE SHE HAD AN ACCOUNT IS THE WEEK SHE TRAINS.
 *
 * ⛔ FOUNDER, 2026-08-29: *"אני רוצה לעשות את שלב בניית התוכנית … כמסך בניית התוכנית בONBOARDING. כי
 * כרגע מה שקורה זה שאני לא יכול לבנות את התוכנית בעצמי מההתחלה."*
 *
 * The builder is intake step 3 now, which means a brand-new athlete can seal a week BEFORE any
 * profile exists — and then the last screen of onboarding calls `completeOnboarding`, whose whole
 * job is writing a profile and assembling a first programme. Those two facts are one bug waiting to
 * happen, and it has happened here before: `ImportPlan` shipped for a week with exactly this hole,
 * generating a Hush week over the top of the sheet she had photographed.
 *
 * The guard is `engineMayRebuild`, and it is invisible: nothing throws when it is wrong. She would
 * simply open the app to a programme she had never seen — after watching a reveal that named it.
 *
 * ── WHAT THIS PINS ──────────────────────────────────────────────────────────────────────────────
 *   1. The sealed week SURVIVES `completeOnboarding`, lift for lift, in order.
 *   2. It survives with `authored: 'athlete_or_coach'`, so every later rebuild gate refuses it too.
 *   3. Her `daysPerWeek` follows the week she WROTE, not the number she span on step one.
 *   4. Every one of the eight shelves survives the same road (a shelf is a draft, not a document).
 *   5. A template she then EDITED survives as edited — the change is not quietly re-materialised.
 *
 * The pure algebra is covered by `everyShelfBuilds`; what is covered here is the SEAM — the sealed
 * week meeting the one function that has permission to overwrite it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider, useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { addLift, addDay, blankDraft, removeLift, sealAuthored } from '@/domain/planBuilder';
import { PLAN_TEMPLATES, materializeTemplate } from '@/domain/planTemplates';

function Probe({ hold }: { hold: (a: any) => void }) {
  hold(useApp());
  return null;
}

async function bootFresh() {
  await AsyncStorage.clear();
  let api: any = null;
  let tree: any = null;
  await act(async () => {
    tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })));
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return { api: () => api, unmount: async () => { await act(async () => { tree.unmount(); }); } };
}

/** What the intake relays after `ConnectHealth` seals it. No body map: no intake step produces one. */
const inputs = (over: any = {}) => ({
  sex: 'female',
  weightKg: 62,
  units: 'kg',
  goal: 'build_muscle',
  daysPerWeek: 4,
  healthConnected: false,
  ...over,
});

/** The signature the athlete would recognise: which lifts, in which day, in which order. */
const shapeOf = (p: any) =>
  p.days.filter((d: any) => !d.isRest).map((d: any) => d.slots.map((s: any) => `${s.exerciseId}×${s.setCount}`).join(','));

/** The whole road, minus the screens: seal → save → finish. */
async function walkTheDoor(draft: any, over: any = {}) {
  const sealed = sealAuthored(draft);
  expect(sealed).not.toBeNull();
  const h = await bootFresh();
  await act(async () => { await h.api().saveBuiltProgram(sealed); });
  /*
   * ⚠️ `daysPerWeek` IS RE-STAMPED FROM THE WEEK, exactly as `PlanBuilder.onSave` does it — she
   * answered a number on step one and then wrote a week, and the week is the later answer.
   */
  await act(async () => {
    await h.api().completeOnboarding(inputs({ ...over, daysPerWeek: sealed.days.filter((d: any) => !d.isRest).length }));
  });
  const after = await db.loadProgram();
  const profile = await db.loadProfile();
  await h.unmount();
  return { sealed, after, profile };
}

jest.setTimeout(120_000);

describe('the week she wrote at the door', () => {
  it('⛔⛔ survives completeOnboarding, lift for lift', async () => {
    let d = blankDraft('intake_test');
    d = addLift(d, 0, 'bb_bench_press');
    d = addLift(d, 0, 'db_row');
    d = addLift(d, 0, 'triceps_pushdown');
    d = addDay(d);
    d = addLift(d, 1, 'bb_back_squat');
    d = addLift(d, 1, 'leg_curl');

    const { sealed, after, profile } = await walkTheDoor(d);
    expect(after).not.toBeNull();
    // The failure this exists for: a generated week standing where hers was, with nothing thrown.
    expect(shapeOf(after)).toEqual(shapeOf(sealed));
    expect(profile).not.toBeNull();
  });

  it('⛔ and keeps its passport, so no later rebuild may rewrite it either', async () => {
    let d = blankDraft('intake_passport');
    d = addLift(d, 0, 'bb_bench_press');
    const { after } = await walkTheDoor(d);
    expect(after.authored).toBe('athlete_or_coach');
  });

  it('⚠️ her days follow the week she WROTE, not the number she span on step one', async () => {
    /*
     * She said four on `AboutYou` and then built three. The profile, the first week's bucket and
     * every milestone ladder are cut from `daysPerWeek`, so the stale number is not cosmetic.
     */
    let d = blankDraft('intake_days');
    d = addLift(d, 0, 'bb_bench_press');
    d = addDay(d);
    d = addLift(d, 1, 'bb_back_squat');
    d = addDay(d);
    d = addLift(d, 2, 'lat_pulldown');
    const { profile } = await walkTheDoor(d, { daysPerWeek: 4 });
    expect(profile.daysPerWeek).toBe(3);
  });

  it('⛔ every proven shelf survives the same road', async () => {
    /*
     * A shelf is materialised THROUGH the builder algebra, so it is a draft like any other — but the
     * thing an athlete taps on the doors screen is a NAME, and a shelf that arrived as a document
     * would be the one week in the product nothing had sealed. Swept, because eight is few enough to
     * sweep and the failure would be per-shelf.
     */
    const failures: string[] = [];
    for (const tpl of PLAN_TEMPLATES) {
      const draft = materializeTemplate(tpl, (k: string) => k);
      const { sealed, after } = await walkTheDoor(draft);
      if (!after) failures.push(`${tpl.id} — no programme on disk`);
      else if (JSON.stringify(shapeOf(after)) !== JSON.stringify(shapeOf(sealed))) failures.push(`${tpl.id} — rewritten`);
      else if (after.authored !== 'athlete_or_coach') failures.push(`${tpl.id} — lost its passport`);
    }
    expect(failures).toEqual([]);
  });

  it('⚠️ a shelf she CHANGED lands changed — the edit is not re-materialised away', async () => {
    // The founder's second ask in one sentence: *"לקחת תוכנית נפוצה ועליה לבצע שינויים."* A week that
    // arrived back as the pristine template would answer the first half and silently drop the second.
    const tpl = PLAN_TEMPLATES[0];
    let draft = materializeTemplate(tpl, (k: string) => k);
    const dropped = draft.days[0].slots[0].exerciseId;
    draft = removeLift(draft, 0, 0);
    draft = addLift(draft, 0, 'cable_fly');

    const { after } = await walkTheDoor(draft);
    const firstDay = after.days.filter((d: any) => !d.isRest)[0];
    expect(firstDay.slots.map((s: any) => s.exerciseId)).toContain('cable_fly');
    expect(firstDay.slots.map((s: any) => s.exerciseId)).not.toContain(dropped);
  });
});
