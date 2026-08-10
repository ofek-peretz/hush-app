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
  const [refused, setRefused] = useState<string[] | null>(null);

  const marks = useMemo(() => Object.entries(map).filter(([, s]) => s === 'emphasis').map(([m]) => m), [map]);
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
    if (stance === 'emphasis' && map[muscle] !== 'emphasis' && marks.length >= EMPHASIS_BUDGET) {
      setRefused(marks.slice(0, EMPHASIS_BUDGET));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
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
  const build = () => {
    if (nothingOn) return; // S-3 — an unbuildable map never leaves this screen
    const p = route?.params ?? {};
    navigation.navigate('BuildingProgramme', {
      inputs: {
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
      },
    });
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
      sub={tg('ob.mapSub')}
      headGap={18}
      bodyTop={18}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={tg('ob.daysBuild')}
          onPress={build}
          /* S-3 — an unbuildable map never leaves this screen, and the reason is said above. */
          disabled={nothingOn}
        />
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

        {/* The sheet: three rungs for whichever muscle is open. Its labels are what VoiceOver reads. */}
        {open ? (
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
        ) : null}

        {/* Standing fact, then the two things that answer an act. Never more than one of those. */}
        <Text style={styles.note}>{tg('ob.mapEmphasis', { n: marks.length })}</Text>
        {refused ? (
          <Text style={styles.refusal}>
            {tg('ob.mapBudgetFull', { a: tg(`muscle.${refused[0]}`), b: tg(`muscle.${refused[1]}`) })}
          </Text>
        ) : null}
        {nothingOn ? <Text style={styles.refusal}>{tg('ob.mapNothingOn')}</Text> : null}
        {consequence ? <Text style={styles.note}>{consequence}</Text> : null}
      </ScrollView>
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
  tabs: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 100, borderWidth: 1, borderColor: color.borderControl },
  tabOn: { backgroundColor: color.paper, borderColor: color.paper },
  tabText: { fontFamily: font.mono, fontSize: 13, color: color.textMuted, letterSpacing: 1 },
  tabTextOn: { color: color.onPaper },
  body: { paddingTop: 16, paddingBottom: 24, alignItems: 'center' },
  sheet: { width: '100%', marginTop: 18, alignItems: 'center' },
  sheetName: { fontFamily: font.mono, fontSize: 13, color: color.textMuted, letterSpacing: 1.4, marginBottom: 8 },
  rungs: { flexDirection: 'row', gap: 8 },
  rung: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  rungText: { fontFamily: font.sans, fontSize: 14, color: color.textPrimary },
  rungTextOn: { color: color.onPaper },
  note: { fontFamily: font.sans, fontSize: 13, color: color.textMuted, marginTop: 16, textAlign: 'center' },
  refusal: { fontFamily: font.sans, fontSize: 13, color: color.textPrimary, marginTop: 12, textAlign: 'center' },
});
