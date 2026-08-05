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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { BuildingProgrammeView, type BuildLift, type BuildMuscle } from '@/screens/onboarding/BuildingProgrammeView';
import { COACH_SHAPE_SCHEMA, parseCoachShape, type CoachPlan, type CoachShape } from '@/domain/coachPlan';
import { muscleOf, exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { db } from '@/data/local/db';
import { askCoach } from '@/platform/coach/coachClient';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_DECISION_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { currentLocale } from '@/i18n';
import { color, font } from '@/design/tokens';
import type { Profile } from '@/data/local/models';
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
  const [built, setBuilt] = useState<{ muscles: BuildMuscle[]; name: string | null; lifts: number } | null>(null);
  /** Call A's answer — her real muscles and her programme's name, while call B is still out. */
  const [sketch, setSketch] = useState<CoachShape | null>(null);

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
    const sketchedCount = sketch ? new Set(sketch.days.flatMap((d) => d.muscles)).size : 0;
    const total = built ? built.muscles.length : sketchedCount || PLACEHOLDER_MUSCLES.length;
    if (shownMuscles >= total) return;
    /* ⚠️ FAST ONCE THE ANSWER IS IN HAND — his own instruction: it must not drag on after the
       programme is built. Slow while waiting, so the screen still has somewhere to go. */
    const id = setTimeout(() => setShownMuscles((n) => n + 1), built ? 90 : MUSCLE_MS);
    return () => clearTimeout(id);
  }, [shownMuscles, built, sketch]);

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

  const build = useCallback(async () => {
    setFailed(false);
    try {
      const facts = coachFacts({ profile, plan: null, history: [], language: currentLocale() });

      /*
       * ⛔ TWO CALLS, AND THE FIRST ONE IS WHY SHE IS NOT STARING AT NOTHING (founder 2026-08-05:
       * *"the plan build takes far too long — this is the least SPOTIFY thing there is"*).
       *
       * CALL A asks for the SHAPE at `low` thinking: the programme's name and which muscles fall on
       * which day. Ten short fields, the same class of answer as a chat turn — three to eight
       * seconds against the ninety the full build can take. The screen has her real muscles and her
       * programme's NAME while call B is still out.
       *
       * ⚠️ IT IS NEVER ALLOWED TO FAIL THE BUILD. A shape that does not come back costs the screen
       * its early content and nothing else; the catalogue's muscles carry the wait exactly as they
       * did before, and call B is the one that decides whether she has a programme.
       */
      const shapeReply = await askCoach(
        coachRequest({ facts, ask: { kind: 'first_shape' } }),
        COACH_SHAPE_SCHEMA as unknown as Record<string, unknown>,
        'low',
      );
      const shape = shapeReply.ok ? parseCoachShape(shapeReply.text) : null;
      if (shape) setSketch(shape);

      /*
       * CALL B fills what A sketched. Full thinking, unchanged — `low` was measured writing a
       * one-exercise week, and the founder's ruling was explicit that the fix is not to make the
       * coach dumber. Handing it the shape makes this a SMALLER question than the one call it
       * replaces, which is why the split is expected to raise quality rather than trade it.
       */
      const reply = await askCoach(
        coachRequest({
          facts,
          ask: shape
            ? { kind: 'first_fill', shape: JSON.stringify({ title: shape.title, days: shape.days }) }
            : { kind: 'first_programme' },
        }),
        COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
      );
      if (!reply.ok) { setFailed(true); return; }
      const parsed = parseCoachPlan(reply.text);
      if (!parsed.ok || !parsed.answer.plan) { setFailed(true); return; }
      await db.recordCoachAnswer(parsed.answer, new Date().toISOString());
      /*
       * ⛔ THE ANSWER BECOMES THE SIMULATION'S SUBJECT before it becomes a navigation. The screen
       * has been drawing muscles with dashes; now it draws the real lifts, fast, and names the
       * programme — which is the beat the founder asked for and the one thing `CoachPlan` has
       * always carried and nothing has ever shown at full size.
       */
      const plan = parsed.answer.plan;
      setBuilt({
        muscles: buildMuscles(plan, inputs.units),
        name: plan.title ?? null,
        lifts: plan.sessions.reduce((n, x) => n + x.blocks.reduce((m, b) => m + b.items.length, 0), 0),
      });
      setShownMuscles(1);
    } catch {
      setFailed(true);
    }
  }, [inputs, navigation, profile]);

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
  const sketched: string[] = sketch ? [...new Set(sketch.days.flatMap((d) => d.muscles))] : [];
  const muscles: BuildMuscle[] = built
    ? built.muscles.slice(0, shownMuscles)
    : (sketched.length > 0 ? sketched : PLACEHOLDER_MUSCLES)
        .slice(0, shownMuscles)
        .map((m) => ({ muscle: m, lifts: waitingRows }));

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
      programmeName={revealed ? built?.name ?? sketch?.title ?? null : null}
      summary={
        revealed && built?.name
          ? t('ob.buildSummary', { muscles: built.muscles.length, lifts: built.lifts })
          : null
      }
    />
  );
}

/**
 * The coach's answer, grouped by muscle — his correction: *"show the muscle name and then all the
 * exercises chosen for that muscle, with the weight, reps and sets."*
 *
 * ⚠️ FIRST OCCURRENCE WINS per lift, the same reading every other surface makes: a lift the coach
 * put on two days is one prescription, not two.
 */
export function buildMuscles(plan: CoachPlan, units: 'kg' | 'lb'): BuildMuscle[] {
  const byMuscle = new Map<string, BuildLift[]>();
  const seen = new Set<string>();
  for (const session of plan.sessions) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.kind !== 'reps' || seen.has(item.ex)) continue;
        seen.add(item.ex);
        const m = muscleOf(item.ex) ?? 'Other';
        const load = item.load == null ? null : `${String(+((displayWeight(item.load, units) ?? 0).toFixed(2)))} ${unitLabel(units)}`;
        const [lo, hi] = item.reps;
        const scheme = `${block.rounds} × ${hi > lo ? `${lo}–${hi}` : lo}`;
        const row: BuildLift = { name: exerciseDisplayName(item.ex), load, scheme };
        byMuscle.set(m, [...(byMuscle.get(m) ?? []), row]);
      }
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
