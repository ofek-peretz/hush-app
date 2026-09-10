/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ITEM STAGE — the three shapes the app could not run, and the line it could not say.
 *
 * The stage has only ever known one kind of work: a weight for a number of reps. That is why "any
 * goal" was a claim rather than a fact — a footballer's session has sprints and jumps and carries,
 * a marathon plan has intervals and long runs, and none of them are reps at a load. `coachPlan`
 * can now WRITE all of it; this is where the athlete meets it.
 *
 *   `time`      — held or worked for a duration.   a 45 s plank, 20 minutes on the bike
 *   `distance`  — covered.                          a 40 m carry, a 30 m sprint, 5 km
 *   `open`      — no number worth stating.          mobility, skill work, a warm-up
 *
 * (`reps` keeps its own stage in `SessionFlow` — the lit load, the rep band, the plate maths. It is
 * the most-used screen in the product and it is already right; this file does not touch it.)
 *
 * ── THE INSTRUCTION IS NOT AN EXPLANATION ───────────────────────────────────────────────────────
 * Every shape carries `say`, and it is the genuinely new element. This app's standing law is that a
 * label explaining a control steals the control's job — *"stop explaining; delete, don't shorten."*
 * `say` is not that, and the difference is worth naming so nobody deletes it on sight:
 *
 *   · "Tap to log this set"                     — explains a control. Banned, correctly.
 *   · "Take this one to a rep short of failure" — cannot be inferred from anything on screen.
 *   · "At a pace where you could hold a conversation."
 *
 * A prescription could always state how MUCH and never how. Two athletes handed "5 km" run two
 * different sessions depending on the sentence next to it, and the sentence is the coaching.
 *
 * ── ONE ACT, STILL ──────────────────────────────────────────────────────────────────────────────
 * Whatever the shape, the bottom of the stage holds exactly one control, because the hand reaching
 * for it may be under a bar or shaking after a sprint. A timed item has a second state (running),
 * never a second button.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Arrive, Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseById } from '@/data/exercises';
import { font, space, stage } from '@/design/tokens';
import { heroType } from '@/domain/loadPresentation';
import type { PlannedItem } from '@/domain/coachPlan';

/** mm:ss — the same reading the rest ring gives, so one clock format exists in the workout. */
export function clockOf(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A distance, in the unit the athlete would say out loud.
 *
 * Metres under a kilometre, kilometres above it — "5 km", not "5000 m", and "400 m", not "0.4 km".
 * The record stores metres always (one unit, no conversion drift); this is display only.
 */
/*
 * ⛔ THE UNITS WERE LATIN LITERALS, IN A HEBREW APP (2026-08-28).
 *
 * `'km'` and `'m'`, returned straight to the screen and never offered to i18next — so a 40 m carry
 * read `40 m` while the live run beside it says `מ׳`, the poster says `ק״מ` and the wheel's own
 * label says `ק"ג`. The keys have existed the whole time: `cardio.km` and `cardio.metresUnit`.
 *
 * ⚠️ AND IT SURVIVED BECAUSE NOBODY COULD SEE IT. `DistanceStage` is the only surface that draws
 * this, and its gallery entry was deleted on 2026-08-12 — so the screen was edited twice and
 * reviewed never. The entry is back (`2.2g`), and the first time it was opened this was the first
 * thing on it.
 *
 * The caller passes `t`, which is what every other unit in this file already does.
 */
export function distanceOf(metres: number, t: (k: string) => string): { figure: string; unit: string } {
  if (metres >= 1000) {
    const km = metres / 1000;
    return { figure: Number.isInteger(km) ? String(km) : km.toFixed(1), unit: t('cardio.km') };
  }
  return { figure: String(Math.round(metres)), unit: t('cardio.metresUnit') };
}

/**
 * The coach's instruction, under the figure it is about.
 *
 * In the serif, because this is Hush speaking rather than an instrument reporting — the same voice
 * split the rest of the app uses. Quiet, not a headline: the figure is what she acts on, this is
 * how. Absent when the coach said nothing, and an absent instruction leaves NO empty row.
 *
 * ════ ⛔ IT IS THE APP'S ONLY MOUTH FOR AN ITEM'S `say` (2026-08-26 audit) ════
 *
 * The coach writes one line per item — *"at a pace where you could hold a conversation"* — and the
 * prompt tells it where that line lands. On the day this was audited it landed in exactly ONE of
 * the three places an item can be executed:
 *
 *   a HOLD / a DISTANCE inside a session   drawn here                        ✔
 *   a prescribed RUN, on the live GPS stage  `say` in the props, rendered by nothing   ✘
 *   an ordinary LIFT, on the set stage       no surface at all                          ✘
 *
 * Both failures are the same event: the sentence used to sit behind a KEY POINTS control on those
 * two screens, the control was deleted on 2026-08-12, and **nothing replaced it** — so the one
 * thing that turns "5 km" into a prescription was handed to the screen and dropped. This component
 * is now mounted by all three, so there is one voice and one style, and `everyThingTheCoachSaysHasAMouth`
 * holds the three call sites together.
 *
 * `lines` caps the sentence where the screen cannot afford to grow (the set stage carries two
 * 164-point dials under it). The prompt's own bound is *"one line"*, so two is generous rather
 * than lossy — and a screen with no cap passes nothing and stays unbounded, as the item stages do.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A CAP CUTS AT A GLYPH; IT SHOULD CUT AT A THOUGHT (2026-08-27).
 *
 * Measured on `3.4`, the live run: the coach's sentence laid out to a `scrollHeight` of 116 in a
 * 58-point box — **four lines clamped to two** — so the screen showed
 *
 *     "בקצב שאפשר לדבר בו — זה היום הקל של השבו…"
 *
 * and the rest was unreachable, on a screen she looks at for twenty-six minutes. The cap itself is
 * right and stays: uncapped, the same sentence pushed the kilometre rows and the heart rate off the
 * bottom of a running screen. What was wrong is that it truncated MID-WORD, and a sentence cut
 * mid-word reads as a broken screen no matter how good the reason for the cap.
 *
 * ⚠️ THE ANSWER WAS ALREADY IN THE CARDIO CALL SITE'S OWN NOTE: *"the half that matters mid-run is
 * the instruction; the rest is the reason for it, and the reason has a screen of its own before she
 * starts."* If only the instruction is wanted, then take the INSTRUCTION — the opening sentence —
 * rather than however much of the paragraph happens to fit in two lines. She reads a complete
 * thought, there is no ellipsis, and nothing looks cut.
 *
 * ⚠️ THE CAP REMAINS AS THE BACKSTOP. A coach who writes one very long opening sentence still gets
 * clamped, because the layout argument does not depend on the punctuation cooperating.
 */
/**
 * The first complete sentence. A terminator only ends a sentence when whitespace or the string's
 * end follows it — otherwise `5.2 km` and `06:30.4` would be cut in half by their own decimal.
 */
export function openingSentence(say: string): string {
  const m = /[.!?](?=\s|$)/.exec(say);
  return m ? say.slice(0, m.index + 1) : say;
}

export function SayLine({ say, lines }: { say?: string; lines?: number }) {
  if (!say) return null;
  /* Capped screens get the opening thought; uncapped ones get the whole sentence. See above. */
  const text = lines ? openingSentence(say) : say;
  return (
    <Text style={styles.say} {...(lines ? { numberOfLines: lines } : {})}>
      {text}
    </Text>
  );
}

/** The name of the thing, above the figure. Chrome everywhere else; here it names the subject. */
/**
 * ════ THE SAME HEADER THE SET STAGE WEARS ════
 *
 * ⛔ FOUNDER, 2026-08-02: *"design them like the workout screens — the cardio ones if it is
 * aerobic, the strength ones if it is strength."*
 *
 * ⚠️ MEASURED IN THE RUNNING HARNESS rather than guessed, which is the only reason this is a fix
 * and not another opinion. The two stages side by side, as the browser actually computed them:
 *
 *                      2.2 · the set              2.2f · a held duration
 *     muscle           12px Assistant-Medium      —
 *     the lift         29px Assistant-SemiBold    13px MONO, muted
 *     the hero        118px mono                 118px mono          ✓ already agreed
 *     the unit         26px mono, muted           —
 *     where she is     15px "set 2 of 4"          —
 *
 * A plank was announcing itself in the chrome's voice — a 13pt mono legend, the type this app uses
 * for labels — while the lift beside it in the same session got the subject's 29pt. Same session,
 * same athlete, two different products.
 *
 * The muscle line above it is absent for a MOVEMENT (a run has no muscle) and present for a lift,
 * which is the honest difference rather than a missing feature.
 */
/**
 * The muscle line, for a LIFT only.
 *
 * A movement — a run, a carry, a mobility drill — has no single muscle, and inventing one to fill
 * the slot would be the app stating something it does not know.
 */
function muscleFor(ex: string, t: (k: string) => string): string | null {
  const m = exerciseById(ex)?.muscle;
  return m ? t(`muscle.${m}`) : null;
}

function ItemName({ name, muscle }: { name: string; muscle?: string | null }) {
  return (
    <>
      {muscle ? (
        <Legend size={17} track={0.22} align="center" style={styles.itemMuscle}>
          {muscle}
        </Legend>
      ) : null}
      <Text style={styles.itemName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
        {name}
      </Text>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────────────────── time */

/**
 * A held or worked duration.
 *
 * It counts DOWN, and it starts on her tap rather than on arrival: a plank timer that begins while
 * she is still walking to the mat has measured the walk. When it reaches zero the stage says so and
 * hands over — there is nothing to decide at the end of a plank, and a button asking her to confirm
 * she finished would only ask her to agree with the clock.
 */
export function TimeStage({
  item,
  name,
  onDone,
}: {
  item: Extract<PlannedItem, { kind: 'time' }>;
  name: string;
  onDone: (actualSeconds: number) => void;
}) {
  const { t } = useCopy();
  const [remaining, setRemaining] = useState(item.seconds);
  const [running, setRunning] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone(item.seconds);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, item.seconds, onDone]);

  // Stopping early is a real answer, not a failure: she held it for as long as she held it, and
  // that number is the measurement. It ends the item with what actually happened.
  const stop = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(item.seconds - remaining);
  }, [item.seconds, remaining, onDone]);

  const figure = clockOf(remaining);
  return (
    <>
      {/*
        ════════════════════════════════════════════════════════════════════════════════════════
        ⛔ BUILT IN THE SET STAGE'S LANGUAGE (founder, 2026-08-12)

          *"מה שאני כן רוצה מהPLANK שתעצב אותו כמו מסכים THE SET 2.2 כי זה תרגיל לכל דבר."*

        He is right that it is a lift like any other, and the three things that made it read as a
        different app were all things `2.2` had already fixed and this screen had not:

          THE IDENTITY sat in the middle of a centred stack. It goes to the top, where the set
            stage put it once there were 220 dead points above "CHEST".

          THE FIGURE had no heading. On `2.2` every figure is opened by a lit 22-point word —
            WEIGHT, REPS — and an unlabelled `0:45` is the same defect as an unlabelled band tick:
            the athlete is asked to infer what she is looking at.

          ⛔ AND "REP 2 OF 3" WAS PRINTED TWICE. The rail above this stage already draws it — the
            same `LiftRail`, fed the same `session.setLabel` — which is the merge he asked for on
            the set stage and got: *"אולי אפשר לעשות את זה יחד עם הקו שהחליף את ה-LIFT."* This
            screen kept the words as well, so the fact was on the screen in two languages at once.
            `RoundLine` is deleted.
        ════════════════════════════════════════════════════════════════════════════════════════
      */}
      <View style={styles.body}>
        <Arrive order={0} style={styles.identity}>
          <ItemName name={name} muscle={muscleFor(item.ex, t)} />
        </Arrive>
        <Arrive order={1} style={styles.band}>
          {/* ⛔ 22 → 26 (2026-08-27). The founder raised the set stage's band headings on 2026-08-26
              — *"הגדלת את הגודל של הסרגלים אבל את המלל מעליהם השארת קטן"* — and this stage
              kept 22. The note at the top of this file is about these two screens not reading as
              different apps; a heading tier is exactly that kind of difference. */}
          <Legend size={26} track={0.26} align="center" style={styles.bandLabel}>
            {t('workout.hold')}
          </Legend>
          <Text style={[styles.hero, heroType(figure)]} numberOfLines={1} accessibilityLabel={figure}>
            {figure}
          </Text>
        </Arrive>
        <Arrive order={2} style={styles.sayBlock}>
          <SayLine say={item.say} />
        </Arrive>
      </View>
      <View style={styles.footer}>
        <Button
          variant="onstage"
          size="stage"
          block
          label={running ? t('workout.itemStop') : t('workout.itemStart')}
          onPress={running ? stop : () => setRunning(true)}
        />
      </View>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────── distance */

/**
 * A distance to cover, off the phone's own measurement.
 *
 * For a 40 m carry or a 30 m sprint there is nothing to track — she does it and says so. A GPS
 * movement (a run, a ride) is a different screen entirely and does not come here: it has a live
 * map, a pace and splits, and the phone knows when the distance is done without being told.
 */
export function DistanceStage({
  item,
  name,
  onDone,
  measured = false,
}: {
  item: Extract<PlannedItem, { kind: 'distance' }>;
  name: string;
  onDone: () => void;
  /**
   * The phone is going to MEASURE this one — a GPS movement, so the act starts the run rather than
   * confirming it (founder, 2026-08-02: *"why does she need a Done button? The GPS can tell us she
   * finished"*). The body is identical: she is looking at the same distance either way, and the
   * only thing that differs is who says it is over.
   */
  measured?: boolean;
}) {
  const { t } = useCopy();
  const { figure, unit } = distanceOf(item.metres, t);
  return (
    <>
      <View style={styles.body}>
        {/* The three stages compose on arrival, exactly as the SET stage does — a plank and a
            400 m repeat are steps of the same workout and must not feel like a different app.
            See `SessionFlow`'s `beat` for the argument and the caveat. */}
        {/*
          ⛔ AND THE RULING WAS ONLY EVER APPLIED TO THE TIME STAGE. The note above `TimeStage`
          says `RoundLine` is deleted, because the rail already draws her position from the same
          `session.setLabel` — and it was left standing here, so a 6 × 400 m interval told her where
          she was twice, in two different languages, on one screen. The law test that pins it
          (`aRepeatedItemSaysWhereSheIsInIt`) only ever asked the time stage.
        */}
        <Arrive order={0} style={styles.identity}>
          <ItemName name={name} muscle={muscleFor(item.ex, t)} />
        </Arrive>
        {/*
          ⛔ AND THE OTHER HALF OF THAT RULING WAS NEVER APPLIED EITHER (2026-08-27).

          The note over `TimeStage` says it plainly: *"THE FIGURE had no heading. On `2.2` every
          figure is opened by a lit word — WEIGHT, REPS — and an unlabelled `0:45` is the same
          defect as an unlabelled band tick: the athlete is asked to infer what she is looking at."*
          The hold was fixed. **A bare `400 m` was left standing one function below it**, on the same
          stage, in the same file, under a comment claiming the three blocks compose like the set
          stage's — which they did not: only the name had an `Arrive`, so the figure and the coach's
          line appeared with no entrance while the name rose.

          It is a band now, like the hold's and like the load's: a lit word, then the figure. The
          carry note stays inside it, because "carrying 20 kg" is a fact ABOUT this distance.
        */}
        <Arrive order={1} style={styles.band}>
          <Legend size={26} track={0.26} align="center" style={styles.bandLabel}>
            {t('workout.distance')}
          </Legend>
          {/* One measurement, one announcement — VoiceOver stopped on "400", moved, then stopped on
              "m". The same shape `WellDone`'s facts were fixed into. */}
          <View style={styles.figureRow} accessible accessibilityLabel={`${figure} ${unit}`}>
            <Text style={[styles.hero, heroType(figure)]} numberOfLines={1}>
              {figure}
            </Text>
            <Text style={styles.unit}>{unit}</Text>
          </View>
          {item.load != null ? (
            <Legend size={17} track={0.14} align="center" tone="onStage">
              {t('workout.itemCarrying', { load: item.load })}
            </Legend>
          ) : null}
        </Arrive>
        <Arrive order={2} style={styles.sayBlock}>
          <SayLine say={item.say} />
        </Arrive>
      </View>
      <View style={styles.footer}>
        <Button
          variant="onstage"
          size="stage"
          block
          label={t(measured ? 'workout.itemStart' : 'workout.itemDone')}
          onPress={onDone}
        />
      </View>
    </>
  );
}


const styles = StyleSheet.create({
  /*
   * ⛔ THE SAME 'center' CLUMP THE SET STAGE HAD (founder 2026-08-12) — measured at 187 points of
   * nothing above the content and 208 below it, on a screen holding four short lines.
   *
   * ⚠️ `gap` GOES WITH IT. A fixed 18-point gap plus even distribution is two spacing systems
   * arguing; the gap wins between siblings and the distribution only pads the ends, which is how a
   * "centred" layout ends up with all its air at the edges in the first place.
   */
  /* ⛔ CENTRED, WITH THE AIR OUTSIDE — the same correction as the set stage, and for the same reason:
     a movement, its round and its instruction are one object, and spacing them evenly down the
     screen made them three. See `SessionFlow.stageBody` for the argument. The `gap` is back and is
     what holds the cluster together now. */
  /* ⛔ `space-between` AND THE SET STAGE'S OWN PADDING (2026-08-12). It was `center` with a 22-point
     gap, so the whole item floated as one block in the middle with dead space above and below —
     the exact shape `2.2` was rebuilt out of. Each part owns its space now. */
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 6, paddingBottom: 58 },
  identity: { alignItems: 'center', alignSelf: 'stretch' },
  /* The figure and the word that names it — the set stage's `band`, to the point. */
  band: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  bandLabel: { color: stage.ink0 },
  sayBlock: { alignSelf: 'stretch', alignItems: 'center' },
  // The same lit figure as the load hero — one thing on the stage stands in the light, whatever it
  // is measuring. `heroType` carries the size, leading and tracking together (`noGlyphIsClipped`).
  hero: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    color: '#f6f3ea',
    includeFontPadding: false,
    textAlign: 'center',
    /* ⛔ THE 50-POINT BLOOM IS GONE. It was meant to read as lit; over a tabular figure it paints
       the whole line box, so `0:45` and `40 m` sat inside a visible grey RECTANGLE in the founder's
       screenshots. `2.2`'s own hero has never had one — the size is what makes it the subject. */
  },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  unit: { fontFamily: font.monoMedium, fontSize: 22, color: stage.ink2, textAlign: 'left' },
  // Matched to the set stage, measured: 12 / 29, the muscle in the label tone and the lift in cream.
  itemMuscle: { marginBottom: 4 },
  /* 29 → 36, with the set stage: the movement is the subject of its screen, and it was set smaller
     than the instruction beneath it. `adjustsFontSizeToFit` at the call site protects long names. */
  itemName: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 42, color: stage.ink0, textAlign: 'center', maxWidth: 330 },
  // The instruction: the coach's serif, resting in shadow beneath the fact she acts on.
  /* 17 → 20. The same ruling as the set stage's headings: this is read standing up, at arm's
     length, under a bar — and it is the only sentence on the screen. */
  say: {
    fontFamily: font.serif,
    fontSize: 20,
    lineHeight: 29,
    color: stage.ink1,
    textAlign: 'center',
    maxWidth: 320,
  },
  // With no figure to sit under, the instruction takes the stage.
  openHero: {
    fontFamily: font.serif,
    fontSize: 26,
    lineHeight: 35,
    color: stage.ink0,
    textAlign: 'center',
    maxWidth: 330,
  },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 20 }, // with `stageFooter` on 2.2
});
