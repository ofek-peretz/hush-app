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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Arrive, Legend, Stage } from '@/components/ds';
import { paragraphMark } from '@/i18n/bidi';
export { paragraphMark } from '@/i18n/bidi';
import { DayInMotion } from '@/components/DayInMotion';
import { useCopy } from '@/i18n/useCopy';
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
  /*
   * ════ THE WAIT IS THE COACH AT WORK, SHOWN TRUE (founder, build 75, 2026-10-01) ════
   *
   *   > *"בזמן הטעינה של יצירת התוכנית זה פשוט מראה את המסך בתמונה של הגוף ואין חוויה של יצירת
   *   > תוכנית ומשהו שימשוך אותך להמתין ולחכות בציפייה."*
   *
   * The 2026-09-14 ruling made the wait honest by making it EMPTY: a dark body breathing for the
   * whole call. That was written against a 6–9 s call. The week is written by GPT-6 Sol at high
   * effort now, and measured live today a build takes 18–30 s — half a minute of a body doing
   * nothing, on the screen whose job is to make her want what is coming.
   *
   * What fills it now is still only what is TRUE while the model writes, in the order it happens:
   *   1. `brief` — the facts the coach was actually handed (her days, her bodyweight, how long she
   *      has trained), arriving one by one under her own sentence. Not a summary of her week: the
   *      request, read back.
   *   2. `library` — the catalogue the coach is choosing FROM, in motion, under a legend that says
   *      so ("choosing from N exercises", N being the very list the prompt carries). It never says
   *      a lift was chosen; the muscles still light only when the answer is in hand, and nothing on
   *      this beat names a muscle — the 2026-09-14 law stands.
   *   3. `waitHint` — how long this usually takes. A wait with a stated length is a shorter wait.
   *
   * All three are optional and the container passes them only when the model is being asked: her
   * own sealed week and the local assembler fill in under a second and keep the dark body.
   */
  brief?: readonly string[];
  library?: readonly { id: string; name: string }[];
  /** How many lifts the coach is choosing from — the length of the catalogue it was sent. */
  libraryCount?: number;
  waitHint?: string | null;
  /**
   * HER week's lifts, in the order she will meet them — what the figure performs once the answer
   * has landed (2026-10-11; see the note on the stage). Each carries the weight and the sets the
   * week gives it. Empty until then.
   */
  week?: readonly BuildWeekLift[];
}

/** One lift of her week on the stage: the film's id, and the prescription under it. */
export interface BuildWeekLift extends BuildLift {
  id: string;
}

/** Her sentence and her facts land first; the library takes the stage after this long. */
export const READ_MS = 3200;
/** One lift of the library on the stage — a little over a rep, so it reads as browsing, not a lesson. */
export const LIBRARY_HOLD_MS = 2800;
/** How long one of HER lifts holds the stage once the week has landed — long enough to read a name
 *  and its three figures, short enough that two of them pass before the week is named. */
export const WEEK_HOLD_MS = 1300;

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
/** How many of her lifts pass on the stage before the week is named. */
export const WEEK_LIFTS_BEFORE_NAME = 2;

/**
 * How long her week owns the stage before its name lands: exactly as long as what is DRAWN needs —
 * two of her lifts, each held long enough to be read. The container's clock asks this and holds
 * no second opinion (`BuildingProgramme.fillHold`); a week of a single lift waits for one.
 */
export function beatFor(lifts: number): number {
  return Math.max(1, Math.min(lifts, WEEK_LIFTS_BEFORE_NAME)) * WEEK_HOLD_MS;
}

export function BuildingProgrammeView(props: BuildingProgrammeViewProps) {
  const { t } = useCopy();
  const named = !!props.programmeName;
  /* The call is out and nothing of her week exists yet — the stage shows the catalogue, never a claim. */
  const waiting = !named && props.muscles.length === 0;

  /*
   * The wait's two beats (see `library`): her words and her facts first, then the catalogue. The
   * switch is a clock, not a claim — it moves the legend from "reading" to "choosing from N", which
   * is what the call is doing for the whole of its length after the first instant.
   */
  const library = props.library ?? [];
  const browsing = waiting && library.length > 0;
  const [choosing, setChoosing] = React.useState(false);
  React.useEffect(() => {
    if (!browsing) return;
    const tm = setTimeout(() => setChoosing(true), READ_MS);
    return () => clearTimeout(tm);
  }, [browsing]);
  const [shownId, setShownId] = React.useState<string | null>(null);
  const shownName = library.find((l) => l.id === shownId)?.name ?? null;
  const libraryIds = React.useMemo(() => library.map((l) => l.id), [library]);
  const onShow = React.useCallback((id: string) => setShownId(id), []);
  /* Her week on the stage, from the moment it lands — see the note there. */
  const week = props.muscles.length ? props.week ?? [] : [];
  const weekIds = React.useMemo(() => week.map((l) => l.id), [week]);
  const [hersId, setHersId] = React.useState<string | null>(null);
  const hers = week.find((l) => l.id === hersId) ?? week[0] ?? null;
  const onShowHers = React.useCallback((id: string) => setHersId(id), []);

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Legend size={17} track={0.2}>
            {named
              ? t('ob.buildYourProgramme')
              : props.muscles.length
                ? t('ob.buildYours')
                : browsing && choosing
                  ? t('ob.buildChoosingFrom', { n: props.libraryCount ?? library.length })
                  : t('ob.buildReading')}
          </Legend>
          {waiting && props.waitHint ? <Text style={styles.waitHint}>{props.waitHint}</Text> : null}
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
        {/*
          ⛔ HER SENTENCE IS NOT ISOLATED (founder's build-75 screenshot, 2026-10-01). It was wrapped
          in `bidi()` — a First-Strong ISOLATE — inside the quotation marks, and an isolate is skipped
          when the paragraph's direction is found: nothing strong was left outside it, so the whole
          paragraph fell to LTR and the closing mark and her full stop landed on the wrong ends of the
          last line. `bidi` is for an English run inside a Hebrew sentence; a whole paragraph of her
          own words is a paragraph, and its first letter is what should set its direction.
        */}
        {!named && props.askedFor ? (
          <Arrive order={0} style={styles.askedRow}>
            <Legend size={17} track={0.14} style={styles.askedLegend}>{t('ob.buildingAround')}</Legend>
            {/* Five lines, not three: the founder's own sentence was cut at "ובעל מראה" — the half that said
                what he wanted. The words are the evidence; a truncated quote is a misquote. */}
            {/* ⛔ …AND A HEBREW SENTENCE THAT OPENS ON A LATIN WORD IS STILL HEBREW (walked 2026-10-11:
                "PPL, דגש על גב וכתפיים." drew its full stop in the middle of the line — the first
                STRONG letter was the P, so the paragraph fell to left-to-right). A right-to-left
                mark ahead of the quote makes the paragraph hers whenever she wrote any Hebrew at
                all; a sentence with none is left to its own first letter, as before. */}
            <Text style={styles.askedText} numberOfLines={5}>{`${paragraphMark(props.askedFor)}“${props.askedFor.trim()}”`}</Text>
          </Arrive>
        ) : null}

        {/* The facts the coach was handed, one by one — the request read back, never the answer. */}
        {waiting && props.brief?.length ? (
          <View style={styles.briefRow}>
            {props.brief.map((fact, i) => (
              <Arrive key={fact} order={1 + i} style={styles.briefChip}>
                <Text style={styles.briefText}>{fact}</Text>
              </Arrive>
            ))}
          </View>
        ) : null}

        {named ? (
          <Arrive order={0} style={styles.namedHead}>
            <View style={styles.namedRule} />
            {/* The coach's title is a whole paragraph too — same reason as her sentence above. */}
            <Text style={styles.programmeName} numberOfLines={3}>{`${paragraphMark(props.programmeName!)}${props.programmeName!.trim()}`}</Text>
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
          {/*
            ════ ⛔ THE FIGURE NEVER LEAVES THE STAGE (founder, 2026-10-11) ════

            *"זה מציג יפה באנימציה את התרגילים שהבינה נותנת אבל לבסוף הגוף עם השרירים חוזר ומופיע
            וזה לא יפה. אני מציע במקום זה לעשות משהו אחר כך שיהיה מעבר חלק יותר."*

            The wait was an athlete performing lifts; the instant the answer landed the screen CUT to
            an anatomical map — a different drawing, in a different language, holding the one beat
            that is supposed to be the delivery. The map was right on 2026-08-12, when the intake
            had a body-map step and this screen filled in "the map she just drew". That step left
            the intake; the map stayed, as the ending of a screen that no longer leads up to it.

            So the same athlete, on the same stage, simply goes on — and what she performs now is
            HER week: each lift with its weight and its sets, which is what the catalogue's lifts
            never carried. The legend says the lifts are hers; the name then lands above a figure
            that is still moving, and the Ready screen that follows opens on that same week.
          */}
          {browsing ? (
            /*
              The catalogue, in motion — and LABELLED as the catalogue by the legend above it. The
              name under the figure is the lift on the stage, not a lift in her week.
            */
            choosing ? (
              <Arrive order={0} style={styles.libraryStage}>
                <DayInMotion
                  exerciseIds={libraryIds}
                  figure={props.sex}
                  holdMs={LIBRARY_HOLD_MS}
                  onShow={onShow}
                  fit
                  style={styles.libraryFigure}
                />
                <Text style={styles.libraryName} numberOfLines={1}>{shownName ?? ''}</Text>
                {/* The catalogue's lifts carry no figures — the row is held open all the same, so
                    her week's lifts land on the line the figure is already standing over. */}
                <Text style={styles.weekFacts} numberOfLines={1}>{''}</Text>
              </Arrive>
            ) : (
              <View style={styles.libraryStage} />
            )
          ) : weekIds.length ? (
            <Arrive order={0} style={styles.libraryStage}>
              <DayInMotion
                exerciseIds={weekIds}
                figure={props.sex}
                holdMs={WEEK_HOLD_MS}
                onShow={onShowHers}
                fit
                style={styles.libraryFigure}
              />
              <Text style={styles.libraryName} numberOfLines={1}>{hers?.name ?? ''}</Text>
              {/* A name and a weight is a shopping list; with the sets it is a prescription. The row
                  keeps its height when a lift has no load (bodyweight), so nothing under it jumps. */}
              <Text style={styles.weekFacts} numberOfLines={1}>
                {[hers?.load, hers?.scheme].filter(Boolean).join('  ·  ')}
              </Text>
            </Arrive>
          ) : (
            <View style={styles.libraryStage} />
          )}
        </View>
      </SafeAreaView>
    </View>
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
  /* ⛔ THE STAGE STANDS ON THE FLOOR, NOT IN THE MIDDLE (walked 2026-10-11). Centred, it rode up by
     a hand's width the instant the week landed — the chips above it leave, and the middle of
     what is left is higher. The figure is the one thing that must NOT move at that moment, so it
     is seated from the bottom, where nothing changes. */
  body: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: space.gutter, paddingBottom: 96, gap: 18 },

  /* ── the name — a HEAD over the finished week, not a screen that replaces it ── */
  /* Quiet, above the week, and never in place of it — the same rule the name obeys. */
  /* Her sentence, above the body. `ink2` on the legend and `ink1` on the words: the quotation is
     the subject, the label over it is only saying whose it is. */
  /* ⛔ ON THE GUTTER, like the legend above it — at `4` her sentence ran to the glass edge (build 75). */
  askedRow: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 12, gap: 6 },
  waitHint: { marginTop: 6, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink2, textAlign: 'left' },
  /* Her facts as quiet chips — the request read back, set smaller than her own words above them. */
  briefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: space.gutter, paddingBottom: 6 },
  briefChip: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(241,238,229,0.16)', paddingHorizontal: 12, paddingVertical: 6 },
  briefText: { fontFamily: font.sansMedium, fontSize: 17, lineHeight: 22, color: stage.ink1, textAlign: 'left' },
  /* The library holds the body's seat. `fit` frames each lift to its own drawing (as Today's hero
     does) inside ONE fixed box, so the athlete fills the stage and the box never jumps between lifts. */
  libraryStage: { width: '100%', maxWidth: 360, alignSelf: 'center', alignItems: 'center', gap: 10 },
  libraryFigure: { width: '100%', height: 250 },
  libraryName: { fontFamily: font.sansMedium, fontSize: 19, lineHeight: 25, color: stage.ink0, textAlign: 'center' },
  // Her lift's weight and sets, under its name — figures, so the mono face; a fixed height so a
  // bodyweight lift (no load) does not pull the row away.
  weekFacts: { fontFamily: font.mono, fontSize: 17, lineHeight: 23, minHeight: 23, color: stage.ink1, textAlign: 'center' },
  askedLegend: { color: stage.ink2 },
  askedText: { fontFamily: font.serif, fontSize: 22, lineHeight: 30, color: stage.ink0, textAlign: 'left' },
  noteRow: { paddingHorizontal: 4, paddingBottom: 14 },
  noteText: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: stage.ink1, textAlign: 'left' },
  namedHead: { paddingHorizontal: space.gutter, paddingTop: 14 },
  namedRule: { height: 1, backgroundColor: 'rgba(241,238,229,0.14)', marginBottom: 18 },
  // The largest type in onboarding. A playlist without a name is a list of songs.
  programmeName: { fontFamily: font.serif, fontSize: 34, lineHeight: 39, color: stage.ink0, textAlign: 'left' },
  // Sans, not mono: "10 muscles · 25 lifts" is a SENTENCE with two figures in it, and Plex Mono has
  // no Hebrew — the words fell back to a system face mid-line (design audit 2026-09-29).
  summary: { marginTop: 12, fontFamily: font.sansMedium, fontSize: 17, color: stage.ink2, textAlign: 'left' },
});
