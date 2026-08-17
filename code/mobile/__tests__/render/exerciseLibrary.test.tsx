/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EXERCISE LIBRARY — THE DOOR, AND THE TWO THINGS ONLY THE SCREEN CAN GET WRONG.
 *
 * ⛔ FOUNDER, 2026-08-16: *"תרגילים אהובים או שנואים או ספרייה של תרגילים."*
 *
 * `whatSheChoseIsInHerWeek` already proves the ENGINE half — a pick leads its muscle, a refusal is a
 * gate, neither buys volume. Every one of those paths was reachable only from that test: the
 * declarations existed and she had no way to make one. This covers the half that ships to her.
 *
 * ── WHAT ONLY THIS SCREEN CAN BE WRONG ABOUT ────────────────────────────────────────────────────
 *   · **Offering a lift the assembler cannot deal.** `isSwapOnly` lifts exist to be substituted IN
 *     at a busy station; nothing ever generates one. Listing them would let her pick a lift that
 *     then never appears — a promise the screen has no way to keep.
 *   · **Letting her refuse the last lift of a muscle she left ON.** The assembler survives it by
 *     ignoring the refusals, and surviving is not being honest: she would tap, see it marked
 *     refused, and be handed it anyway next week. That silent-ignore is the exact failure this
 *     codebase keeps finding, so the tap is refused with a sentence instead.
 *
 * ⚠️ AND THE SHAPE THAT IS SAVED IS THE SHAPE THE ENGINE READS. `chosenByMuscle` keyed by muscle in
 * HER order, `refusedIds` flat across all of them — the same fields `programAssembly` takes. A
 * screen that saved a near-miss would pass every test it owned and change nothing about her week.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import fs from 'fs';
import path from 'path';

import { ExerciseLibrary } from '@/screens/profile/ExerciseLibrary';
import { libraryPool, refusalBlock, cleanPicks } from '@/domain/exerciseLibrary';
import { EXERCISES, isSwapOnly, exercisesForMuscle } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { initI18n, tg } from '@/i18n';

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const savedCalls: Array<[Record<string, string[]>, string[]]> = [];

let mockBodyMap: Record<string, string> = {};
jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    profile: { bodyMap: mockBodyMap, repBandByMuscle: {} },
    saveLibrary: async (chosen: Record<string, string[]>, refused: string[]) => {
      savedCalls.push([chosen, refused]);
      return true;
    },
  }),
}));
jest.mock('@/components/ds', () => {
  const actual = jest.requireActual('@/components/ds');
  return { ...actual, useToast: () => ({ show: () => {} }) };
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
  savedCalls.length = 0;
  mockBodyMap = {};
});

/**
 * Mount and let the stored declarations land.
 *
 * The screen loads her existing picks in an effect, so a synchronous mount leaves a `setState`
 * outside `act` — and a warning that always fires is a warning nobody reads the next time it means
 * something. Settled here instead.
 */
async function mount(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ExerciseLibrary navigation={{ goBack: () => {} }} />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  mounted.push(r);
  return r;
}

const pressLabel = (r: ReactTestRenderer, label: string) => {
  const n = r.root.find((x) => x.props.accessibilityLabel === label && typeof x.props.onPress === 'function');
  act(() => n.props.onPress());
};

const texts = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props.children != null)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));

describe('⛔ she can reach it, or it is not a feature', () => {
  it('the profile page has a door to it', () => {
    expect(read('screens/profile/ProfileSheet.tsx')).toMatch(/navigate\('ExerciseLibrary'\)/);
  });

  it('and the stack registers the screen behind it', () => {
    expect(read('app/Root.tsx')).toMatch(/name="ExerciseLibrary"/);
    expect(read('app/navigation.ts')).toMatch(/ExerciseLibrary: undefined;/);
  });
});

describe('⛔ she is only offered lifts the engine can actually deal her', () => {
  it('no swap-only lift is listed, for any muscle', () => {
    for (const m of CANONICAL_MUSCLE_ORDER) {
      for (const e of libraryPool(m)) expect(isSwapOnly(e.id)).toBe(false);
    }
  });

  it('⚠️ and the pool is otherwise the whole muscle — nothing else is quietly withheld', () => {
    for (const m of CANONICAL_MUSCLE_ORDER) {
      const all = exercisesForMuscle(m).filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
      expect(libraryPool(m).map((e) => e.id)).toEqual(all);
    }
  });
});

describe('⛔ the last lift of a muscle she left ON cannot be refused', () => {
  const muscle = 'Chest';
  const pool = libraryPool(muscle).map((e) => e.id);

  it('the refusal is allowed while anything is left', () => {
    expect(refusalBlock(muscle, pool[0], new Set())).toBeNull();
  });

  it('⛔ and refused when it would empty the muscle', () => {
    const allButOne = new Set(pool.slice(1));
    expect(refusalBlock(muscle, pool[0], allButOne)).toBe('last_lift');
  });

  it('⛔ the screen SAYS so rather than dropping the tap', async () => {
    const r = await mount();
    // Open Chest, then refuse every lift in it. The last one must produce the sentence.
    pressLabel(r, tg('muscle.Chest'));
    const names = libraryPool(muscle).map((e) => e.name);
    for (const n of names.slice(0, -1)) pressLabel(r, `${n} — ${tg('library.stance.refused')}`);
    expect(texts(r)).not.toContain(tg('library.lastLift', { muscle: tg('muscle.Chest') }));
    pressLabel(r, `${names[names.length - 1]} — ${tg('library.stance.refused')}`);
    expect(texts(r)).toContain(tg('library.lastLift', { muscle: tg('muscle.Chest') }));
  });
});

describe('⛔ what she taps is what the engine is handed', () => {
  it('a pick is saved under its MUSCLE, in her order', async () => {
    const r = await mount();
    pressLabel(r, tg('muscle.Chest'));
    const [a, b] = libraryPool('Chest');
    // Picked second-then-first on purpose: her ORDER is the seating plan `pickExercises` reads.
    pressLabel(r, `${b.name} — ${tg('library.stance.picked')}`);
    pressLabel(r, `${a.name} — ${tg('library.stance.picked')}`);
    pressLabel(r, tg('library.save'));
    await act(async () => { await Promise.resolve(); });
    expect(savedCalls).toHaveLength(1);
    expect(savedCalls[0][0].Chest).toEqual([b.id, a.id]);
  });

  it('⚠️ taking a pick back really REMOVES it — absence is how she says "I never said"', async () => {
    const r = await mount();
    pressLabel(r, tg('muscle.Chest'));
    const a = libraryPool('Chest')[0];
    pressLabel(r, `${a.name} — ${tg('library.stance.picked')}`);
    pressLabel(r, `${a.name} — ${tg('library.stance.none')}`);
    pressLabel(r, tg('library.save'));
    await act(async () => { await Promise.resolve(); });
    expect(savedCalls[0][0]).not.toHaveProperty('Chest');
  });

  it('⛔ a refusal is saved FLAT, across every muscle — the field the assembler reads', async () => {
    const r = await mount();
    pressLabel(r, tg('muscle.Chest'));
    const a = libraryPool('Chest')[0];
    pressLabel(r, `${a.name} — ${tg('library.stance.refused')}`);
    pressLabel(r, tg('library.save'));
    await act(async () => { await Promise.resolve(); });
    expect(savedCalls[0][1]).toEqual([a.id]);
  });
});

describe('⛔ a pick for a muscle she switched OFF is not deleted', () => {
  /*
   * `saveLibrary` replaces `chosenByMuscle` wholesale, and the first build assembled it from the ON
   * muscles only — so picking three chest lifts, switching Chest off, and then saving ANYTHING in
   * here erased those picks for ever. Her refusals survived it (`refusedIds` is flat), which made
   * the asymmetry worse: turn Chest back on and only the refusals came back.
   *
   * A muscle being off is a statement about THIS WEEK, not about what she likes.
   */
  it('⛔ her chest picks survive Chest being switched off', async () => {
    const a = libraryPool('Chest')[0];
    // She picked a chest lift on a previous visit; today Chest is off.
    const store = require('@/data/local/db');
    await store.db.savePreferences({ ...(await store.db.loadPreferences()), chosenByMuscle: { Chest: [a.id] }, refusedIds: [] });
    mockBodyMap = { Chest: 'off' };

    const r = await mount();
    const back = libraryPool('Back')[0];
    pressLabel(r, tg('muscle.Back'));
    pressLabel(r, `${back.name} — ${tg('library.stance.picked')}`);
    pressLabel(r, tg('library.save'));
    await act(async () => { await Promise.resolve(); });

    expect(savedCalls[0][0].Chest).toEqual([a.id]); // carried through, untouched
    expect(savedCalls[0][0].Back).toEqual([back.id]);
  });
});

describe('⚠️ a pick she later refused is dropped, not argued with', () => {
  it('cleanPicks resolves the contradiction toward the newer decision', () => {
    const [a, b] = libraryPool('Chest');
    expect(cleanPicks('Chest', [a.id, b.id], new Set([a.id]))).toEqual([b.id]);
  });

  it('⚠️ and an id the catalogue no longer carries goes the same way', () => {
    expect(cleanPicks('Chest', ['a_lift_from_a_past_release'], new Set())).toEqual([]);
  });

  it('⚠️ …including a real lift filed under a DIFFERENT muscle', () => {
    const back = EXERCISES.find((e) => e.muscle === 'Back' && !isSwapOnly(e.id));
    expect(cleanPicks('Chest', [back.id], new Set())).toEqual([]);
  });
});
