/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY LIFT CAN SAY WHY IT IS HERE — including the one she has never trained.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תמשיך ל-WHY"* — the WHY per exercise, including "not trained yet".
 *
 * The defect was one `&&`:
 *
 *     onPress={() => (lift.changed && onWhy ? onWhy(id) : onForm(id))}
 *
 * A change needs two programmes to compare, so her FIRST week has none — and the door to the one
 * thing this product claims to do differently was shut on every row she had. `tsc` cannot see that
 * and neither could 2,578 passing tests: the card rendered perfectly. It simply could not be asked.
 *
 * So this file asks what an athlete can DO: press a row that has never moved, and read what comes
 * back. The second half mounts the sheet from a lift of a REAL generated week rather than a
 * fixture, because a sheet that only explains hand-written data explains nothing she will meet.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { PreWorkoutView } from '@/screens/plan/PreWorkout';
import { WhyHereSheet, whyHereProps } from '@/components/WhyHereSheet';
import { liftPlacement } from '@/domain/whyLiftIsHere';
import { fixtureModel } from '@/data/api/fixtureModel';
import { WEEKLY_SETS_FLOOR } from '@/engine/v5/constants';
import { exerciseDisplayName, muscleOf } from '@/data/exercises';
import { initI18n, tg as t } from '@/i18n';

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { while (mounted.length) mounted.pop().unmount(); }));
beforeAll(async () => { await initI18n(); });

const texts = (r: ReactTestRenderer): string[] =>
  r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  });

/** Her first week: one lift the engine moved, two it has never touched. */
const LIFTS = [
  { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press', load: 57.5, sets: 4, band: [8, 10], changed: 'up' },
  { exerciseId: 'db_row', name: 'Dumbbell Row', load: 22.5, sets: 4, band: [8, 10] },
  { exerciseId: 'pull_up', name: 'Pull-up', load: null, sets: 3, band: [5, 8] },
];

function card(onWhy, onForm) {
  let r;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <PreWorkoutView
          name="Upper A"
          dayLabel="Monday"
          shape="3 LIFTS · ~50 MIN"
          lifts={LIFTS}
          units="kg"
          changes={1}
          onForm={onForm}
          onWhy={onWhy}
          onStart={() => {}}
          onClose={() => {}}
        />
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

/** The row for a lift — the Pressable whose accessibility label names it. */
const rowFor = (r: ReactTestRenderer, name: string) =>
  r.root.findAll(
    (n) =>
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(name) &&
      typeof n.props?.onPress === 'function',
    { deep: true },
  )[0];

describe('⛔ the row is a door, and it is never locked', () => {
  it('⛔ a lift that has NEVER MOVED opens its reason — the whole defect, in one press', () => {
    /*
     * ⚠️ THE ONE THAT MATTERS. Every row of her first week looks like this: no delta, no history,
     * no previous programme. Before this, pressing it opened a video clip.
     */
    const asked: string[] = [];
    const clips: string[] = [];
    const r = card((id) => asked.push(id), (id) => clips.push(id));
    act(() => rowFor(r, 'Dumbbell Row').props.onPress());
    expect(asked).toEqual(['db_row']);
    expect(clips).toEqual([]);
  });

  it('a lift the engine DID move still opens its reason — nothing was traded away', () => {
    const asked: string[] = [];
    const r = card((id) => asked.push(id), () => {});
    act(() => rowFor(r, 'Barbell Bench Press').props.onPress());
    expect(asked).toEqual(['bb_bench_press']);
  });

  it('⛔ EVERY row on the card asks, not just the changed one', () => {
    const asked: string[] = [];
    const r = card((id) => asked.push(id), () => {});
    for (const l of LIFTS) act(() => rowFor(r, l.name).props.onPress());
    expect(asked).toEqual(LIFTS.map((l) => l.exerciseId));
  });

  it('the CLIP is still its own target, and it is not the reason', () => {
    // Two doors on one row (the pattern Today established): the glyph opens the video, the row
    // opens the argument. Collapsing them would have cost the clip.
    const clips: string[] = [];
    const r = card(() => {}, (id) => clips.push(id));
    const glyph = r.root.findAll(
      (n) => n.props?.accessibilityLabel === t('workout.form') && typeof n.props?.onPress === 'function',
      { deep: true },
    )[0];
    act(() => glyph.props.onPress());
    expect(clips).toHaveLength(1);
  });

  it('⛔ with NO onWhy the row still opens the clip — the fallback is not a dead press', () => {
    const clips: string[] = [];
    const r = card(undefined, (id) => clips.push(id));
    act(() => rowFor(r, 'Dumbbell Row').props.onPress());
    expect(clips).toEqual(['db_row']);
  });
});

describe('⛔ and what comes back is measured', () => {
  /** A real week, a real lift, and the placement the screen would build for it. */
  async function sheetFor(pick: (slot, program) => boolean) {
    const profile = {
      id: 'p1', sex: 'female', units: 'kg', weightKg: 62, startWeightKg: 62,
      daysPerWeek: 4, repBand: '8-10', repBandByMuscle: {}, bodyMap: { Back: 'emphasis' },
      memberSince: new Date('2026-01-01').toISOString(),
    };
    const program = await fixtureModel.generateProgram(profile);
    const slot = program.days.flatMap((d) => (d.isRest ? [] : d.slots)).find((s) => pick(s, program));
    if (!slot) throw new Error('the fixture week must contain a lift to explain');
    const p = liftPlacement(slot.exerciseId, program, profile.bodyMap, profile.daysPerWeek, []);
    let r;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <WhyHereSheet {...whyHereProps(p, exerciseDisplayName(slot.exerciseId), t, WEEKLY_SETS_FLOOR)} onClose={() => {}} />
        </SafeAreaProvider>,
      );
    });
    mounted.push(r);
    return { r, p, slot, said: texts(r).join('|') };
  }

  it('⛔ names the lift, the muscle and the sets on THIS row', async () => {
    const { said, p, slot } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Back');
    // `Legend` sets the name in caps and wraps it in bidi isolates, so the comparison strips both
    // rather than asserting the presentation — which is the sheet's business, not this law's.
    const plain = said.replace(/[⁦-⁩]/g, '').toLowerCase();
    expect(plain).toContain(exerciseDisplayName(slot.exerciseId).toLowerCase());
    expect(plain).toContain(t('muscle.Back').toLowerCase());
    expect(said).toContain(String(p.setsHere));
  });

  it('⛔ says she has not trained it yet — with no history, that is the truth about the load', async () => {
    /*
     * S-38: the opening load comes from her FIRST SET. The right-hand column of the card is blank
     * for a lift she has never performed, and this is the only honest thing to say about it.
     */
    const { said } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Back');
    expect(said).toContain(t('whyHere.firstTime'));
  });

  it('⛔ HER MARK is what it leads with — the one line she can check against her memory', async () => {
    const { said } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Back');
    expect(said).toContain(t('whyHere.titleMarked', { muscle: t('muscle.Back') }));
    expect(said).toContain(t('whyHere.marked'));
  });

  it('an UNMARKED muscle does not claim she asked for it', async () => {
    const { said } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Chest');
    expect(said).not.toContain(t('whyHere.marked'));
    expect(said).toContain(t('muscle.Chest'));
  });

  it('⛔ the WEEKLY TARGET is never printed — it is a proportion, not a promise', async () => {
    /*
     * ⛔ THE MOST IMPORTANT THING THIS SHEET DOES NOT SAY, and it is asserted rather than trusted to
     * a comment. `weeklyTargets` asks for ~208 weekly sets at five days — three hours a session —
     * because it is a set of PROPORTIONS that `enforceTimeCap` scales into her hour. Drawing "11 of
     * 28 sets" would state a goal she is being denied, and 28 was never a number anyone intended
     * her to train.
     */
    const { said, p } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Back');
    expect(p.weeklyTarget).toBeGreaterThan(p.weeklySetsHere); // the gap is real, and it is hidden
    expect(said).not.toContain(String(p.weeklyTarget));
  });

  it('⛔ it draws NO direction — a placement did not go up or down', async () => {
    /*
     * The tone laws exist because the athlete reads the colour before she reads a word. Moss is a
     * raise and blue is an ease; a lift that has never moved is neither, and lighting it in either
     * would claim a progression that has not happened on her very first sight of the exercise.
     */
    const { r } = await sheetFor((s) => muscleOf(s.exerciseId) === 'Back');
    const tones = JSON.stringify(r.toJSON());
    expect(tones).not.toContain('169,196,159'); // up
    expect(tones).not.toContain('126,178,214'); // down
  });

  it('⛔ every lift of a real week produces a sheet that renders', async () => {
    /*
     * The sweep the domain test does on the DATA, done again on the SCREEN — because a field can be
     * present and still crash the component that draws it (an empty `alsoWorks`, a Core lift with
     * no target, a name the catalogue resolves differently).
     */
    const profile = {
      id: 'p1', sex: 'male', units: 'kg', weightKg: 80, startWeightKg: 80,
      daysPerWeek: 5, repBand: '8-10', repBandByMuscle: {},
      memberSince: new Date('2026-01-01').toISOString(),
    };
    const program = await fixtureModel.generateProgram(profile);
    const slots = program.days.flatMap((d) => (d.isRest ? [] : d.slots));
    expect(slots.length).toBeGreaterThan(10);
    for (const s of slots) {
      const p = liftPlacement(s.exerciseId, program, undefined, 5, []);
      expect(p).not.toBeNull();
      let r;
      act(() => {
        r = renderer.create(
          <SafeAreaProvider initialMetrics={METRICS}>
            <WhyHereSheet {...whyHereProps(p, exerciseDisplayName(s.exerciseId), t, WEEKLY_SETS_FLOOR)} onClose={() => {}} />
          </SafeAreaProvider>,
        );
      });
      mounted.push(r);
      // …and it says something. A sheet that opens onto an empty frame is the locked door again.
      expect(texts(r).join('').length).toBeGreaterThan(40);
    }
  });
});
