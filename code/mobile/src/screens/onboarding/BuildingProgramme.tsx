/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE CALL — where the intake conversation used to be.
 *
 * ⛔ FOUNDER, 2026-08-04: *"take the chat out of the front door… my model from the start was to be
 * the SPOTIFY of the fitness world."*
 *
 * The intake was a chat because the coach had to gather everything itself. It does not any more: six
 * facts come off a form and two come from her own words, so there is nothing left to ask. This
 * screen makes ONE call and hands her a programme.
 *
 * ── ⚠️ THE WAIT IS THE PRODUCT HERE, NOT AN INTERRUPTION ────────────────────────────────────────
 * A real build takes 14–20 seconds. That is a long time to look at a spinner, and the founder said
 * so directly: *"the loading looks very static right now."*
 *
 * So this does not show progress it cannot measure — a percentage would be a lie, and a bar that
 * fills at a made-up rate is the same lie with better manners. It shows WHAT IS BEING CONSIDERED, in
 * her own facts, one line at a time: her days, her minutes, what she said she is training for. The
 * wait becomes evidence that something is being done WITH what she typed, which is the only honest
 * thing a wait can be.
 *
 * ⚠️ THE LINES ARE HERS, NOT DECORATION. Every one is a value she gave two screens ago. A generic
 * "analysing your goals…" is exactly the AI-app noise the founder is trying to get away from.
 *
 * ── WHEN IT FAILS ───────────────────────────────────────────────────────────────────────────────
 * It says so and offers to try again. It NEVER invents a programme locally: the coach is the only
 * decider, and a fallback week would be the engine coming back through a side door.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { BuildingProgrammeView, type BuildLift, type BuildMuscle } from '@/screens/onboarding/BuildingProgrammeView';
import { muscleOf, exerciseDisplayName } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { useApp } from '@/state/stores/appStore';
import { programmeName, type ProgrammeName } from '@/domain/programmeName';
import { color, font } from '@/design/tokens';
import type { Profile, Program } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'BuildingProgramme'>;

/** How long each considered line holds before the next replaces it. */
/** The rulers own the opening beat — long enough to read three figures land. */
const RULER_MS = 2200;
/** A muscle a second while the coach is still thinking; 90 ms once its answer is in hand. */
const MUSCLE_MS = 900;
/** Long enough to READ the name. A reveal she cannot see is not a reveal. */
const REVEAL_MS = 1800;
/**
 * ⚠️ THE MUSCLES A PROGRAMME COVERS, which the app knows without asking anyone — so the screen
 * has something TRUE to draw during the wait rather than a spinner. Their lifts stand as dashes
 * until the coach answers; nothing here is a guess about what it will say.
 */
const PLACEHOLDER_MUSCLES: readonly string[] = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps'];

export function BuildingProgramme({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const model = app.model;
  const { inputs } = route.params;
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  /*
   * ⛔ THE FADING LIST IS GONE (founder 2026-08-05): *"the loading screen is not good enough and
   * needs redesigning — maybe actually show a simulation of the building process."*
   *
   * It cycled four sentences of her own answers, which was right about the PRINCIPLE (never generic
   * AI noise; every line something she typed) and thin about the execution: four sentences over
   * ninety seconds is a caption on a wait. The principle survives whole in the rulers — they are
   * her three numbers, travelling — and the muscles after them are the app showing its work.
   */
  /*
   * ⛔ THE SIMULATION (founder 2026-08-05) — see `BuildingProgrammeView` for the three movements.
   *
   * This holds the CLOCK; the view holds the drawing. What matters here is that neither one ever
   * gets ahead of the truth:
   *
   *   · `fill` runs 0 → 1 over the first beat and is entirely honest — those are her own numbers.
   *   · the MUSCLES then arrive one at a time, and they are real: the catalogue knows which muscles
   *     a programme covers without asking anyone. Their lifts stand as DASHES.
   *   · when the coach's answer lands, the rows fill fast (90 ms each) and the programme is NAMED.
   *
   * ⚠️ NOTHING INVENTS A LIFT. Animating plausible-looking exercises over a call that has not
   * returned would be the app performing work it had not done, on the one screen whose entire job
   * is showing her what it did.
   */
  const [fill, setFill] = useState(0);
  const [shownMuscles, setShownMuscles] = useState(0);
  const [built, setBuilt] = useState<{ muscles: BuildMuscle[]; name: ProgrammeName | null; lifts: number } | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setFill(1), 120);
    // The rulers own the first beat; then the muscles begin arriving whether or not the coach has
    // answered, because the muscles are ours to know.
    const t1 = setTimeout(() => setShownMuscles(1), RULER_MS);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, []);

  useEffect(() => {
    if (shownMuscles === 0) return;
    /*
     * ⚠️ THE TICKER COUNTS WHAT IS ACTUALLY BEING DRAWN. It counted the catalogue's seven even
     * after call A had handed the screen HER four — so the reveal would wait for three muscles that
     * were never going to be drawn, and the fill would appear to stall for three whole seconds
     * before the name arrived. Same source as the render, or the clock is timing a different screen.
     */

    const total = built ? built.muscles.length : PLACEHOLDER_MUSCLES.length;
    if (shownMuscles >= total) return;
    /* ⚠️ FAST ONCE THE ANSWER IS IN HAND — his own instruction: it must not drag on after the
       programme is built. Slow while waiting, so the screen still has somewhere to go. */
    const id = setTimeout(() => setShownMuscles((n) => n + 1), built ? 90 : MUSCLE_MS);
    return () => clearTimeout(id);
  }, [shownMuscles, built]);

  /*
   * ⛔ THE NAME WAITS FOR THE FILL (found in the audit, 2026-08-05).
   *
   * `setBuilt` handed the view a name AND the real rows in one render — and the view draws the name
   * INSTEAD of the list, because a named programme is movement three. So the fast fill the founder
   * asked for (*"show the muscle name and then all the exercises chosen for it, with the weight,
   * reps and sets"*) rendered for zero frames: the list was replaced the instant it became real.
   *
   * The reveal is gated on the fill finishing. Then the name holds long enough to read, and only
   * then does the screen move on.
   */
  const filled = !!built && shownMuscles >= built.muscles.length;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!filled || revealed) return;
    const id = setTimeout(() => setRevealed(true), 320);
    return () => clearTimeout(id);
  }, [filled, revealed]);
  useEffect(() => {
    if (!revealed) return;
    // ⚠️ Held just long enough to READ the name, then on. A reveal she cannot see is not a reveal,
    // and one that outstays the work is the dragging he asked me to avoid.
    const id = setTimeout(() => navigation.replace('ProgramCreated', { inputs }), REVEAL_MS);
    return () => clearTimeout(id);
  }, [revealed, navigation, inputs]);

  /*
   * ⛔ HER PROFILE AS IT **WILL** BE — ASSEMBLED, NOT WRITTEN.
   *
   * `Root` renders the main app the instant `app.profile` exists (`Root.tsx:284`). Writing it here
   * would swap the navigator out from under this screen WHILE THE COACH IS STILL THINKING, and she
   * would never see her programme at all.
   *
   * ⚠️ I DID EXACTLY THAT IN THE FIRST DRAFT OF THIS SCREEN, hours after quoting the law that warns
   * about it. It is the founder's own device bug — *"it moved me straight to the transition screen
   * without showing me the plan"* — rebuilt from scratch by the person removing it.
   *
   * And the ordering is the honest one anyway: an athlete with a profile and no programme is an
   * account with nothing in it, which is precisely what a crash between the two would leave behind.
   * `ProgramCreated` writes the profile when she accepts.
   */
  const profile = React.useMemo<Profile>(
    () => ({
      name: inputs.name,
      sex: inputs.sex,
      weightKg: inputs.weightKg,
      startWeightKg: inputs.weightKg,
      age: inputs.age,
      experience: inputs.experience,
      units: inputs.units,
      goal: inputs.goal,
      daysPerWeek: inputs.daysPerWeek,
      workoutMinutes: inputs.workoutMinutes,
      healthConnected: inputs.healthConnected,
      repBand: '8-10',
      ...(inputs.goalText ? { goalText: inputs.goalText } : {}),
      ...(inputs.limitsText ? { limitsText: inputs.limitsText } : {}),
    }),
    [inputs],
  );

  /*
   * ⛔ THE PROGRAMME IS ASSEMBLED, NOT ASKED FOR (founder 2026-08-10).
   *
   * This made TWO network calls: a `low`-thinking shape, then a full-thinking fill. They existed to
   * make a ninety-second wait survivable — the founder's own words, *"the plan build takes far too
   * long, this is the least SPOTIFY thing there is"* — and the honest fix was never a faster call.
   * It was to stop making one: `generateProgram` is pure, reads her body map, and answers in
   * milliseconds. The wait it was engineered around does not exist.
   *
   * ⚠️ SO THE SCREEN'S PACING IS NOW ITS OWN. It still fills a muscle at a time, because the beat is
   * what makes her week feel composed rather than dumped — but it is a deliberate reveal of a
   * finished thing, not a progress bar for a call. Nothing on screen waits for anything.
   *
   * ⚠️ AND THERE IS NO LOAD ON IT. The coach prescribed weights here; the engine does not, and must
   * not — Loop 1 sets the opening load from her FIRST SET (S-38), so a weight printed on this screen
   * would be a number nothing had measured. Exercise, sets and her rep band are what is known now.
   */
  const build = useCallback(async () => {
    setFailed(false);
    try {
      const program = await model.generateProgram(profile);
      setBuilt({
        muscles: buildMusclesFromProgram(program, profile.repBand ?? '8-10'),
        name: programmeName(program.days, profile.bodyMap, CANONICAL_MUSCLE_ORDER),
        lifts: program.days.reduce((n, d) => n + d.slots.length, 0),
      });
      setShownMuscles(1);
    } catch {
      // A pure function that throws is a defect, not an outage — but onboarding may never be a dead
      // end, so the retry stays. It just has nothing to blame a network for any more.
      setFailed(true);
    }
  }, [profile]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void build();
  }, [build]);

  /*
   * ⛔ THE FAILURE KEEPS THE SCAFFOLD; THE BUILD DOES NOT.
   *
   * A failed call is a message and a retry button — the scaffold's shape, which every other step of
   * onboarding wears, is exactly right for that. The SIMULATION is not a step: it is the result of
   * the six she answered, and it needs the whole screen. Wrapping it in a titled scaffold would put
   * "Reading what you told me." above a screen whose entire job is showing her the reading happen.
   */
  if (failed) {
    return (
      <OnboardingScaffold
        legend={t('ob.buildingFailedLegend')}
        title={t('ob.buildingFailedTitle')}
        headGap={32}
        footer={<Button variant="primary" size="lg" block label={t('ob.buildingRetry')} onPress={() => void build()} />}
      >
        <Text style={styles.failed}>{t('ob.buildingFailedSub')}</Text>
      </OnboardingScaffold>
    );
  }

  /*
   * ⚠️ WHAT IS DRAWN IS ALWAYS WHAT IS KNOWN. Before the answer: her three numbers, then the real
   * muscles with dashed rows. After it: the real lifts, fast, and the programme's name.
   */
  /*
   * ⚠️ THREE SOURCES, IN ORDER OF HOW MUCH IS KNOWN, and never one pretending to be another:
   *   · the full plan, once call B lands — real lifts, real loads;
   *   · HER muscles from call A — real muscles, dashed rows;
   *   · the catalogue's muscles — true of any programme, dashed rows, and all the screen has in
   *     the first few seconds.
   */
  const waitingRows = [{ name: '' }, { name: '' }];
  /*
   * ⛔ THE COACH'S MUSCLE NAMES ARE FILTERED AGAINST THE CATALOGUE (audit, 2026-08-05).
   *
   * Call A returns muscle names as free text. The view prints them through `t('muscle.<name>')`, and
   * i18next returns the KEY when it does not know one — so a coach that wrote "Pecs" or "Delts"
   * would have put **"muscle.Pecs" on the first screen of her programme**, and nothing would have
   * failed anywhere. Anything the catalogue does not know is dropped rather than drawn; if that
   * leaves nothing, the catalogue's own list carries the wait exactly as it did before.
   */
  /*
   * ⚠️ TWO TIERS NOW, NOT THREE. The middle one was the coach's SKETCH — her real muscles, arriving
   * seconds before its full answer — and it existed only because the full answer was slow. There is
   * no gap to fill any more: the catalogue's muscles carry the opening beat, and the real week
   * replaces them whole.
   */
  const muscles: BuildMuscle[] = built
    ? built.muscles.slice(0, shownMuscles)
    : PLACEHOLDER_MUSCLES.slice(0, shownMuscles).map((m) => ({ muscle: m, lifts: waitingRows }));

  /*
   * The week's name, said in her language. `programmeName` returns the PARTS — the shape, the
   * muscles she leads with, the days — because Hebrew assembles this sentence differently, and a
   * domain module that returned English prose would be a second copy layer nobody translates.
   */
  const named = built?.name
    ? [
        t(built.name.key),
        t('plan.weekDays', { n: built.name.days }),
        ...(built.name.led.length > 0
          ? [t('plan.led', { muscles: built.name.led.map((m) => t(`muscle.${m}`)).join(' · ') })]
          : []),
      ].join(' · ')
    : null;

  /* ⚠️ `weightKg` and `age` are optional on the intake type; a ruler with no number to travel to
     sits at zero rather than crashing on the last screen before her programme. */
  return (
    <BuildingProgrammeView
      days={inputs.daysPerWeek}
      weight={Math.round(displayWeight(inputs.weightKg ?? 0, inputs.units) ?? 0)}
      age={inputs.age ?? 0}
      unit={unitLabel(inputs.units)}
      fill={fill}
      muscles={muscles}
      programmeName={revealed ? named : null}
      summary={
        revealed && named
          ? t('ob.buildSummary', { muscles: built.muscles.length, lifts: built.lifts })
          : null
      }
    />
  );
}

/**
 * The assembled week, grouped by muscle — the founder's own correction: *"show the muscle name and
 * then all the exercises chosen for that muscle."*
 *
 * ⚠️ FIRST OCCURRENCE WINS per lift, the same reading every other surface makes: a lift the assembler
 * put on two days is one prescription, not two.
 *
 * ⛔ AND THERE IS NO LOAD COLUMN. Its predecessor read a weight off the coach's plan; the engine
 * decides an opening load from her FIRST SET (Loop 1, S-38), so there is genuinely no weight to show
 * yet. `load: null` is what the row renders as a dash — the honest answer, and the same one every
 * untrained lift gives everywhere else in the app.
 */
export function buildMusclesFromProgram(program: Program, repBand: string): BuildMuscle[] {
  const byMuscle = new Map<string, BuildLift[]>();
  const seen = new Set<string>();
  for (const day of program.days) {
    if (day.isRest) continue;
    for (const slot of day.slots) {
      if (seen.has(slot.exerciseId)) continue;
      seen.add(slot.exerciseId);
      const m = muscleOf(slot.exerciseId) ?? 'Other';
      const row: BuildLift = {
        name: exerciseDisplayName(slot.exerciseId),
        load: null,
        scheme: `${slot.setCount} × ${repBand.replace('-', '–')}`,
      };
      byMuscle.set(m, [...(byMuscle.get(m) ?? []), row]);
    }
  }
  return [...byMuscle].map(([muscle, lifts]) => ({ muscle, lifts }));
}

const styles = StyleSheet.create({
  considering: { marginTop: 8 },
  // The coach's own italic serif — this is it thinking out loud, not the app reporting a status.
  line: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 32,
    color: color.textSecondary,
    textAlign: 'left',
  },
  failed: {
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 25,
    color: color.textSecondary,
    textAlign: 'left',
  },
});
