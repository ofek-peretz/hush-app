/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROGRAMME BEING BUILT — a simulation, not a spinner.
 *
 * ⛔ FOUNDER, 2026-08-05: *"the loading screen READING WHAT YOU TOLD ME is not good enough and needs
 * redesigning. Maybe actually show a simulation of the building process… be as creative as you
 * possibly can here, because this is the part where the user sees the programme they are getting
 * for the first time, and right now it is very banal."* Then, on the draft:
 *
 *   > *"I want it as a simulation — every ruler starting from zero and travelling to the number
 *   > that was set. And the second screen with the exercise and the weight is a bit odd, because
 *   > you only see a name and a weight — what about the sets and the reps? Show the muscle name and
 *   > then all the exercises chosen for that muscle, with the weight, reps and sets."*
 *
 * ── THREE MOVEMENTS ─────────────────────────────────────────────────────────────────────────────
 *   1. HER OWN NUMBERS arrive where she left them. Each ruler fills from zero and the figure counts
 *      with it. The last thing she touched is the first thing she sees, so the screen is obviously
 *      about her rather than about us.
 *   2. THE MUSCLES fill in, one at a time, each with the lifts chosen for it — load, sets and band.
 *      A name and a weight is a shopping list; three numbers is a prescription.
 *   3. THE PROGRAMME IS NAMED. `CoachPlan` has carried a name since it was designed and nothing has
 *      ever shown it at full size. It is the beat that turns a loading screen into a delivery.
 *
 * ── ⛔ REVISED 2026-08-12, ON *"למה זה ניראה רע ומשעמם וכל כך חסר חיים?"* ────────────────────────
 * Three faults, and the middle one is the one that matters.
 *
 *   1. THE THIRD RULER WAS HER AGE, AND NOTHING ASKS FOR IT ANY MORE. It left the intake on
 *      2026-08-08 (`navigation.ts`) because no line in `src/engine` reads it. The ruler stayed. So
 *      movement one drew a labelled instrument counting **from zero to zero**, on the screen whose
 *      entire claim is that every figure on it is one she set herself. Two rulers now, both hers.
 *
 *   2. ⛔ MOVEMENT THREE THREW MOVEMENTS ONE AND TWO AWAY. It was `named ? <the name> : <the list>`,
 *      so the instant her week was complete the screen **replaced it with a single line**. The beat
 *      that is supposed to be the delivery was the one where the most disappeared — a crescendo
 *      composed as a collapse, which is exactly what "lifeless" describes. The name now lands ABOVE
 *      the finished list, on a rule, and the week it names stays on screen underneath it.
 *
 *   3. THE FIGURE SNAPPED WHILE THE BAR CRAWLED. `shown` was computed from the `fill` PROP — 0, then
 *      1 — while the track grew over 900ms off a reanimated value. So the number arrived correct in
 *      one frame beside a bar still travelling, which is precisely the *"animation pretending to be
 *      a measurement"* the comment below it warned against. One clock drives both now.
 *
 * ── ⚠️ IT NEVER DRAWS A LIFT THAT HAS NOT ARRIVED ───────────────────────────────────────────────
 * The muscles are real — they come from the catalogue, which the app knows without asking anyone —
 * and each one's rows stand as DASHES until the coach's answer lands. Then they fill fast and the
 * name follows. Inventing plausible-looking lifts to animate over would be the app performing work
 * it had not done, on the one screen whose entire job is showing her what it did.
 *
 * ⚠️ AND IT MUST NOT DRAG AFTER THE PLAN LANDS (his own instruction). The fill is 90 ms a row once
 * the answer is in hand, whatever is left; nothing waits for an animation that has stopped being
 * about anything.
 *
 * Pure — every phase is reachable from props, which is the only way anyone sees the middle two.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Arrive, Legend, Stage } from '@/components/ds';
import { BodyMapFigure, viewOf } from '@/components/BodyMapFigure';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, space, stage } from '@/design/tokens';

/** One lift, as the simulation prints it — the three numbers a prescription needs. */
export interface BuildLift {
  name: string;
  /** Already written ("100 kg"), or absent while this row is still a dash. */
  load?: string | null;
  /** "4 × 8–10", or absent. */
  scheme?: string | null;
}

/** One muscle and the lifts chosen for it. */
export interface BuildMuscle {
  muscle: string;
  lifts: BuildLift[];
}

export interface BuildingProgrammeViewProps {
  /*
   * ⛔ THE RULERS' PROPS ARE GONE — `days`, `weight`, `unit`, `fill`, and the `Ruler` that read
   * them. Movement one became the DARK BODY when the founder replaced this beat with his own
   * design, and the instrument was left standing in the file: a component nothing rendered, a
   * `useTravel` clock nothing started, and four props the container was still computing and
   * passing every time. Under `@ts-nocheck` nothing says a word about that.
   */
  /** The muscles considered, in order. Drawn as they arrive. */
  muscles: BuildMuscle[];
  /**
   * ⛔ WHOSE BODY IS BEING BUILT (founder, device QA 2026-08-23: *"אם אני בוחר את הגוף הגברי,
   * באנימציה זה מציג את הגוף הנשי"*). `BodyMapFigure` defaults an ABSENT sex to the female figure —
   * the right default for the app at large — and this screen never passed one, so a man watched his
   * programme being assembled onto a woman's body, one step after telling the app he is a man. The
   * intake carries the answer (`inputs.sex`); it just never arrived here.
   */
  sex?: 'female' | 'male';
  /** The programme's name, when the coach has given one — movement three. */
  programmeName?: string | null;
  /** "7 muscles · 22 lifts", under the name. */
  summary?: string | null;
  /**
   * ⛔ SOMETHING SHE HAS TO BE TOLD, ABOVE THE WEEK BEING BUILT.
   *
   * The one caller is a failed import. Her sheet could not be read, she is being given a generated
   * week instead, and until now the screen said nothing at all about it — the container's own
   * comment claimed *"the import screen told her why"*, and that screen had been dismissed the
   * instant the read started. She finished the intake believing she was on her coach's programme.
   */
  note?: string | null;
  /**
   * ⛔ HER OWN SENTENCE, QUOTED BACK WHILE THE MODEL WRITES (founder 2026-08-29: *"להמחיש את זה
   * שזה עם AI"*).
   *
   * This is the AI signature, and it is the only honest one available. A badge saying "AI", a
   * sparkle, a row of typing dots — each is a CLAIM about what is happening, and this product does
   * not decorate claims (the founder's own rulings: *"תוריד את המשבצות האלה"*, *"a texture must
   * never imitate an absence"*). Her words on the screen are not a claim; they are evidence. She
   * wrote *"דגש על ישבן, בלי מוט ישר"*, and the only thing that could put that sentence above a
   * body filling with glute work is something that read it.
   *
   * ⚠️ IT LEAVES WHEN THE NAME ARRIVES. Movement three is the delivery, and the brief it was built
   * from is *"a crescendo composed as a collapse"* — what the name must not do is share the top of
   * the screen with the question it answered.
   *
   * ⚠️ ABSENT ON THE LOCAL PATH, and that is the point: the engine did not read a sentence, so
   * quoting one would be the app taking credit for a conversation it never had.
   */
  askedFor?: string | null;
}

const NOOP = () => {};

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ONE LIFT'S JOURNEY — and the container's beat is derived FROM these, never guessed alongside.
 *
 * FOUNDER, 2026-08-13: *"ראיתי את האנימציה של הגוף היא טובה, פשוט זה טס במהירות האור ולא נותן לכל
 * שריר את הרגע שלו. זה צריך ממש להיות אנימציה ארוכה ואיטית."*
 *
 * He was right and the numbers say why: the muscle changed every **90 ms**, while one lift needs
 * rise + hold + travel to get into the body. Every row was replaced before it had finished rising —
 * the journey this beat is built on was never once completed on screen.
 *
 * ⚠️ SO THE TIMINGS LIVE HERE AND `beatFor` IS THE ONLY THING THE CLOCK ASKS. A screen whose
 * animation and whose clock hold two separate opinions about how long a thing takes is exactly how
 * the 90 ms survived: both were "correct" on their own.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** Between one lift starting and the next — they overlap, so the feed breathes rather than ticks. */
export const LIFT_STEP_MS = 220;
export const LIFT_RISE_MS = 420;
/** The row simply SITS there. This is the part that makes it readable rather than a flicker. */
export const LIFT_HOLD_MS = 460;
/** Up into the figure. */
export const LIFT_TRAVEL_MS = 520;
/** A breath on the lit muscle after the last row has gone in, before the next muscle takes over. */
export const MUSCLE_BREATH_MS = 300;

/**
 * How long one muscle owns the screen: exactly as long as its own lifts need, plus a breath.
 * A muscle with four lifts genuinely has more to show than one with two, and gets it.
 */
export function beatFor(lifts: number): number {
  const rows = Math.max(1, lifts);
  return (rows - 1) * LIFT_STEP_MS + LIFT_RISE_MS + LIFT_HOLD_MS + LIFT_TRAVEL_MS + MUSCLE_BREATH_MS;
}

export function BuildingProgrammeView(props: BuildingProgrammeViewProps) {
  const { t } = useCopy();
  const named = !!props.programmeName;
  /*
   * The muscle being filled right now, and every muscle already in the body. `lit` is a body map in
   * the figure's own vocabulary — `emphasis` is its moss — so the instrument she drew her map on is
   * the instrument that reports the result, with no second drawing to keep in step.
   */
  const current = props.muscles.length ? props.muscles[props.muscles.length - 1] : null;
  const filling = named ? null : current?.muscle ?? null;
  const lit = React.useMemo(() => {
    /*
     * ⛔ THE UNALLOCATED MUSCLES ARE `off`, NOT ABSENT — and absent is what they were for an hour.
     *
     * A muscle missing from a body map is `normal`, which the figure draws in CREAM. So the beat
     * opened on a fully cream body and "filling" it meant nudging each muscle from cream to moss:
     * two light tones a metre apart. **The founder's design is a body that starts dark and lights
     * up**, and the only way to say that in this component's vocabulary is to state the darkness
     * rather than leave it to a default.
     */
    const out: Record<string, 'emphasis' | 'off'> = {};
    for (const m of CANONICAL_MUSCLE_ORDER) out[m] = 'off';
    for (const m of props.muscles) out[m.muscle] = 'emphasis';
    return out;
  }, [props.muscles]);
  /* The figure turns to whichever face carries the muscle being filled — she never has to guess
     where the light went. It holds the last face once the programme is named. */
  const face = filling ? viewOf(filling) : 'front';

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Legend size={17} track={0.2}>
            {named ? t('ob.buildYourProgramme') : props.muscles.length ? t('ob.buildChoosing') : t('ob.buildReading')}
          </Legend>
        </View>

        {/*
          ── MOVEMENT THREE — it has a name, so it is a thing she was given. ──

          ⛔ ABOVE the week, not instead of it. See the header note: this used to be the branch that
          replaced the list, and the delivery beat was the one where the screen emptied.
        */}
        {props.note ? (
          <Arrive order={0} style={styles.noteRow}>
            <Text style={styles.noteText}>{props.note}</Text>
          </Arrive>
        ) : null}

        {/* See `askedFor`. Quoted, because a quotation is the one punctuation that says "these are
            not our words" without a line of prose explaining it. */}
        {!named && props.askedFor ? (
          <Arrive order={0} style={styles.askedRow}>
            <Legend size={17} track={0.14} style={styles.askedLegend}>{t('ob.buildingAround')}</Legend>
            <Text style={styles.askedText} numberOfLines={3}>{`“${bidi(props.askedFor)}”`}</Text>
          </Arrive>
        ) : null}

        {named ? (
          <Arrive order={0} style={styles.namedHead}>
            <View style={styles.namedRule} />
            <Text style={styles.programmeName} numberOfLines={3}>{bidi(props.programmeName!)}</Text>
            {props.summary ? <Text style={styles.summary}>{props.summary}</Text> : null}
          </Arrive>
        ) : null}

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE PROGRAMME IS BUILT ON HER OWN BODY (founder, 2026-08-12)

            *"למה לא לעשות אנימציה יפה עם מפת הגוף שלנו — שבוחרת שריר ומציגה את התרגילים שלו ואז
            זורקת אותם לתוך השריר הזה, וכך עוברת שריר אחר שריר, ולבסוף כל מפת הגוף הופכת לירוקה?"*

          What stood here was two filling bars and then a scrolling list of names — a screen that
          FILLED TIME rather than saying anything. His design says the thing that is actually
          happening: the assembler takes a muscle, chooses lifts for it, allocates its volume, and
          moves on. **The body map is not decoration over the computation; it is the computation's
          own shape.**

          ⚠️ AND THE MAP IS THE ONE SHE JUST DREW, which is what makes it hers rather than a
          diagram. Every muscle starts dark; each one the engine allocates turns moss and stays
          moss; the figure turns to whichever face carries the muscle being filled. At the end her
          whole programme is lit at once — the first time she sees what she is about to train.

          ⚠️ IT ALSO BUYS THE TIME THE IMPORT PATH NEEDS. A photographed programme is a real model
          call, and this is the screen that holds it; a beat worth watching is the only honest way
          to spend a wait.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        <View style={styles.body}>
          <View style={styles.figureStage}>
            <BodyMapFigure face={face} map={lit} selected={filling} onSelect={NOOP} sex={props.sex} />
          </View>

          {/*
            The muscle being filled, and the lifts going into it. Only the CURRENT muscle's lifts
            are on screen: the ones before it are already in the body, which is what the moss says.
          */}
          <View style={styles.feed}>
            {/*
              ⚠️ AND THE FEED CLEARS WHEN THE PROGRAMME IS NAMED. `current` is still the last muscle
              at that moment, so the closing beat was the whole body lit — the thing she came for —
              with one muscle's lift list still sitting under it, as though the build had stopped
              mid-calf. The final frame is the body and its name, and nothing else.
            */}
            {current && !named ? (
              <>
                <Legend size={19} track={0.22} align="center" tone="accent">
                  {t(`muscle.${current.muscle}`).toUpperCase()}
                </Legend>
                {current.lifts.map((l, i) => (
                  <LiftIn key={`${current.muscle}_${i}`} name={l.name} order={i} />
                ))}
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * ⛔ ONE LIFT, GOING IN — the founder's *"זורקת אותם לתוך השריר"* (2026-08-12).
 *
 * It rises into place and then travels UP toward the figure as it fades: the row does not vanish,
 * it goes somewhere, and the place it goes is the muscle that just turned moss.
 *
 * ⚠️ THE TRAVEL IS THE POINT AND THE FADE IS NOT ENOUGH ON ITS OWN. A row that merely dissolves
 * reads as the screen forgetting it; a row that moves toward the body reads as the body taking it.
 * The two together are what makes the map look like it is being FILLED rather than coloured in.
 */
function LiftIn({ name, order }: { name: string; order: number }) {
  const reduced = useReducedMotion();
  const life = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) {
      life.value = 1;
      return;
    }
    life.value = withDelay(
      order * LIFT_STEP_MS,
      withSequence(
        withTiming(1, { duration: LIFT_RISE_MS, easing: Easing.out(Easing.cubic) }),
        withDelay(LIFT_HOLD_MS, withTiming(2, { duration: LIFT_TRAVEL_MS, easing: Easing.in(Easing.cubic) })),
      ),
    );
  }, [life, order, reduced]);

  const style = useAnimatedStyle(() => {
    const rise = Math.min(1, life.value);
    const draw = Math.max(0, life.value - 1);
    return {
      opacity: rise * (1 - draw),
      transform: [{ translateY: (1 - rise) * 14 - draw * 76 }, { scale: 1 - draw * 0.14 }],
    };
  });

  return (
    <Animated.View style={style}>
      <Text style={styles.feedLift} numberOfLines={1}>{bidi(name)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  head: { paddingHorizontal: space.gutter, paddingTop: 22 },

  /*
   * ── THE BUILD, ON HER OWN BODY — see the note at the markup. ──
   *
   * ⛔ THE RULERS' STYLES WENT WITH THE RULERS, and so did the finished LIST's: `rulers`, `ruler`,
   * `figure`, `track`, `trackFill`, `list`, `group`, `muscle`, `liftRow`, `liftName`, `liftLoad`,
   * `liftScheme`, `waiting`, `listUnderName`. Fourteen definitions for two components this screen
   * stopped rendering on 2026-08-12 — dead weight that reads, to anyone opening this file, as a
   * description of what the screen does.
   */
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, gap: 18 },
  figureStage: { width: '100%', maxWidth: 260, alignSelf: 'center' },
  /* A fixed seat, so the figure does not shuffle up and down as lifts come and go. */
  feed: { height: 132, alignSelf: 'stretch', alignItems: 'center', gap: 6 },
  feedLift: { fontFamily: font.sansMedium, fontSize: 19, lineHeight: 25, color: stage.ink0, textAlign: 'center' },

  /* ── the name — a HEAD over the finished week, not a screen that replaces it ── */
  /* Quiet, above the week, and never in place of it — the same rule the name obeys. */
  /* Her sentence, above the body. `ink2` on the legend and `ink1` on the words: the quotation is
     the subject, the label over it is only saying whose it is. */
  askedRow: { paddingHorizontal: 4, paddingBottom: 16, gap: 6 },
  askedLegend: { color: stage.ink2 },
  askedText: { fontFamily: font.serif, fontSize: 22, lineHeight: 30, color: stage.ink0, textAlign: 'left' },
  noteRow: { paddingHorizontal: 4, paddingBottom: 14 },
  noteText: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: stage.ink1, textAlign: 'left' },
  namedHead: { paddingHorizontal: space.gutter, paddingTop: 14 },
  namedRule: { height: 1, backgroundColor: 'rgba(241,238,229,0.14)', marginBottom: 18 },
  // The largest type in onboarding. A playlist without a name is a list of songs.
  programmeName: { fontFamily: font.serif, fontSize: 34, lineHeight: 39, color: stage.ink0, textAlign: 'left' },
  summary: { marginTop: 12, fontFamily: font.mono, fontSize: 17, color: stage.ink2, textAlign: 'left' },
});
