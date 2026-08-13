/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT DO I TRAIN? — the body map, and the only screen in onboarding that shapes the programme.
 *
 * ⛔ FOUNDER, 2026-08-08: *"פציעות כאבים ומה אסור יהיה בBODYMAP לכן לא צריך טקסט חופשי. כולל אילו
 * שרירים הוא הכי רוצה לפתח."* — and, on the figure: *"גוף אחד שלוחצים עליו."*
 *
 * One body, three answers per muscle: LEAD with it, leave it, or turn it OFF. That covers what used
 * to be two prose fields — the goal and the limits — and it covers them in a form the engine can
 * actually read. `assembleV5DayLists` takes this map and nothing else about her intent.
 *
 * ── WHY THIS SCREEN REPLACES `YourGoal` ─────────────────────────────────────────────────────────
 * `goalText` and `limitsText` were free prose, and measuring who READ them found exactly one
 * consumer: `coachFacts`, the AI's fact pack. Nothing in the engine has ever seen either. A question
 * whose answer changes no decision is a question that should not be asked, so the two paragraphs go
 * and the map takes their place in the chain: YourTraining → BodyMap → ConnectHealth.
 *
 * ── THE THREE THINGS THE OLD BUILD GOT WRONG, EACH NOW A TEST ───────────────────────────────────
 * `bodyMapScreen.test.tsx` was written against this screen before it was deleted, and it names them:
 *
 *   1. **An all-off map used to LEAVE.** `fixtureModel`'s safety net then rebuilt an all-normal map,
 *      so Hush handed her a full-body week after she had asked for none of it, silently. Continue is
 *      blocked here now, and says why (S-3).
 *   2. **A third emphasis mark hit `return` with a haptic tick** — the athlete tapped, nothing moved,
 *      nothing explained. F-4's budget of two is stated out loud, naming the two muscles holding it.
 *   3. **Turning a region off said nothing.** A whole region going dark is a consequence worth
 *      stating — once, calmly, and never as an argument with her choice.
 *
 * ⛔ NORMAL IS THE ABSENCE OF A DECISION, NOT ONE. The map that leaves carries only what she changed,
 * so `{}` is a complete answer and a mark taken back leaves no trace.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { BodyMapFigure, viewOf, type Face } from '@/components/BodyMapFigure';
import { color, font } from '@/design/tokens';
import { tg } from '@/i18n';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import { emphasisBudgetFor, emphasisRefusal, type MarkRefusal } from '@/engine/v5/bodyMap';
import { regionOf } from '@/engine/v5/assembler';
import type { MuscleStance } from '@/data/local/models';

const STANCES: { key: MuscleStance; word: string }[] = [
  { key: 'off', word: 'ob.stanceOff' },
  { key: 'normal', word: 'ob.stanceNormal' },
  { key: 'emphasis', word: 'ob.stanceEmphasis' },
];

export function BodyMap({ navigation, route }: { navigation: any; route: any }) {
  const [face, setFace] = useState<Face>('front');
  const [open, setOpen] = useState<string | null>(null);
  /** Only her decisions. A muscle absent is `normal` — see the header note. */
  const [map, setMap] = useState<Record<string, MuscleStance>>({});
  /** The refusal answers an ACT. It is cleared by the next one, so it never stands there scolding. */
  const [refused, setRefused] = useState<{ reason: MarkRefusal; marks: string[] } | null>(null);

  const marks = useMemo(() => Object.entries(map).filter(([, s]) => s === 'emphasis').map(([m]) => m), [map]);
  /*
   * Her frequency, relayed from the days step. It decides whether a SECOND mark can be honoured at
   * all (`emphasisRefusal`): below the split every session trains the whole body, so two marks
   * always compete. `undefined` when the relay has not carried it — the refusal then falls back to
   * the F-4 budget alone, which is the behaviour that shipped before this rule.
   */
  const days = route?.params?.daysPerWeek;
  const on = useMemo(() => CANONICAL_MUSCLE_ORDER.filter((m) => map[m] !== 'off'), [map]);
  const nothingOn = on.length === 0;

  /*
   * The consequence is a whole REGION going dark, not any single muscle. Narrating every toggle is
   * the nagging the brief bans, so this fires on the region and stays quiet on the muscle.
   */
  const consequence = useMemo(() => {
    if (nothingOn) return null;
    const structural = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');
    const liveUpper = structural.filter((m) => regionOf(m) === 'upper' && map[m] !== 'off');
    const liveLower = structural.filter((m) => regionOf(m) === 'lower' && map[m] !== 'off');
    if (liveLower.length === 0) return tg('ob.mapUpperOnly');
    if (liveUpper.length === 0) return tg('ob.mapLowerOnly');
    return null;
  }, [map, nothingOn]);

  const setStance = (muscle: string, stance: MuscleStance) => {
    setRefused(null); // every act answers the last one
    // F-4 — the budget is legible, not a hidden error. Refusing SILENTLY is the defect this replaces.
    /*
     * F-4 and the region rule are ONE question, asked of `emphasisRefusal` so this screen, the
     * profile editor and the engine can never disagree about which marks are honourable. Refusing
     * SILENTLY is the defect this replaces — every refusal says which mark holds the place and why.
     */
    if (stance === 'emphasis') {
      const why = emphasisRefusal(map, muscle, CANONICAL_MUSCLE_ORDER, days);
      if (why) {
        setRefused({ reason: why, marks });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
    }
    void Haptics.selectionAsync().catch(() => {});
    setMap((prev) => {
      const next = { ...prev };
      if (stance === 'normal') delete next[muscle]; // …and it leaves no trace
      else next[muscle] = stance;
      return next;
    });
  };

  /*
   * ⛔ THIS IS THE LAST STEP NOW (founder 2026-08-10), so it is where `OnboardingInputs` is
   * assembled — the one place that does, moved whole from `ConnectHealth` rather than split in two.
   *
   * The map is the only screen in the intake that shapes the week, which makes it the peak, and the
   * peak belongs next to the payoff. Health moved to second: a permission ask was a fine thing to
   * put in front of a conversation and a poor thing to put between her and her programme.
   *
   * ⚠️ THE RELAY IS FLAT, and this screen was written against a `{ inputs }` param no step in this
   * navigator has ever sent — her sex, weight and days died on the way in and the map on the way
   * out, silently, with `fixtureModel`'s safety net rebuilding an all-normal week.
   */
  /*
   * ⛔ THE RELAY, ASSEMBLED ONCE (2026-08-11). It used to live inside `build`, which was fine while
   * this step had one way out. It now has two — build me one, or read the one I brought — and both
   * carry the SAME answers forward. A second copy of this object is a second place for her weight to
   * go missing, which is the exact bug the note above records.
   */
  const relay = () => {
    const p = route?.params ?? {};
    return {
        // Hush is hypertrophy-first for everyone (register Part 9 §A) — the goal question is gone.
        goal: 'build_muscle',
        /*
         * ⛔ ZERO MEANS NOBODY HAS ASKED HER. This was a literal `4` once and it decided the
         * founder's week unasked — *"he decides by himself that he'll do 4 workouts for me."* The
         * fallback stays 0 so a missing answer reads as missing rather than as an answer.
         */
        daysPerWeek: p.daysPerWeek ?? 0,
        units: p.units ?? 'kg',
        healthConnected: p.healthConnected ?? false,
        sex: p.sex,
        ...(p.weightKg != null ? { weightKg: p.weightKg } : {}),
        /*
         * ⚠️ SPREAD ON PRESENCE, NOT ON SIZE. `{}` is a complete answer — she left every muscle
         * normal — and `completeOnboarding` reads the PRESENCE of this key to put her on the v5
         * engine. `Object.keys(map).length` is the tidy-up that would break it.
         */
      bodyMap: map,
    };
  };

  const build = () => {
    if (nothingOn) return; // S-3 — an unbuildable map never leaves this screen
    navigation.navigate('BuildingProgramme', { inputs: relay() });
  };



  const openStance: MuscleStance = open ? (map[open] ?? 'normal') : 'normal';

  /*
   * ⛔ THIS STEP HAD NO WAY BACK AND NO PLACE IN THE COUNT (fixed 2026-08-10).
   *
   * It was written before it was wired in, so it drew its own header: a title, a subtitle, and
   * nothing else. Every other step in the intake carries the scaffold's back arrow and its progress
   * bar, which means the athlete met a step 2 of 3 with no arrow — the one screen in onboarding she
   * could not leave except by finishing it, on the one screen that BLOCKS finishing until she has
   * left at least one muscle on. A dead end guarding a refusal.
   */
  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 3 }}
      title={tg('ob.mapTitle')}
      /* ⛔ The subtitle obeys the same budget as the guard — it read "pick up to two" on a week
         that can honour one, which is the promise that made his refusal look like a fault. */
      sub={emphasisBudgetFor(days) === 1 ? tg('ob.mapSubOne') : tg('ob.mapSub')}
      headGap={18}
      bodyTop={18}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            block
            label={tg('ob.daysBuild')}
            onPress={build}
            /* S-3 — an unbuildable map never leaves this screen, and the reason is said above. */
            disabled={nothingOn}
          />
{/*
            ⛔ THE DOOR MOVED TO `AboutYou` ON 2026-08-11, and the reason is worth keeping here.
            *
            * It was on this step because I reasoned that the import needs her sex, weight and days.
            * It does not — `runImport` never touches her profile; only the LOADS do, and those are
            * fitted at the end whatever the week is. Putting it last meant the slowest call in the
            * flow ran at the one moment she had nothing else to do.
            *
            * Started at the FIRST question it runs underneath this screen instead, and by the time
            * she reaches the build it is usually already done.
          */}
        </>
      }
    >
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['front', 'back'] as Face[]).map((f) => (
          <Pressable
            key={f}
            accessibilityRole="tab"
            accessibilityState={{ selected: face === f }}
            onPress={() => setFace(f)}
            style={[styles.tab, face === f && styles.tabOn]}
          >
            <Text style={[styles.tabText, face === f && styles.tabTextOn]}>
              {tg(f === 'front' ? 'ob.mapFront' : 'ob.mapBack')}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <BodyMapFigure
          face={face}
          map={map}
          selected={open}
          onSelect={(m) => {
            setRefused(null);
            setFace(viewOf(m)); // pressing a muscle always turns the body that shows it
            setOpen((cur) => (cur === m ? null : m));
          }}
        />

        {/*
          ⛔ THE SHEET WAS BELOW THE FOLD (founder, 2026-08-12)

            *"אין אפשרות ל-EMPHASIS או לכיבוי שריר — לחיצה על השריר רק מפעילה רקע לבן וזהו."*

          It exists and it always did; it rendered at the FOOT of the scroller, under the figure, so
          on a 390-point phone it landed behind the "Build my program" footer. His screenshot shows
          the top of it — the word "back" and the crown of three buttons — clipped by the footer's
          edge. **A control you cannot see is a control that does not exist**, and the muscle turning
          white was the only feedback that reached her.

          It is a floating panel above the footer now: a press is answered where the thumb is, not
          somewhere she has to go looking.
        */}
        {/* Standing fact, then the two things that answer an act. Never more than one of those. */}
        {/*
          ⛔ THE LINE SAYS WHAT HER WEEK CAN HONOUR (founder, 2026-08-12) — it promised two on a
          three-day week that can hold one, so his second mark being refused looked like a fault
          rather than the rule. `emphasisBudgetFor` is asked here and by the guard alike.
        */}
        <Text style={styles.note}>
          {emphasisBudgetFor(days) === 1
            ? tg('ob.mapEmphasisOne', { n: marks.length })
            : tg('ob.mapEmphasis', { n: marks.length })}
        </Text>
        {nothingOn ? <Text style={styles.refusal}>{tg('ob.mapNothingOn')}</Text> : null}
        {consequence ? <Text style={styles.note}>{consequence}</Text> : null}
      </ScrollView>

      {/* ⛔ ABOVE THE FOOTER, NOT UNDER IT — see the note where it used to sit. */}
      {open ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          {/*
            ⛔ THE REFUSAL RIDES WITH THE CONTROL THAT WAS REFUSED (founder, 2026-08-12).

            It rendered at the foot of the scroller, under the figure — the same place the stance
            sheet was, and the same consequence: **the sentence explaining why his second lead did
            not take was off the bottom of the screen.** He met a silent refusal, which is precisely
            the defect `emphasisRefusal` was written to end.
          */}
          {refused ? (
            <Text style={styles.refusal}>
              {refused.reason === 'budget'
                ? tg('ob.mapBudgetFull', { a: tg(`muscle.${refused.marks[0]}`), b: tg(`muscle.${refused.marks[1]}`) })
                : refused.reason === 'same_region'
                  ? tg('ob.mapSameRegion', { a: tg(`muscle.${refused.marks[0]}`) })
                  : tg('ob.mapFullBodyWeek', { n: days, a: tg(`muscle.${refused.marks[0]}`) })}
            </Text>
          ) : null}
          <View style={styles.sheet}>
            <Text style={styles.sheetName}>{tg(`muscle.${open}`)}</Text>
            <View style={styles.rungs}>
              {STANCES.map((s) => {
                const isOn = openStance === s.key;
                return (
                  <Pressable
                    key={s.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${tg(`muscle.${open}`)} — ${tg(s.word)}`}
                    accessibilityState={{ selected: isOn }}
                    onPress={() => setStance(open, s.key)}
                    style={[styles.rung, isOn && styles.rungOn]}
                  >
                    <Text style={[styles.rungText, isOn && styles.rungTextOn]}>{tg(s.word)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </OnboardingScaffold>
  );
}

export default BodyMap;

/*
 * ⚠️ NO `root`, NO `title`, NO `sub`, NO `cta`. The scaffold draws the frame, the head and the
 * pinned footer for every other step in the intake; this screen had hand-rolled all four, which is
 * why it was the only one without a back arrow. What is left here is what is genuinely this
 * screen's own: the face tabs, the stance sheet, and the two lines that answer an act.
 */
const styles = StyleSheet.create({
  bringYours: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  bringYoursText: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textDecorationLine: 'underline', textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 100, borderWidth: 1, borderColor: color.borderControl },
  tabOn: { backgroundColor: color.paper, borderColor: color.paper },
  tabText: { fontFamily: font.mono, fontSize: 17, color: color.textMuted, letterSpacing: 1 },
  tabTextOn: { color: color.onPaper },
  body: { paddingTop: 16, paddingBottom: 24, alignItems: 'center' },
  /* ⛔ A FLOATING PANEL, above the footer — see the note at the markup. */
  sheetLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 108 },
  sheet: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.4)',
    backgroundColor: 'rgba(18,18,16,0.96)',
  },
  sheetName: { fontFamily: font.mono, fontSize: 17, color: color.textMuted, letterSpacing: 1.4, marginBottom: 8 },
  rungs: { flexDirection: 'row', gap: 8 },
  rung: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  rungText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary },
  rungTextOn: { color: color.onPaper },
  note: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 16, textAlign: 'center' },
  refusal: {
    marginBottom: 12, fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 12, textAlign: 'center' },
});
