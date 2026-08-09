/**
 * Program Created (§4.6) — where she meets the week the coach wrote for her.
 *
 * ════ ⛔ IT USED TO ANIMATE A GENERATOR THAT NO LONGER EXISTS ════
 *
 * Founder, on the device, 2026-08-02: *"there's no screen at all that presents the plan nicely […]
 * he gave me the feeling of yet another banal, un-personalised programme."*
 *
 * This screen opened with 2.8 seconds of sequenced ticks — "Designing your split", "Distributing
 * weekly volume" — with a comment underneath insisting the pacing was only honest because every
 * step named real work in the real order. **That stopped being true when the generator was
 * deleted.** It was theatre for a machine that is gone, and it filled the one moment where she is
 * most curious about what she is getting with a progress bar for nothing.
 *
 * What replaced it is the programme itself. It already exists by the time she arrives — the coach
 * wrote it during the conversation, and `db.loadCoachPlan()` has it — so there is nothing to wait
 * for and nothing to stage. `PlanWeek` draws it, the coach's own instruction on each row included.
 *
 * ⚠️ THE TRIAL BLOCK BELOW IT IS UNTOUCHED and must stay that way: the fourteen, the FREE pill, the
 * no-card-until-they-are-done line and the two-phase arc are all founder-ratified, several of them
 * after a correction. This screen gained a plan; it did not become a different screen.
 *
 * ── the original notes, still binding on the half that survives ──────────────────────────────────
 *
 * Founder 2026-07-12:
 *  • Each step LANDS. A completed step fires a light tick against the wrist as its check
 *    stamps in — the athlete feels the machine working rather than watching a spinner.
 *    This is the only place in onboarding where Hush is visibly doing something, so it
 *    has to be felt.
 *  • The steps ahead sat at 0.32 opacity — effectively invisible, so the list read as one
 *    line rather than a plan. They now hold real presence and the CONTRAST between pending
 *    and landed does the work.
 *  • Ready is a celebration, so it is composed like one: the block is centred (the top half
 *    of the screen was dead white space) and the check is a real mark — a sage seal — not a
 *    20px glyph on a screen that just said "your program is built".
 *  • The CTA said "Go to my next workout". It is the athlete's FIRST workout; nothing is
 *    "next" yet.
 *
 * Founder 2026-07-13 — this screen is where the PROMISE is made: it speaks the athlete's name and
 * states the deal in the first person (ob.readyBody, still the copy the Home card defers to).
 *
 * v7 1.5 — READY, rebuilt (founder 2026-07-24): FREE is the headline fact. A moss start/finish
 * mark leads a serif "{name}, your program is built."; the fourteen stand HUGE beside a WORKOUTS
 * label and a moss FREE pill; a moss check carries "Cancel anytime — one tap, no questions asked.";
 * a band ("HOW YOUR FOURTEEN WORK") draws the trial arc as fourteen ticks over two phases — I LEARN
 * YOU (1–4, cream) then I KNOW YOU (5–14 · set from your reps, moss); an italic "— hush" signs it.
 * The count is FREE_SESSION_LIMIT, so the promise and the paywall gate can never drift apart. "Show
 * my program" runs completeOnboarding and leads straight into the first session — conversion is the
 * trial-complete paywall (§4.3), not here.
 */
// @ts-nocheck

// 

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Button, Legend } from '@/components/ds';
import { PlanWeek } from '@/components/PlanWeek';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { CoachPlan } from '@/domain/coachPlan';
import { learnPhaseLength } from '@/domain/schedule';
import type { OnboardingInputs } from '@/data/local/models';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, tracking, trackingPx, radius, paper } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ProgramCreated'>;

export function ProgramCreated({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { inputs } = route.params;
  const name = inputs.name ?? app.pendingName(); // the profile is written by the CTA below
  // HER learning phase, from the programme the assembler is about to build (see `learnCount`).
  const [coachPlan, setCoachPlan] = useState<CoachPlan | null>(null);
  useEffect(() => {
    let alive = true;
    void db.loadCoachPlan().then((p) => alive && setCoachPlan(p));
    return () => {
      alive = false;
    };
  }, []);
  const learnTicks = useMemo(() => learnCount(coachPlan), [coachPlan]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();

  /*
   * ⚠️ THE FOUR-STEP BUILD SEQUENCE IS DELETED, AND ITS OWN COMMENT SAID WHY IT HAD TO BE.
   *
   * It read: *"the pacing is PRESENTATIONAL — a clock, not a measurement […] that is only honest
   * while every step names work the engine REALLY does, in the order it really does it"*, and it
   * had already been corrected once for naming a step that did not exist.
   *
   * The whole engine it described is gone. Every step named work nothing performs, on a 2.8-second
   * clock, in front of an athlete whose programme was finished several turns ago. Waiting is not a
   * feature; it was only ever the cover for a build that took milliseconds.
   *
   * She arrives to her actual week now. The seal still draws in, once, because the arrival is worth
   * a beat — it simply no longer waits for a fictional machine to finish.
   */
  const seal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    haptics.success();
    if (reduced) {
      seal.setValue(1);
      return;
    }
    Animated.timing(seal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduced, seal]);



  async function onDone() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // Builds the program and writes the profile → Root swaps to Home.
      await app.completeOnboarding(inputs);
    } catch {
      // A storage failure here used to reject into the void, leaving `busy` true forever —
      // the CTA disabled, and the athlete unable to finish onboarding AT ALL. It is the last
      // screen before the app; it must always offer a way through. Let them press again.
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.readyBlock, { opacity: seal }]}>
            {/* The measuring mark — a moss start/finish bracket with the dot arriving at centre. */}
            <StartFinishMark />
            {/* THE NAME (founder 2026-07-13), folded into the serif statement the way the v7 mock
                draws it: "Erez, your program is built." — addressed, not generic. */}
            <Text style={styles.readyBuilt} accessibilityRole="header">
              {name ? t('ob.readyBuilt', { name: bidi(name) }) : t('ob.readyBuiltNoName')}
            </Text>
            {/*
              ⛔ THE PROGRAMME HAS A NAME NOW (founder 2026-08-04, on the product feeling generic):
              *"my model from the start was to be the SPOTIFY of the fitness world, and right now I
              don't recognise my product."*

              The sharpest thing about Discover Weekly is not the algorithm — it is that what arrives
              is a MADE OBJECT with a name and a shape. A playlist without a name is a list of songs,
              and a week without one is a screen. This is that name, in the coach's serif, directly
              under "your programme is built" — so the first thing she reads is what she is ON.

              ⚠️ ABSENT IS A REAL STATE. `title` is optional in the schema on purpose: a coach forced
              to name everything writes "Your Personalized Fitness Journey". When it has nothing
              worth calling the programme, this draws nothing and the screen reads as it always did.
            */}
            {coachPlan?.title ? (
              <View style={styles.programName}>
                <Text style={styles.programTitle}>{bidi(coachPlan.title)}</Text>
                {coachPlan.why ? <Text style={styles.programWhy}>{coachPlan.why}</Text> : null}
              </View>
            ) : null}
            {/* THE HEADLINE FACT (founder 2026-07-24): the fourteen stand huge, FREE beside them. */}
            <View style={styles.freeRow}>
              <Text style={styles.bigNum}>{FREE_SESSION_LIMIT}</Text>
              <View style={styles.freeCol}>
                <Legend size={12} track={0.22}>{t('ob.readyWorkouts')}</Legend>
                <View style={styles.freePill}>
                  <Legend size={textScale.md} track={0.18} weight="semibold" align="center" style={styles.freePillText}>
                    {t('ob.readyFree')}
                  </Legend>
                </View>
              </View>
            </View>
            {/* ════ THE LINE THAT HAS TO BE TRUE (founder 2026-07-29) ════
                It read "Cancel anytime — one tap, no questions asked", which answers a question she
                has not asked yet and quietly implies the opposite of the ratified model: something
                is already running that she might need to get out of. Nothing is. **No card is taken
                and nothing is charged until the fourteen workouts are done** — so the line says
                that, because it is both the stronger reassurance and the actual fact. */}
            <View style={styles.cancelRow}>
              <Icon name="check" size={15} color={color.accent} strokeWidth={2.4} />
              <Text style={styles.cancelText}>{t('ob.readyCancel', { n: FREE_SESSION_LIMIT })}</Text>
            </View>
            {/* The band explains the two phases of the trial arc.

                The second phase BEGINS WHERE THE FIRST ENDS. It read "5–14" whatever her week
                held — so an athlete learning in 2 was told sessions 3 and 4 belonged to neither
                phase, and one learning in 6 was told the engine knew her at 5 while the line
                above still said it was learning. */}
            <View style={styles.howCard}>
              <Legend tone="accent">{t('ob.readyHowTitle')}</Legend>
              <PhaseTimeline
                learnCount={learnTicks}
                learn={t('ob.readyLearnYou').toUpperCase()}
                learnRange={t('ob.readyLearnRange', { n: learnTicks })}
                know={t('ob.readyKnowYou').toUpperCase()}
                knowRange={t('ob.readyKnowRange', { from: learnTicks + 1, to: FREE_SESSION_LIMIT }).toUpperCase()}
              />
            </View>
            <Text style={styles.signature}>{t('ob.readySignature')}</Text>
            {/*
              ════ THE WEEK ITSELF, AND IT GOES LAST ON PURPOSE ════

              Below the promise rather than above it. The trial arc is the DEAL — the fourteen, the
              free pill, the no-card line — and it is what she has to understand before she agrees
              to anything. The programme is what she came for, so it is what the screen ends on and
              what the CTA sits under: the last thing she reads before "show my program" is the
              actual programme.
            */}
            <PlanWeek plan={coachPlan} units={inputs.units} />
          </Animated.View>
      </ScrollView>
      <View style={styles.footer}>
        {failed ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
        <Button variant="primary" size="lg" block label={t('ob.readyCta')} onPress={() => void onDone()} disabled={busy} />
      </View>
    </SafeAreaView>
  );
}

/**
 * How many of the fourteen are the "I learn you" phase — HER number, not a constant.
 *
 * It was `4`. Loop 1 learns a lift the first time it meets it, so the phase lasts exactly as many
 * sessions as her week holds DIFFERENT workouts: an athlete training twice a week was promised four
 * learning sessions, two of them re-runs, and one training six had it stop at four (founder
 * 2026-07-28). The programme does not exist yet on this screen — it is built by the CTA below — but
 * the assembler is PURE, so the same call the generator will make answers the question now, from
 * the map she just drew. `learnPhaseLength` counts the work, not the names — and it is the SAME
 * call 2.0 makes off the finished programme, so the two screens cannot promise different lengths.
 */
/**
 * How many sessions the learning phase runs for.
 *
 * It used to ask the ASSEMBLER to compose her week and count the lifts in it. The assembler is
 * deleted, and by the time this screen draws the coach has already written her programme — so it is
 * counted from what she will actually train rather than from a second week nobody will see.
 */
function learnCount(plan: CoachPlan | null): number {
  if (!plan) return 0;
  return learnPhaseLength(
    plan.sessions.map((s) => ({
      slots: s.blocks.flatMap((b) => b.items.map((i) => ({ exerciseId: i.ex }))),
    })),
  );
}

/** The moss start/finish measuring mark — two caps, a rule between them, the dot arrived at centre. */
function StartFinishMark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markBar} />
      <View style={styles.markCapStart} />
      <View style={styles.markCapEnd} />
      <View style={styles.markDot} />
    </View>
  );
}

/** The fourteen-tick trial arc: the first four cream (I learn you), the rest moss (I know you),
 *  under two down-brackets naming the phases. */
function PhaseTimeline({ learn, learnRange, know, knowRange, learnCount: learnTicks }: { learn: string; learnRange: string; know: string; knowRange: string; learnCount: number }) {
  return (
    <View>
      <View style={styles.tickRow}>
        <View style={styles.baseline} />
        {Array.from({ length: FREE_SESSION_LIMIT }).map((_, i) => {
          const isLearn = i < learnTicks;
          const last = i === FREE_SESSION_LIMIT - 1;
          return (
            <View
              key={i}
              style={[
                styles.tick,
                { backgroundColor: isLearn ? color.textPrimary : color.accent, height: last ? 40 : 34, marginTop: last ? -3 : 0 },
              ]}
            />
          );
        })}
      </View>
      {/* ════ THE BRACKETS MEASURE HER PHASE, AND THE LABELS ARE NOT CLIPPED TO THEM ════

          It read "I LEAR…" (founder 2026-07-29). Two faults, one on top of the other. The split was
          a hardcoded 23% / 70% — an approximation of the constant `4` that `learnCount` stopped
          being, so the bracket no longer measured anything; and the label was pinned inside that
          column with `numberOfLines={1}`, so the one sentence this card exists to make was the
          thing that got an ellipsis.

          Now the brackets are the REAL proportion (her learning phase against the fourteen), and
          the words sit on their own row underneath, free to take the width they need. A bracket is
          a measurement; a label is a sentence; making one live inside the other cost both. */}
      <View style={styles.bracketRow}>
        <View style={[styles.bracket, { flex: learnTicks, borderColor: color.textPrimary }]} />
        <View style={styles.bracketGap} />
        <View style={[styles.bracket, { flex: Math.max(1, FREE_SESSION_LIMIT - learnTicks), borderColor: color.accent }]} />
      </View>
      <View style={styles.phaseRow}>
        <View style={styles.phaseCol}>
          <Text style={[styles.phaseLabel, { color: color.textPrimary }]}>{learn}</Text>
          <Text style={styles.phaseRange}>{learnRange}</Text>
        </View>
        <View style={styles.phaseCol}>
          <Text style={[styles.phaseLabel, styles.phaseLabelEnd, { color: color.accent }]}>{know}</Text>
          <Text style={[styles.phaseRange, styles.phaseLabelEnd]}>{knowRange}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The name sits between the greeting and the fourteen — it is the object, they are its terms.
  programName: { marginTop: 18, gap: 8 },
  programTitle: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 36,
    color: color.textPrimary,
    textAlign: 'left',
  },
  // The reason is the coach speaking, so it wears the coach's italic — the same voice as its notes.
  programWhy: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 16,
    lineHeight: 24,
    color: color.textSecondary,
    textAlign: 'left',
  },
  root: { flex: 1, backgroundColor: color.bg },
  /*
   * A ScrollView's content, not a flex child: the week can be three sessions or six, and a screen
   * that centred a fixed block now has to be able to run past the bottom of the phone.
   * `flexGrow` keeps a SHORT programme centred the way it always was.
   */
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 34, paddingVertical: 24 },








  // ready — a left-aligned, centred column (v7 1.5). The mark leads it, FREE is the headline.
  readyBlock: { alignItems: 'stretch', gap: 20 },

  // The moss start/finish measuring mark (64 × 22).
  mark: { width: 64, height: 22 },
  markBar: { position: 'absolute', left: 0, top: 10, width: 64, height: 2, backgroundColor: color.accent },
  markCapStart: { position: 'absolute', left: 0, top: 2, width: 2, height: 18, backgroundColor: color.accent },
  markCapEnd: { position: 'absolute', right: 0, top: 2, width: 2, height: 18, backgroundColor: color.accent },
  markDot: { position: 'absolute', left: 27, top: 5, width: 12, height: 12, borderRadius: 6, backgroundColor: color.accent },

  // "Erez, your program is built." — the serif statement, 40px.
  readyBuilt: { fontFamily: font.serif, fontSize: 40, lineHeight: 43, letterSpacing: trackingPx(40, tracking.display), color: color.textPrimary, textAlign: 'left' },

  // The headline fact: the fourteen huge, WORKOUTS + a FREE pill beside them.
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  // The huge free-session figure sits under a centred block — declare it, so Hebrew does not
  // freeze it to the physical left (an omitted alignment is iOS `natural`, which RN never flips).
  bigNum: { fontFamily: font.monoMedium, fontSize: 104, lineHeight: 104, letterSpacing: -5.2, color: color.textPrimary, textAlign: 'center' },
  freeCol: { gap: 8, alignItems: 'flex-start' },
  // The pill is a fixed 176 × 36 bar, not a label with padding — it is the width the handoff
  // draws, so FREE reads as a stamp across the column rather than a chip hugging four letters.
  freePill: { width: 176, height: 36, borderRadius: 100, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  // Paper on moss — the mark carries the LIGHT tone here, never the stage's ink.
  freePillText: { color: color.paper },

  // "Cancel anytime" — a moss check + a quiet sans line.
  cancelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancelText: { flex: 1, fontFamily: font.sans, fontSize: 14.5, lineHeight: 20, color: color.textSecondary, textAlign: 'left' },

  // The two-phase band.
  howCard: {
    gap: 14,
    backgroundColor: color.fillSubtle,
    borderWidth: 1.5,
    // A DEEP-MOSS rim at 35%, not a cream hairline: the band is the one lit object on the
    // step, and the handoff gives it a moss edge and a wide cream glow to say so.
    borderColor: 'rgba(62,87,63,0.35)',
    borderRadius: radius.sheet,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    shadowColor: '#f1eee5',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 20 },
    elevation: 6,
  },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  baseline: { position: 'absolute', left: 0, right: 0, top: 16, height: 1.5, backgroundColor: 'rgba(241,238,229,0.14)' },
  tick: { width: 2.5 },
  // The two brackets, sized by the REAL split of the fourteen (see PhaseTimeline).
  bracketRow: { flexDirection: 'row', marginTop: 12 },
  bracketGap: { width: 8 },
  bracket: { height: 8, borderTopWidth: 1.5, borderStartWidth: 1.5, borderEndWidth: 1.5 },
  // …and the words beneath them, each free to take the width it needs.
  phaseRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  phaseCol: { flexShrink: 1 },
  phaseLabel: { fontFamily: font.monoSemibold, fontSize: 13.5, letterSpacing: 0.95, textAlign: 'left' },
  phaseLabelEnd: { textAlign: 'right' }, // rtl-ok: the logical END, merged onto the base above
  phaseRange: { fontFamily: font.mono, fontSize: 13, color: color.textMuted, textAlign: 'left', marginTop: 3 },

  // "— hush" — the italic serif signature.
  signature: { fontFamily: font.serif, fontStyle: 'italic', fontSize: textScale.md, color: color.textSecondary, textAlign: 'left' },

  footer: { paddingHorizontal: space.gutter, paddingBottom: 30, gap: 10 },
  error: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'center' },
});
