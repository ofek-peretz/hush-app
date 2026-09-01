/**
 * ════ THE PLAN BUILDER — full authorship, with a steward (founder, 2026-08-25) ════
 *
 * *"אנחנו צריכים לאפשר בנייה באופן מלא של תוכנית האימון… רק שנעשה את זה טוב יותר."*
 *
 * HEVY hands her a blank sheet; this sheet answers back. She writes days, lifts, sets and order —
 * the engine keeps three jobs it does better than any sheet: the CLOCK (every day priced with the
 * same arithmetic the cap and Today read, bridges included), the ADVICE (the week judge in
 * advisory mode — a single leg day is stated as a price, never blocked), and the LOADS (a sealed
 * week runs the same runner as an imported one: smart seeds, Loop-2 progression, warm-up ramps,
 * learned rests).
 *
 * Ownership follows the imported-week passport: SAVE seals `authored: 'athlete_or_coach'`, every
 * rebuild gate refuses it thereafter, and the only way back is the loud "hand the pen back"
 * button, which regenerates an engine week. Both directions are her tap; neither is implied.
 *
 * Screen split: `PlanBuilderView` is pure (gallery-mountable), the container owns I/O.
 *
 * ── ⛔ AND IT IS ONBOARDING STEP 3 OF 3 (founder, 2026-08-29) ────────────────────────────────────
 * *"אני רוצה לעשות את שלב בניית התוכנית … כמסך בניית התוכנית בONBOARDING. כי כרגע מה שקורה זה שאני
 * לא יכול לבנות את התוכנית בעצמי מההתחלה."*
 *
 * The screen was reachable from the Program tab and nowhere else, so the first thing an athlete
 * arriving from Hevy wants — *I'll write my own week* — sat behind an account she did not have yet,
 * and the intake's only offer was a week assembled for her. It is a step now, in the seat the body
 * map held, with a third door: build one for me, a blank sheet, or a proven shelf to change.
 *
 * The route out is the import's, exactly: seal → `saveBuiltProgram` → `BuildingProgramme` (which
 * reads the sealed week instead of generating one, so the reveal is hers) → `ProgramCreated`, whose
 * CTA runs `completeOnboarding` — and `engineMayRebuild` refuses to write anything over a week
 * stamped `authored: 'athlete_or_coach'`.
 */

//

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { BottomSheet, useSheetScroll } from '@/components/BottomSheet';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { SwapSheet } from '@/components/SwapSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { MotionThumb } from '@/motion/render/MotionThumb';
import type { FigureSex } from '@/motion/types';
import { Arrive, Legend, Button, TextField, WheelPicker } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { color, font, radius } from '@/design/tokens';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { FUNNEL_EVENTS } from '@/platform/events';
import { clearImport } from '@/domain/pendingImport';
import type { OnboardingInputs, Program, ProgramDay } from '@/data/local/models';
import { EXERCISES, exerciseById, exerciseCues, exerciseDisplayName, isSwapOnly, type Exercise } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { swapChoices } from '@/domain/swapPool';
import { useApp } from '@/state/stores/appStore';
import type { WeekFinding } from '@/domain/weekQuality';
import {
  addDay, addLift, blankDraft, builderAdvice, builderMinutes, draftFromProgram, moveLift, ownedDayIds,
  removeDay, removeLift, renameDay, reorderDayForStations, replaceLift, sealSmart, setLiftSets, togglePair,
  BUILDER_SETS_MAX, BUILDER_SETS_MIN,
} from '@/domain/planBuilder';
import { applyPlanSuggestion, type PlanReview as PlanReviewShape, type PlanSuggestion } from '@/domain/planReview';
import { PLAN_TEMPLATES, materializeTemplate, templateById } from '@/domain/planTemplates';
import { requestPlanReview, type PlanReviewResult } from '@/platform/coach/planReview';
import { requestPlanBuild } from '@/platform/coach/planBuild';
import { draftFromCoachWeek } from '@/domain/coachDraft';

/* ─────────────────────────────────────────────────────────────── how many days, asked once */

/*
 * ⛔ THREE DAYS IS WHERE MOST PEOPLE LAND, so the wheel opens there and not on its own floor. It
 * carried this value on `AboutYou` and travelled with the question (2026-08-29).
 */
const DAYS_OPENS_ON = 3;

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE WANTS FROM THE WEEK — the one screen where she talks to the model.
 *
 * ⛔ FOUNDER, 2026-08-29: *"צריך לעצב את המסך של שיחת הבינה בצורה הכי טובה שאפשר… זה קריטי זה בדיוק
 * שלב הONBOARDING."* He chose a FULL STEP over the bottom sheet this replaces.
 *
 * ── WHY A SHEET WAS THE WRONG SHAPE ────────────────────────────────────────────────────────────
 * A bottom sheet is where this app puts a SETTING — a set count, a swap, a chooser. It slides over
 * the screen you were on, and what it says about its contents is "this is a detail of that". The
 * two questions here are not a detail of the doors behind them; they are the whole of what the
 * model is given, and the difference between this door and the shelf below it. Every other question
 * in the intake is a full step, and so is this one.
 *
 * ⛔ AND THE FIELD SITS ON A RULE, WHICH THE SHEET GOT WRONG. My first cut borrowed
 * `styles.searchWell` from the add-lift sheet — a bordered box — against the founder's 2026-07-12
 * ruling that an input sits ON a rule, never in a box, *"the way a figure sits on a scale"*. That is
 * what `TextField` is, so it is what this uses.
 *
 * ⚠️ THE TEXT IS OPTIONAL AND SAYS SO. She can turn the wheel and press — *"קצר וקולע"* is the
 * founder's own bar for this door, and a required goal field would make it a form again. What the
 * line buys when she does write it is everything: without it the model is handed the same three
 * facts a template is handed, and cannot beat the template.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function AskTheCoach({ opensOn, intake, onBack, onAsk }: {
  opensOn: number;
  /** Inside the intake it wears the step chrome; from the Program tab it is a screen of its own. */
  intake: boolean;
  onBack: () => void;
  onAsk: (days: number, ask: string, minutes: number) => void;
}) {
  const { t } = useCopy();
  const [days, setDays] = useState(opensOn);
  const [ask, setAsk] = useState('');
  /*
   * ════ THE QUESTION THE PRODUCT STOPPED ASKING (2026-09-01, audit lever 3 — decided) ════
   * `workoutMinutes` was silently defaulted to 60 at ProgramCreated after its screen was deleted —
   * the exact category of default the intake's own law calls a lie (`daysPerWeek: 0` means "nobody
   * asked her"). The wheel opens ON 60, which is a visible default she confirms by not turning it
   * — a different thing from a number invented behind her back. The engine's time budget (S-64)
   * reads this until her measured session times replace it.
   */
  const [minutes, setMinutes] = useState(60);

  const body = (
    <View style={styles.askRows}>
      <View style={styles.askCol}>
        <Legend size={22} track={0.26} style={styles.askLegend}>{t('ob.daysPerWeek')}</Legend>
        <WheelPicker
          value={days}
          onChange={setDays}
          step={1}
          min={2}
          max={6}
          size="lg"
          ends="chevron"
          label={t('ob.daysPerWeek')}
        />
      </View>
      <View style={styles.askCol}>
        <Legend size={22} track={0.26} style={styles.askLegend}>{t('ob.sessionLength')}</Legend>
        <WheelPicker
          value={minutes}
          onChange={setMinutes}
          step={15}
          min={30}
          max={90}
          size="lg"
          ends="chevron"
          label={t('ob.minutesLabel')}
        />
      </View>
      {/*
        ⚠️ THE PLACEHOLDER IS AN INVITATION, NOT AN EXAMPLE TO COPY. It shows the KIND of thing that
        helps — an emphasis, a piece of equipment to avoid — because a blank line under "what
        matters to you?" is a question most people answer with nothing. It is copy, not prompt: the
        model never sees it, which is the whole reason it is allowed to be concrete here and is
        forbidden in `buildPrompt` (see the no-examples note there).
      */}
      <TextField
        block
        label={t('ob.weekAskLegend')}
        value={ask}
        onChangeText={setAsk}
        placeholder={t('ob.weekAskPlaceholder')}
        maxLength={200}
        returnKeyType="done"
      />
      <Text style={styles.askOptional}>{t('ob.weekAskOptional')}</Text>
    </View>
  );

  const act = <Button variant="primary" size="lg" block label={t('ob.weekEngine')} onPress={() => onAsk(days, ask, minutes)} />;

  if (intake) {
    return (
      <OnboardingScaffold
        onBack={onBack}
        /* 5/5 — the rail ADVANCES here (audit lever 3): it used to redraw 4/4 on the step right
           before the payoff, which read as a stall at the exact moment she was closest to done. */
        progress={{ index: 5, total: 5 }}
        keyboard
        legend={t('ob.weekLegend')}
        title={t('ob.askTitle')}
        headGap={22}
        bodyTop={16}
        footer={act}
      >
        {body}
      </OnboardingScaffold>
    );
  }
  /*
   * ⚠️ THE KEYBOARD MUST NOT SIT ON THE ONLY BUTTON. The intake variant gets this from
   * `OnboardingScaffold`'s own `keyboard` prop; off the Program tab there is no scaffold, and the
   * CTA lives inside the scroll content directly under a text field — so on a small phone the
   * keyboard covers the one control on the screen. Same behaviour, stated explicitly.
   */
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.doorsWrap} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} hitSlop={12} style={styles.back}>
            <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
          </Pressable>
          <Arrive order={0}>
            <Text style={styles.title}>{t('ob.askTitle')}</Text>
          </Arrive>
          <Arrive order={1}>{body}</Arrive>
          <View style={styles.askAct}>{act}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────────── the add-lift sheet */

/*
 * ⛔ CORE IS ON THE SHELF AGAIN (founder, 2026-08-29: *"אין אפשרות של להוסיף תרגילי בטן משום מה"*).
 *
 * The chip row was `CANONICAL_MUSCLE_ORDER` minus `'Core'`, borrowed from `weekQuality`'s
 * `structural` list — and there the exclusion is correct: abs are not a STRUCTURAL volume target,
 * so the scoreboard does not price a week by them. That is a statement about auditing, and it was
 * copied into a control whose whole job is letting her ask for something. Nine core movements sat
 * in the catalogue, reachable only by guessing their name into the search box.
 *
 * The chips now name the whole canonical order. The two ADVANCED core lifts (hanging leg raise,
 * ab wheel) stay out of this sheet — that is `isSwapOnly` on line 91 doing its documented job,
 * a separate ruling made on the founder's own device QA (2026-08-23) and untouched here.
 */
const MUSCLES = CANONICAL_MUSCLE_ORDER;

function AddLiftSheet({ taken, figure, onPick, onClose }: {
  /** Lifts already in the day — drawn dimmed and unpickable, never hidden (no mystery gaps). */
  taken: ReadonlySet<string>;
  figure: FigureSex;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const scroll = useSheetScroll();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (e.id.startsWith('_') || isSwapOnly(e.id)) return false;
      if (muscle && e.muscle !== muscle) return false;
      if (!q) return true;
      return exerciseDisplayName(e.id).toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
    }).slice(0, 40);
  }, [query, muscle]);

  return (
    <BottomSheet onClose={onClose}>
      <Legend style={styles.sheetLegend}>{t('builder.addLift')}</Legend>
      <View style={styles.searchWell}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('builder.searchPlaceholder')}
          placeholderTextColor={color.textTertiary}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t('builder.searchPlaceholder')}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
        {MUSCLES.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            onPress={() => setMuscle(muscle === m ? null : m)}
            style={[styles.chip, muscle === m && styles.chipOn]}
          >
            <Text style={[styles.chipText, muscle === m && styles.chipTextOn]}>{t(`muscle.${m}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={styles.sheetList} {...scroll}>
        {matches.map((e) => {
          const inDay = taken.has(e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={exerciseDisplayName(e.id)}
              disabled={inDay}
              onPress={() => onPick(e.id)}
              style={({ pressed }) => [styles.pickRow, pressed && styles.pickRowPressed, inDay && styles.pickRowTaken]}
            >
              {/* The still of the movement itself (founder 2026-08-25): while she builds, every
                  row says what it IS at a glance — our own athlete, not a stock clip. */}
              <MotionThumb exerciseId={e.id} size={44} figure={figure} style={styles.pickThumb} />
              <View style={styles.pickText}>
                <Text style={styles.pickName} numberOfLines={1}>{bidi(exerciseDisplayName(e.id))}</Text>
                <Legend size={17} track={0.1}>{`${t(`muscle.${e.muscle}`)} · ${t(`equipment.${e.equipment}`, { defaultValue: e.equipment })}`}</Legend>
              </View>
              {inDay ? <Legend size={17} track={0.1}>{t('builder.inDay')}</Legend> : <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />}
            </Pressable>
          );
        })}
        {matches.length === 0 ? <Text style={styles.noMatch}>{t('builder.noMatches')}</Text> : null}
      </ScrollView>
    </BottomSheet>
  );
}

/* ─────────────────────────────────────────────────────────────────── one lift row */

function LiftRow({ dayIdx, slotIdx, exerciseId, sets, figure, expanded, onToggleSets, onSets, onMove, onRemove, onSwap, onDemo, isFirst, isLast }: {
  dayIdx: number; slotIdx: number; exerciseId: string; sets: number;
  figure: FigureSex;
  expanded: boolean;
  onToggleSets: () => void;
  onSets: (n: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
  onDemo: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const { t } = useCopy();
  const ex = exerciseById(exerciseId);
  return (
    <View style={styles.liftBlock}>
      <View style={styles.liftRow}>
        {/* The still is a DOOR: tap it and the full looping demo opens (the same card the workout
            uses), so "what is this exercise" is answered without leaving the build. */}
        <Pressable accessibilityRole="button" accessibilityLabel={t('builder.showDemo')} hitSlop={8} onPress={onDemo}>
          <MotionThumb exerciseId={exerciseId} size={48} figure={figure} style={styles.liftThumb} />
        </Pressable>
        <View style={styles.liftText}>
          <Text style={styles.liftName} numberOfLines={2}>{bidi(exerciseDisplayName(exerciseId))}</Text>
          <Legend size={17} track={0.06}>{ex ? `${t(`muscle.${ex.muscle}`)} · ${t(`equipment.${ex.equipment}`, { defaultValue: ex.equipment })}` : ''}</Legend>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('builder.sets')} hitSlop={10} onPress={onToggleSets} style={styles.setsChip}>
          <Text style={styles.setsFigure}>{`${sets}×`}</Text>
        </Pressable>
        {/*
          ════ ⛔ FOUR IDENTICAL CONTROLS, AND ONE OF THEM DELETES A LIFT (2026-08-26) ════

          They sat in a row at one size in one tone: ⌃ ⌄ ⇄ ✕. Reorder is trivially reversible;
          REMOVE takes away a lift she chose and cannot be undone from here. Nothing on the row said
          which was which — four 17-point targets, eight points apart, on a phone.

          Two changes, and both pay twice:

          · THE REORDER PAIR STACKS. ⌃ over ⌄ in one 18-point column is the standard stepper idiom
            and it is honest about what they are: ONE job with two directions, not two controls. It
            also returns about 26 points of row width — and that width is why `לחיצת חזה במוט` was
            wrapping to two lines. The name was being squeezed by chrome.
          · REMOVE STANDS APART. A wider gap before it, so the destructive control is never
            adjacent-and-identical to a benign one. It keeps the muted tone deliberately: `alert` is
            reserved for pain and for destructive CONFIRMS (founder 2026-07-29), and painting a
            standing row control clay would put a red mark on every lift in her week.
        */}
        <View style={styles.liftActions}>
          <View style={styles.reorder}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('program.moveUp')} disabled={isFirst} hitSlop={8} onPress={() => onMove(-1)}>
              <Icon name="chevronUp" size={18} color={isFirst ? color.border : color.textMuted} strokeWidth={2} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('program.moveDown')} disabled={isLast} hitSlop={8} onPress={() => onMove(1)}>
              <Icon name="chevronDown" size={18} color={isLast ? color.border : color.textMuted} strokeWidth={2} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('swap.title')} hitSlop={8} onPress={onSwap}>
            <Icon name="swap" size={17} color={color.textMuted} strokeWidth={1.6} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('builder.removeLift')} hitSlop={8} onPress={onRemove} style={styles.removeGap}>
            <Icon name="close" size={17} color={color.textMuted} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>
      {expanded ? (
        <View style={styles.setsStrip} key={`sets-${dayIdx}-${slotIdx}`}>
          {Array.from({ length: BUILDER_SETS_MAX - BUILDER_SETS_MIN + 1 }, (_, i) => i + BUILDER_SETS_MIN).map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${n} ${t('builder.sets')}`}
              onPress={() => onSets(n)}
              style={[styles.setsCell, n === sets && styles.setsCellOn]}
            >
              <Text style={[styles.setsCellText, n === sets && styles.setsCellTextOn]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────── the review sheet */

/**
 * The AI's opinion, one call per opening, applied one suggestion at a time. The sheet asks on
 * mount (her tap opened it — that IS the request), never retries by itself, and every Apply runs
 * through `applyPlanSuggestion`, so the model obeys the same algebra her fingers do.
 */
function PlanReviewSheet({ draft, onDraft, onClose }: {
  draft: Program;
  onDraft: (next: Program) => void;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const scroll = useSheetScroll();
  const [state, setState] = useState<{ kind: 'busy' } | { kind: 'failed'; reason: string } | { kind: 'ready'; review: PlanReviewShape }>({ kind: 'busy' });
  const [applied, setApplied] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    void requestPlanReview(draft).then((r: PlanReviewResult) => {
      if (!alive) return;
      setState(r.ok ? { kind: 'ready', review: r.review } : { kind: 'failed', reason: r.reason });
    });
    return () => { alive = false; };
    // One call per OPENING, deliberately — the draft she edits mid-review is applied against live,
    // but the opinion answers the draft she asked about. Re-open to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestionLine = (sg: PlanSuggestion): string => {
    const name = exerciseDisplayName(sg.ex);
    switch (sg.do) {
      case 'add': return t('builder.review.add', { ex: name, day: sg.day });
      case 'remove': return t('builder.review.remove', { ex: name, day: sg.day });
      case 'sets': return t('builder.review.sets', { ex: name, n: sg.n ?? 0 });
      case 'swap': return t('builder.review.swap', { ex: name, to: exerciseDisplayName(sg.to ?? '') });
      case 'pair': return t('builder.review.pair', { ex: name, to: exerciseDisplayName(sg.to ?? '') });
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <Legend style={styles.sheetLegend}>{t('builder.aiReview')}</Legend>
      {state.kind === 'busy' ? (
        <Text style={styles.reviewBody}>{t('builder.review.busy')}</Text>
      ) : state.kind === 'failed' ? (
        <Text style={styles.reviewBody}>{t(`builder.review.fail.${state.reason}`, { defaultValue: t('builder.review.fail.upstream') })}</Text>
      ) : (
        <ScrollView style={styles.sheetList} {...scroll}>
          <Text style={styles.reviewSay}>{bidi(state.review.say)}</Text>
          {state.review.suggestions.map((sg, i) => (
            <View key={i} style={styles.reviewRow}>
              <View style={styles.reviewText}>
                <Text style={styles.reviewVerb}>{suggestionLine(sg)}</Text>
                <Text style={styles.reviewWhy}>{bidi(sg.say)}</Text>
              </View>
              {applied.has(i) ? (
                <Legend size={17} track={0.1}>{t('builder.review.applied')}</Legend>
              ) : (
                <Button
                  variant="ghost"
                  label={t('builder.review.apply')}
                  onPress={() => {
                    onDraft(applyPlanSuggestion(draft, sg));
                    setApplied((prev) => new Set(prev).add(i));
                  }}
                />
              )}
            </View>
          ))}
          {state.review.suggestions.length === 0 ? (
            <Text style={styles.reviewWhy}>{t('builder.review.clean')}</Text>
          ) : null}
        </ScrollView>
      )}
      <Button variant="ghost" block label={t('common.close')} onPress={onClose} style={styles.reviewClose} />
    </BottomSheet>
  );
}

/* ─────────────────────────────────────────────────────────────────── the pure view */

export interface PlanBuilderViewProps {
  draft: Program | null;
  /**
   * ⛔ THE BUILDER IS ALSO ONBOARDING STEP 3 OF 3 (founder 2026-08-29): *"אני לא יכול לבנות את
   * התוכנית בעצמי מההתחלה."*
   *
   * Same screen, same algebra, different chrome. In the intake it wears the `OnboardingScaffold`
   * (back arrow + the progress rail every other step carries), the doors gain a THIRD — *build one
   * for me* — and four controls that have nothing to talk about before there is an account are gone:
   * the ownership chips (there is no engine week to own a day OF), the hybrid note, "hand the pen
   * back", and the coach's review — `requestPlanReview` answers `not_configured` without a profile
   * on disk, and there is none until the last screen, so the button could only ever fail.
   */
  intake?: boolean;
  /** Intake only: she wants the week assembled for her — the third door, and the ordinary path. */
  /** ⚠️ CARRIES THE FREQUENCY IT JUST ASKED FOR — see `AskTheCoach`. It is the one door with nobody
   *  to derive the number from, so it is the one door that asks. */
  onLetHushBuild?: (daysPerWeek: number, ask: string, minutes?: number) => void;
  /** True while no draft exists yet and the saved week is the ENGINE's — the two-door opening. */
  offerDoors: boolean;
  savedIsAuthored: boolean;
  /** Day ids that currently read as HERS (the diff against the saved week) — the ownership chips. */
  ownedIds: ReadonlySet<string>;
  /** Which of the two athletes demonstrates — hers (the FormMedia rule, from the profile). */
  figure: FigureSex;
  advice: WeekFinding[];
  /** Leave the builder without saving — the visible door the screen never had (2026-08-26: the
   *  only exits were "שמור כתוכנית שלי" and the native swipe gesture, so a browse-only visit
   *  pressured a save; every sibling screen carries the same chevron). */
  onExit: () => void;
  onStartFromEngine: () => void;
  onStartBlank: () => void;
  /** A proven shelf was chosen — the container materializes it into a draft (planTemplates). */
  onStartTemplate: (templateId: string) => void;
  onDraft: (next: Program) => void;
  onSave: () => void;
  onRevert: () => void;
  onAiReview: () => void;
  aiBusy: boolean;
  /** The model is writing her week right now — the engine door's own wait (2026-08-29). */
  buildBusy?: boolean;
  /** The GALLERY's seam onto the ask step — the same shape as `previewWeekOpen` was, and the only
   *  way to file a screen that is otherwise one press inside another one. */
  previewAsking?: boolean;
  reviewOpen: boolean;
  onReviewClose: () => void;
}

export function PlanBuilderView(props: PlanBuilderViewProps) {
  const { t } = useCopy();
  const [addFor, setAddFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<{ day: number; slot: number } | null>(null);
  const [setsFor, setSetsFor] = useState<string | null>(null);
  const [demoFor, setDemoFor] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  /* The ask step, which stands instead of the doors. Declared with the other sheet state because
     the branches below return early and hooks may not sit behind one. */
  const [asking, setAsking] = useState(!!props.previewAsking);
  const d = props.draft;

  const adviceLine = (f: WeekFinding): string | null => {
    switch (f.rule) {
      case 'session_length':
        // The judge reports BOTH bounds under one rule: `limit` is the bound that was crossed.
        return f.measured < f.limit
          ? t('builder.advice.session_short', { day: f.subject, min: f.measured, floor: f.limit })
          : t('builder.advice.session_long', { day: f.subject, min: f.measured, max: f.limit });
      case 'under_dose':
        return t('builder.advice.under_dose', { muscle: t(`muscle.${f.subject}`, { defaultValue: f.subject }), sets: f.measured, floor: f.limit });
      case 'over_ceiling':
        return t('builder.advice.over_ceiling', { muscle: t(`muscle.${f.subject}`, { defaultValue: f.subject }), sets: f.measured, ceiling: f.limit });
      case 'trained_once':
        return t('builder.advice.trained_once', { muscle: t(`muscle.${f.subject}`, { defaultValue: f.subject }) });
      case 'push_pull':
        return t('builder.advice.push_pull');
      default:
        return null; // engine-shape rules (set_count etc.) are not her problem here
    }
  };

  /*
   * ⛔ THE ASK STANDS INSTEAD OF THE DOORS, not over them (founder 2026-08-29, choosing a full step
   * over the sheet). Returning is `onBack`, which puts the three doors back — she has changed her
   * mind about who writes the week, which is the question the doors ask.
   */
  if (asking && props.onLetHushBuild) {
    return (
      <AskTheCoach
        opensOn={DAYS_OPENS_ON}
        intake={!!props.intake}
        onBack={() => setAsking(false)}
        onAsk={(days, ask, minutes) => {
          setAsking(false);
          props.onLetHushBuild?.(days, ask, minutes);
        }}
      />
    );
  }

  if (props.offerDoors) {
    /* ════ THE PROVEN SHELVES (founder mandate 2026-08-26) ════
       Templates ride the builder's own algebra, so a card can honestly price itself before she
       commits — days and the longest day's clock, from `builderMinutes`, the same arithmetic the
       live builder runs. A Hevy template is a document; this one is a draft that opens ALREADY
       priced and advised, and the engine seeds her loads at the bar.

       ⚠️ THE SAME SHELF WALL SERVES BOTH CHROMES. In the intake it is the whole of the founder's
       second ask — *"או לקחת תוכנית נפוצה ועליה לבצע שינויים"* — and a second copy of it drawn for
       onboarding would be a second place for a shelf to go missing. */
    /*
     * ⛔ ELEVEN PEERS ARE NOT A SHELF, THEY ARE A PILE (design review 2026-09-01). The list mixed
     * training splits, equipment constraints and a goal emphasis in one flat run of eleven
     * three-line cards — eleven equal decisions where the athlete's first question ("what KIND of
     * answer am I choosing between?") was never asked. Three named shelves now, in the order the
     * questions are actually asked: how the week splits, what the room has, what to emphasise.
     * Display taxonomy only — the templates themselves are untouched.
     */
    const TPL_GROUPS: { key: string; ids: string[] }[] = [
      { key: 'groupSplit', ids: ['ppl', 'upper_lower', 'ppl_ul', 'bro_split', 'body_part_4', 'full_body'] },
      { key: 'groupEquipment', ids: ['machines', 'home_dumbbells', 'bodyweight'] },
      { key: 'groupGoal', ids: ['big_five', 'glutes_legs'] },
    ];
    const shelves = (
      <>
        <Legend size={17} track={0.14} style={styles.tplLegend}>{t('builder.templates.legend')}</Legend>
        {TPL_GROUPS.map((g) => (
          <React.Fragment key={g.key}>
            <Text style={styles.tplGroup}>{t(`builder.templates.${g.key}`)}</Text>
            {g.ids
              .map((id) => PLAN_TEMPLATES.find((x) => x.id === id))
              .filter((x): x is (typeof PLAN_TEMPLATES)[number] => !!x)
              .map((tpl) => {
          const preview = materializeTemplate(tpl, (k) => t(`builder.templates.dayNames.${k}`));
          const longest = Math.max(...preview.days.map((day) => builderMinutes(day)));
          return (
            <Pressable
              key={tpl.id}
              accessibilityRole="button"
              accessibilityLabel={t(`builder.templates.${tpl.id}.name`)}
              onPress={() => props.onStartTemplate(tpl.id)}
              style={({ pressed }) => [styles.tplCard, pressed && styles.tplCardPressed]}
            >
              <View style={styles.tplHead}>
                <Text style={styles.tplName}>{t(`builder.templates.${tpl.id}.name`)}</Text>
                <Legend size={17} track={0.06} style={styles.tplMeta}>
                  {t('builder.templates.meta', { days: tpl.days.length, min: longest })}
                </Legend>
              </View>
              <Text style={styles.tplTag}>{t(`builder.templates.${tpl.id}.tag`)}</Text>
            </Pressable>
          );
              })}
          </React.Fragment>
        ))}
        {/* Anything a future template forgets to file still shows — never a silently missing shelf. */}
        {PLAN_TEMPLATES.filter((tpl) => !TPL_GROUPS.some((g) => g.ids.includes(tpl.id))).map((tpl) => (
          <Pressable
            key={tpl.id}
            accessibilityRole="button"
            accessibilityLabel={t(`builder.templates.${tpl.id}.name`)}
            onPress={() => props.onStartTemplate(tpl.id)}
            style={({ pressed }) => [styles.tplCard, pressed && styles.tplCardPressed]}
          >
            <View style={styles.tplHead}>
              <Text style={styles.tplName}>{t(`builder.templates.${tpl.id}.name`)}</Text>
            </View>
            <Text style={styles.tplTag}>{t(`builder.templates.${tpl.id}.tag`)}</Text>
          </Pressable>
        ))}
      </>
    );

    /*
     * ════ THE INTAKE CHROME — step 3 of 3, and the question is who writes the week ════
     *
     * ⛔ THREE DOORS HERE, NOT TWO. "Start from the week I built" cannot be one of them: there is no
     * week yet, and there is no engine to have built one until she asks for it. What takes its place
     * is the ordinary path — *build a programme for me* — which leaves this screen forward rather
     * than seeding a draft, and which most athletes will press without thinking about it. That is
     * the point: the other two doors exist for the ones who WOULD think about it, and until today
     * they had to finish an intake and find a tab to reach them.
     *
     * ⚠️ AND IT SPEAKS IN THE FIRST PERSON, in both directions (founder 2026-08-29: *"אין דבר כזה
     * ש'הוש יבנה לי' — אנחנו לא מדברים בגוף שלישי"*). She asks the coach to build ("בנה תוכנית
     * עבורי"); she says what she will do herself ("אני אבנה מאפס"). The product never refers to
     * itself by name in a sentence she is meant to be speaking.
     */
    if (props.intake) {
      return (
        <OnboardingScaffold
          onBack={props.onExit}
          progress={{ index: 4, total: 5 }}
          /* The legend names the thing, the title asks the one question about it: HER WEEK — who
             writes it? A title that tried to carry both would be a sentence, and this step is a
             question with three answers standing under it. */
          legend={t('ob.weekLegend')}
          title={t('ob.weekTitle')}
          sub={t('ob.weekSub')}
          headGap={22}
          bodyTop={16}
        >
          {/*
            ⛔ THE DOOR WAITS ON THE SCREEN IT WAS PRESSED ON (founder 2026-08-29). The model writes
            her week now (`platform/coach/planBuild`) and it takes seconds, not the two minutes the
            2026-08-10 removal was about — but seconds with nothing said is how the import screen
            taught him a working feature was broken, twice on the same day. The label says what is
            happening and the doors underneath stand down rather than offering a second week.
          */}
          {/*
            ⛔ EACH DOOR SAYS WHAT IT IS NOW (founder 2026-08-29): *"למה צריך במסך השלישי את 'בנה
            תוכנית עבורי' אם שמת כבר אופציות מוכנות? זה לא בדיוק בניית התוכנית עבורו? ובנוסף — איפה
            האפשרות של בנייה עם ה-AI?"*

            Both halves of that are one fault, and it is mine: the model had ALREADY been wired
            behind this button, and nothing on the screen said so — so it read as a third way of
            being handed a pre-made week, indistinguishable from the shelf below it. A feature
            nobody can see is a feature that does not exist; that is the same lesson the import
            screen taught him earlier the same day.

            The shelves carry a `tag` line each, which is exactly what these two lacked. So they
            carry one too, and the distinction is stated rather than implied: **a shelf is a week
            that was right for somebody; this one is written now, for her, from what she asks for**
            — and the field that makes that true is the step behind this button (`AskTheCoach`).
          */}
          <View style={styles.door}>
            <Button
              block
              label={props.buildBusy ? t('ob.weekEngineBusy') : t('ob.weekEngine')}
              onPress={() => setAsking(true)}
              disabled={props.buildBusy}
            />
            <Text style={styles.doorTag}>{t('ob.weekEngineTag')}</Text>
          </View>
          <View style={styles.door}>
            <Button block variant="ghost" label={t('ob.weekBlank')} onPress={props.onStartBlank} disabled={props.buildBusy} />
            <Text style={styles.doorTag}>{t('ob.weekBlankTag')}</Text>
          </View>
          {shelves}
        </OnboardingScaffold>
      );
    }

    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.doorsWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={props.onExit} hitSlop={12} style={styles.back}>
            <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
          </Pressable>
          {/* ✦ IT ARRIVES (2026-08-27) — see the note at `HomeView`. Two beats: what this screen
              offers to do, then the doors. The two doors land together — they are one question with
              two answers, and letting one arrive first would recommend it. */}
          <Arrive order={0}>
            <Text style={styles.title}>{t('builder.title')}</Text>
            <Text style={styles.doorsBody}>{t('builder.doorsBody')}</Text>
          </Arrive>
          <Arrive order={1}>
            {/*
              ⛔ THE SAME DOOR THE INTAKE HAS (2026-08-29). An athlete who asked the model for her
              first week and then wants a NEW one had to write it by hand or take a shelf — the one
              path the founder called *"הכי כיף וקצר וקולע"* stopped existing the moment onboarding
              ended. Drawn only when the container can answer for her, which outside the intake
              means a stored profile; `onLetHushBuild` is absent otherwise and this is not a door
              onto nothing.
            */}
            {props.onLetHushBuild ? (
              <Button
                block
                label={props.buildBusy ? t('ob.weekEngineBusy') : t('ob.weekEngine')}
                onPress={() => setAsking(true)}
                disabled={props.buildBusy}
                style={styles.doorBtn}
              />
            ) : null}
            {/* ⛔ ONE PRIMARY (design review 2026-09-01). Two identical cream slabs meant the screen's
                heaviest decision had no recommended answer. The engine path is the product's own
                door ("הכי כיף וקצר וקולע") and keeps the cream; the draft is the outlined second;
                the blank page stays the quiet third. Three doors, three weights. */}
            <Button block variant={props.onLetHushBuild ? 'secondary' : 'primary'} label={t('builder.fromEngine')} onPress={props.onStartFromEngine} disabled={props.buildBusy} style={styles.doorBtn} />
            <Button block variant="ghost" label={t('builder.fromBlank')} onPress={props.onStartBlank} disabled={props.buildBusy} style={styles.doorBtn} />
          </Arrive>

          {shelves}
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (!d) return <SafeAreaView style={styles.screen} edges={['top']} />;

  /** What `sealAuthored` will accept: at least one training day holding at least one lift. */
  const sealable = d.days.some((day) => !day.isRest && day.slots.length > 0);

  /* The superset line is taught at the first seam in the week, and only while she has no couple —
     see the note at the seam itself for why it is one line in one place rather than every gap. */
  const anyPaired = d.days.some((day) => day.slots.some((sl) => sl.pairedWithNext));
  const firstSeamDay = d.days.findIndex((day) => day.slots.length > 1);

  // A coach never says the same sentence six times. When three or more muscles share a finding,
  // the strip says it ONCE, naming them all — the grouped line takes the first finding's seat.
  const GROUP_AT = 3;
  const adviceLines: string[] = [];
  const groupedRules = new Set<WeekFinding['rule']>();
  for (const f of props.advice) {
    if (f.rule === 'under_dose' || f.rule === 'trained_once') {
      const peers = props.advice.filter((g) => g.rule === f.rule);
      if (peers.length >= GROUP_AT) {
        if (!groupedRules.has(f.rule)) {
          groupedRules.add(f.rule);
          const muscles = peers.map((g) => t(`muscle.${g.subject}`, { defaultValue: g.subject })).join(' · ');
          adviceLines.push(
            f.rule === 'under_dose'
              ? t('builder.advice.under_dose_grouped', { muscles, floor: f.limit })
              : t('builder.advice.trained_once_grouped', { muscles }),
          );
        }
        continue;
      }
    }
    const line = adviceLine(f);
    if (line) adviceLines.push(line);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={props.onExit} hitSlop={12} style={styles.back}>
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title}>{t('builder.title')}</Text>
        <Text style={styles.subtitle}>{t('builder.subtitle')}</Text>

        {d.days.map((day: ProgramDay, di: number) => (
          <View key={day.id + di} style={styles.dayCard}>
            <View style={styles.dayHead}>
              <TextInput
                style={styles.dayName}
                value={day.name}
                onChangeText={(name) => props.onDraft(renameDay(d, di, name))}
                accessibilityLabel={t('builder.dayName')}
                maxLength={24}
              />
              {/* The hybrid chips: a day she touched is HERS and frozen to the engine; an untouched
                  one stays Hush's and keeps adapting. The diff is live — undo her edit by hand and
                  the day walks back to Hush on its own. */}
              <View style={styles.dayHeadFacts}>
                {/* ⚠️ NO CHIP IN THE INTAKE. It answers "whose day is this, mine or the engine's",
                    and before there is an account every day is hers by construction — a row of
                    chips all saying the same word is a label, not information. The CLOCK stays:
                    it is the one thing the steward can tell her about a day she just wrote. */}
                {props.intake ? null : (
                  <View style={[styles.ownChip, props.ownedIds.has(day.id) && styles.ownChipHers]}>
                    <Text style={[styles.ownChipText, props.ownedIds.has(day.id) && styles.ownChipTextHers]}>
                      {props.ownedIds.has(day.id) ? t('builder.dayYours') : t('builder.dayEngine')}
                    </Text>
                  </View>
                )}
                <Legend size={17} track={0.06}>{t('builder.minutes', { min: builderMinutes(day) })}</Legend>
              </View>
            </View>

            {day.slots.map((s, si) => (
              <React.Fragment key={s.exerciseId}>
                <LiftRow
                  dayIdx={di}
                  slotIdx={si}
                  exerciseId={s.exerciseId}
                  sets={s.setCount}
                  figure={props.figure}
                  onDemo={() => setDemoFor(s.exerciseId)}
                  expanded={setsFor === `${di}:${si}`}
                  onToggleSets={() => setSetsFor(setsFor === `${di}:${si}` ? null : `${di}:${si}`)}
                  onSets={(n) => { props.onDraft(setLiftSets(d, di, si, n)); setSetsFor(null); }}
                  onMove={(dir) => props.onDraft(moveLift(d, di, si, si + dir))}
                  onRemove={() => props.onDraft(removeLift(d, di, si))}
                  onSwap={() => setSwapFor({ day: di, slot: si })}
                  isFirst={si === 0}
                  isLast={si === day.slots.length - 1}
                />
                {/* ════ THE SEAM IS THE SUPERSET'S DOOR (2026-08-26) ════
                    Between two adjacent lifts sits the one decision that belongs to the seam
                    itself: run them as one alternating block. The link toggles it; paired, the
                    seam says so out loud and the two rows read as a couple. Hidden where a pair
                    is not in the vocabulary (last row, or a neighbour already claimed). */}
                {si < day.slots.length - 1 &&
                (s.pairedWithNext || (!(si > 0 && day.slots[si - 1].pairedWithNext) && !day.slots[si + 1].pairedWithNext)) ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: s.pairedWithNext === true }}
                      accessibilityLabel={t(s.pairedWithNext ? 'builder.unpair' : 'builder.pair')}
                      hitSlop={8}
                      onPress={() => props.onDraft(togglePair(d, di, si))}
                      style={[styles.pairSeam, s.pairedWithNext && styles.pairSeamOn]}
                    >
                      <Icon name="link" size={15} color={s.pairedWithNext ? color.accent : color.textMuted} strokeWidth={1.7} />
                      {/*
                        ⛔ THE DOOR NOW SAYS ITS OWN NAME BEFORE SHE OPENS IT (founder, 2026-08-31:
                        *"יש שם אפשרות של סופר סט בכפתור מוזר ולא ברור. מה זה אומר בכלל?"*).

                        It was a 15-point link glyph in `textMuted`, no frame, no word — and the word
                        "סופרסט" appeared only AFTER she pressed. So the only way to learn what the
                        control did was to use it, and between two rows of a card it reads as a
                        divider. `accessibilityLabel` said the whole sentence and always has: a
                        control legible to VoiceOver and illegible to the eye.
                      */}
                      <Legend size={17} track={0.12} style={s.pairedWithNext ? styles.pairWord : styles.pairWordOff}>
                        {t(s.pairedWithNext ? 'builder.superset' : 'builder.pairDo')}
                      </Legend>
                    </Pressable>
                    {/*
                      ⚠️ AND WHAT A SUPERSET IS, ONCE, AT THE FIRST SEAM SHE MEETS — then never again.
                      A line under every gap is noise on the fourth reading; a line nowhere is the
                      state we were in. It leaves the moment the week holds a couple, because at that
                      point she has done it and the sentence has nothing left to teach.
                    */}
                    {si === 0 && di === firstSeamDay && !anyPaired ? (
                      <Text style={styles.pairHint}>{t('builder.pairHint')}</Text>
                    ) : null}
                  </>
                ) : null}
              </React.Fragment>
            ))}

            <View style={styles.dayActions}>
              <Button variant="ghost" label={t('builder.addLift')} onPress={() => setAddFor(di)} />
              {day.slots.length >= 2 ? (
                <Button variant="ghost" label={t('builder.stationOrder')} onPress={() => props.onDraft(reorderDayForStations(d, di))} />
              ) : null}
              {d.days.length > 1 ? (
                <Button variant="ghost" label={t('builder.removeDay')} onPress={() => props.onDraft(removeDay(d, di))} />
              ) : null}
            </View>
          </View>
        ))}

        {/* ⚠️ NAMED IN HER LANGUAGE AT BIRTH — see `blankDay`. Storage holds the plain name she can
            retype, so the only moment the app may localise it is this one. */}
        <Button block variant="ghost" label={t('builder.addDay')} onPress={() => props.onDraft(addDay(d, (letter) => t('builder.dayNamed', { letter })))} style={styles.addDay} />

        {adviceLines.length > 0 ? (
          <View style={styles.advice}>
            <Legend size={17} track={0.12} style={styles.adviceLegend}>{t('builder.adviceTitle')}</Legend>
            {adviceLines.map((line, i) => (
              <Text key={i} style={styles.adviceLine}>{line}</Text>
            ))}
            <Text style={styles.adviceNote}>{t('builder.adviceNote')}</Text>
          </View>
        ) : null}

        {/* ⚠️ NOT IN THE INTAKE. `requestPlanReview` reads her profile off disk and answers
            `not_configured` when there is none — and there is none until `ProgramCreated` writes it.
            The button could only ever have shown her a failure. It is one tap away on the Program
            tab from her first minute in the app. */}
        {props.intake ? null : (
          <Button
            block
            variant="ghost"
            label={props.aiBusy ? t('builder.aiBusy') : t('builder.aiReview')}
            onPress={props.onAiReview}
            disabled={props.aiBusy}
            style={styles.aiBtn}
          />
        )}

        {!props.savedIsAuthored && props.ownedIds.size > 0 && props.ownedIds.size < d.days.length ? (
          <Text style={styles.hybridNote}>{t('builder.hybridNote')}</Text>
        ) : null}

        {/*
          ⛔ AN EMPTY WEEK CANNOT BE SAVED, AND THE BUTTON NOW SAYS SO (2026-08-29).

          `sealAuthored` returns `null` when no day holds a lift, and `onSave` returns on that null —
          so the press did NOTHING, silently, with no line anywhere to say why. That is survivable on
          the Program tab, where she already has a week; in the intake it is a dead end on the last
          step, which onboarding may never have. Same guard as the body map's S-3, and for the same
          reason: an unbuildable answer never leaves the screen, and the screen says what is missing.
        */}
        <Button block label={t(props.intake ? 'ob.weekMine' : 'builder.save')} onPress={props.onSave} disabled={!sealable} style={styles.saveBtn} />
        {sealable ? null : <Text style={styles.emptyNote}>{t('builder.needsALift')}</Text>}

        {props.savedIsAuthored ? (
          confirmRevert ? (
            <View style={styles.revertConfirm}>
              <Text style={styles.revertBody}>{t('builder.revertBody')}</Text>
              <Button block variant="ghost" label={t('builder.revertYes')} onPress={props.onRevert} />
              <Button block variant="ghost" label={t('common.cancel')} onPress={() => setConfirmRevert(false)} />
            </View>
          ) : (
            <Button block variant="ghost" label={t('builder.revert')} onPress={() => setConfirmRevert(true)} style={styles.revertBtn} />
          )
        ) : null}
      </ScrollView>

      {addFor != null && d.days[addFor] ? (
        <AddLiftSheet
          figure={props.figure}
          taken={new Set(d.days[addFor].slots.map((s) => s.exerciseId))}
          onPick={(id) => { props.onDraft(addLift(d, addFor, id)); setAddFor(null); }}
          onClose={() => setAddFor(null)}
        />
      ) : null}

      {demoFor ? (
        <ExerciseDemo
          title={exerciseDisplayName(demoFor)}
          cues={exerciseCues(demoFor)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.tapAnywhere')}
          exerciseId={demoFor}
          onDone={() => setDemoFor(null)}
        />
      ) : null}

      {props.reviewOpen ? (
        <PlanReviewSheet draft={d} onDraft={props.onDraft} onClose={props.onReviewClose} />
      ) : null}

      {swapFor && d.days[swapFor.day]?.slots[swapFor.slot] ? (
        <SwapSheet
          currentName={exerciseDisplayName(d.days[swapFor.day].slots[swapFor.slot].exerciseId)}
          choices={swapChoices(d.days[swapFor.day].slots[swapFor.slot].exerciseId, {
            sessionExerciseIds: d.days[swapFor.day].slots.map((s) => s.exerciseId),
          })}
          onPick={(toId) => { props.onDraft(replaceLift(d, swapFor.day, swapFor.slot, toId)); setSwapFor(null); }}
          onClose={() => setSwapFor(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────────── the container */

/*
 * ⚠️ STRUCTURALLY TYPED, LIKE `ImportPlan` — and for the same reason: this screen is registered on
 * BOTH navigators (2026-08-29), and the two param lists disagree about what it is handed. Pinning it
 * to `MainParamList` would make the intake's `{ inputs }` a type error at the one call site that
 * needs it.
 */
type Props = {
  navigation: Pick<NativeStackScreenProps<MainParamList, 'PlanBuilder'>['navigation'], 'goBack'> & {
    /* ⚠️ NOT OPTIONAL, AND NEVER CALLED OPTIONALLY. Both navigators hand one over — and
       `everythingBuiltCanBeReached` walks the source for `replace('X'`, so an optional CALL
       (`replace?.(`) is invisible to it and would leave `BuildingProgramme` reading as a registered
       route that nothing in the app opens. */
    replace: (name: string, params?: unknown) => void;
  };
  route?: { params?: { inputs?: OnboardingInputs } };
};

export function PlanBuilder({ navigation, route }: Props) {
  const app = useApp();
  const { t } = useCopy();
  const [saved, setSaved] = useState<Program | null>(null);
  const [draft, setDraft] = useState<Program | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [aiBusy] = useState(false); // the review runs through PlanReviewSheet (see onAiReview)
  /* The model writing her week — the engine door's own wait. See `onLetHushBuild`. */
  const [buildBusy, setBuildBusy] = useState(false);
  /*
   * ⛔ THE RELAY IS WHAT SAYS WHICH SCREEN THIS IS. Present ⇒ she is inside the intake and the whole
   * of her onboarding rides on this screen finishing; absent ⇒ she opened the builder from the
   * Program tab, where the way out is `goBack`. Nothing else distinguishes the two.
   */
  const inputs = route?.params?.inputs;
  const intake = inputs != null;
  /* ⛔ FUNNEL (2026-08-23): one event per intake step REACHED — see `FUNNEL_EVENTS`. The step where
     she says who writes the week. Silent on the Program tab: that is not a funnel step. */
  useEffect(() => {
    if (!intake) return;
    void track(FUNNEL_EVENTS.yourWeekReached);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * ⛔ THIS READ RUNS ONCE, AND THE GUARD IS NOT DECORATION (2026-08-30).
   *
   * The screen renders NOTHING until `loaded` — `if (!loaded) return <SafeAreaView/>`, a black
   * rectangle. So every path out of this effect that fails to set it is a blank screen in the
   * middle of the intake, on the step the whole of onboarding rides on.
   *
   * I widened the dependency list to `[intake, inputs, navigation]` earlier today and that is
   * exactly how this hangs: any re-render that changes one of those identities re-runs the effect,
   * the cleanup sets `alive = false`, the in-flight read resolves into a no-op, and a new read
   * starts. Re-render faster than the disk answers and `loaded` never becomes true — a black
   * screen that never moves, with nothing on it to report.
   *
   * A ref, not a dependency list. This is a one-shot read of the disk on mount; there is no input
   * whose change should make it happen twice.
   */
  const readOnce = useRef(false);
  useEffect(() => {
    if (readOnce.current) return;
    readOnce.current = true;
    let alive = true;
    /*
     * ⚠️ A WEEK SHE BROUGHT IS NOT THE BUILDER'S TO OPEN AS A DRAFT — it is met by
     * `BuildingProgramme`, whole, the way she brought it. That much has always been true here.
     *
     * ⛔ WHAT WAS MISSING IS THAT THE DOORS STILL OPENED OVER IT (found 2026-08-30). This branch
     * read *"there is nothing on disk to read"* and returned, so the intake ALWAYS drew the three
     * doors — and since 2026-08-30 she can adopt a photographed week at the fork, before answering
     * a single question. She would then arrive here and be offered three ways to write a week she
     * already had: the blank sheet and the shelf overwrite it (`saveBuiltProgram` is deliberately
     * ungated), and the engine door reveals one she will never train, because `completeOnboarding`
     * reads the AUTHORED week off disk and keeps it.
     *
     * So the disk is read in the intake too, and an authored week goes straight to the beat that
     * was always meant to meet it. The doors are for an athlete who has no week — which is what
     * the old comment assumed and stopped being true.
     */
    if (intake) {
      /*
       * ⚠️ AND THE DOORS APPEAR EVEN IF THE DISK NEVER ANSWERS. `loadProgram` resolving is not
       * something this screen can promise — a cold database, a migration, a device under load —
       * and the cost of it not resolving is a black screen she cannot leave. Two seconds is far
       * longer than the read has ever taken and far shorter than "stuck".
       *
       * ⛔ THE FALLBACK IS THE DOORS, NEVER A DECISION. If the read is late we show her the three
       * ways to write a week; we do not guess that she has one and send her to the reveal. Being
       * offered a choice she did not need is a moment's confusion — being sent to a reveal for a
       * week that may not exist is the intake ending on a screen with no way back.
       */
      const late = setTimeout(() => { if (alive) setLoaded(true); }, 2000);
      void db.loadProgram()
        .then((p) => {
          if (!alive) return;
          clearTimeout(late);
          if (p && (p.authored ?? 'engine') === 'athlete_or_coach' && inputs) {
            navigation.replace('BuildingProgramme', {
              inputs: { ...inputs, daysPerWeek: p.days.filter((d) => !d.isRest).length },
              authored: true,
            });
            return;
          }
          setLoaded(true);
        })
        .catch(() => { clearTimeout(late); setLoaded(true); });
      return () => { alive = false; clearTimeout(late); };
    }
    void db.loadProgram().then((p) => {
      if (!alive) return;
      setSaved(p ?? null);
      // A week SHE already owns opens straight into editing — the doors are for taking over.
      if ((p?.authored ?? 'engine') === 'athlete_or_coach') setDraft(draftFromProgram(p as Program));
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advice = useMemo(
    () => (draft ? builderAdvice(draft, { bodyMap: app.profile?.bodyMap }) : []),
    [draft, app.profile?.bodyMap],
  );
  // Live ownership: which draft days currently read as HERS against the saved week (the chips).
  const owned = useMemo(() => (draft ? ownedDayIds(draft, saved) : new Set<string>()), [draft, saved]);

  const onSave = useCallback(() => {
    if (!draft) return;
    // The diff-seal (founder: "יום שנגעה בו — שלה; יום שלא — שלו"): untouched engine days stay the
    // engine's and keep adapting; touched days are stamped hers; touching everything (or removing
    // an engine day) hands her the whole week.
    const sealed = sealSmart(draft, saved);
    if (!sealed) return;
    /*
     * ════ THE INTAKE'S OWN ENDING (2026-08-29) ════
     *
     * She is not going "back" anywhere — no profile has been written and the app is still inside the
     * onboarding navigator, so `goBack` would strand her on the health step with a programme already
     * on disk and no way to finish. She goes FORWARD, along exactly the road the import already
     * takes: the week is saved, and `completeOnboarding` (which `ProgramCreated`'s CTA calls) reads
     * it off disk and builds NOTHING over the top of it — `engineMayRebuild` refuses a week stamped
     * `authored: 'athlete_or_coach'`, which is what `sealAuthored` just stamped.
     *
     * ⛔ AND SHE GETS THE REVEAL (founder 2026-08-29: *"אנו לא צריכים לוותר על החלק של האנימציה
     * בסוף"*). `BuildingProgramme` is handed `authored`, so it reads her sealed week instead of
     * generating one and runs the identical theatre over it: the dark body, her own muscles arriving
     * one at a time carrying the lifts SHE picked, then the week named over a lit figure.
     *
     * ⚠️ `daysPerWeek` IS RE-STAMPED FROM THE WEEK SHE ACTUALLY WROTE. She answered a number on step
     * one and then wrote a week; the week is the later answer and the truer one, and `profile`,
     * `firstBucketOpen` and every milestone ladder are cut from it.
     *
     * ⚠️ AND ANY PENDING IMPORT IS DROPPED. If she photographed a sheet at the fork and then wrote
     * her own week anyway, the read is still running underneath — and `BuildingProgramme` meets it,
     * which would hand her programme over to a photograph she has visibly abandoned. Her last act
     * wins; the sheet is let go.
     */
    if (intake && inputs) {
      clearImport();
      void app.saveBuiltProgram(sealed).then(() => {
        navigation.replace('BuildingProgramme', {
          inputs: { ...inputs, daysPerWeek: sealed.days.filter((day) => !day.isRest).length },
          authored: true,
        });
      });
      return;
    }
    void app.saveBuiltProgram(sealed).then(() => navigation.goBack());
  }, [draft, saved, app, navigation, intake, inputs]);

  const onRevert = useCallback(() => {
    void app.revertProgramToEngine().then((ok) => { if (ok) navigation.goBack(); });
  }, [app, navigation]);

  /** Her language, at the moment a day is made — never at render (see `blankDay`). */
  const dayNamer = useCallback((letter: string) => t('builder.dayNamed', { letter }), [t]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const onAiReview = useCallback(() => {
    if (draft) setReviewOpen(true);
  }, [draft]);

  /** Whoever can answer for her: the relay inside the intake, the stored profile outside it. */
  const canBuildForHer = !!(inputs || app.profile);
  const letTheModelBuild = useCallback(
    (daysPerWeek: number, ask: string, minutes?: number) => {
      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ THE WAIT BELONGS TO `BuildingProgramme`, NOT TO THIS BUTTON (founder 2026-08-29).
       *
       * My first cut ran the call here and left her on the doors with a disabled button reading
       * "בונה לך תוכנית..." for seven seconds. That is the import screen's mistake in a second
       * place on the same day: the most interesting thing the product does, happening behind a
       * greyed-out control.
       *
       * `BuildingProgrammeView` was COMPOSED for this call — its own docblock says the rows stand
       * as dashes *"until the coach's answer lands"* — and has had nothing to wait for since the
       * call was removed in August. Handing it the ask gives the screen its subject back.
       *
       * ⚠️ WHO SHE IS COMES FROM WHICHEVER OF THE TWO KNOWS: the RELAY inside the intake (there is
       * no profile until `ProgramCreated` writes one) and the PROFILE outside it. The door is not
       * drawn at all when neither can answer — see `canBuildForHer`.
       *
       * ⚠️ AND HER ANSWER IS STAMPED, NOT A FALLBACK. `inputs.daysPerWeek` arrives 0 from
       * `ConnectHealth` — "nobody has asked her" — and the ask step is the ask.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      const her = inputs ?? app.profile;
      if (!her) return;
      if (intake) void track(FUNNEL_EVENTS.weekDoorChosen, { door: 'engine' });

      if (intake && inputs) {
        navigation.replace('BuildingProgramme', {
          // Her session length rides the relay too now — answered, not defaulted (see AskTheCoach).
          inputs: { ...inputs, daysPerWeek, ...(minutes ? { workoutMinutes: minutes } : {}) },
          /* ⚠️ ALWAYS PASSED, EVEN EMPTY — its PRESENCE is what says the model writes this week.
             She may press straight through without a line, and that is still the coach path. */
          coachAsk: ask.trim(),
        });
        return;
      }

      /*
       * ⛔ OFF THE PROGRAM TAB THERE IS NO REVEAL TO SEND HER TO, and inventing one would be the
       * intake's payoff beat played to somebody who already has a week. So the call runs here, the
       * door says it is working (`buildBusy`), and the answer lands straight in the editor — which
       * is where she was going anyway, because she came to CHANGE something.
       */
      setBuildBusy(true);
      const assembleLocally = () => {
        setBuildBusy(false);
        if (!app.profile) return;
        void app.model
          .generateProgram({ ...app.profile, daysPerWeek })
          .then((program) => setDraft(draftFromProgram(program)))
          .catch(() => setDraft(blankDraft(`built_${Date.now()}`, dayNamer)));
      };
      void requestPlanBuild({
        daysPerWeek,
        sex: her.sex === 'female' ? 'female' : 'male',
        ...(her.weightKg != null ? { weightKg: her.weightKg } : {}),
        ...(ask.trim() ? { ask: ask.trim() } : {}),
      })
        .then((res) => {
          if (!res.ok) return assembleLocally();
          const drafted = draftFromCoachWeek(res.week, {
            id: `built_ai_${Date.now()}`,
            dayNamer: (i) => dayNamer(String.fromCharCode(65 + i)),
          });
          if (!drafted) return assembleLocally();
          setBuildBusy(false);
          setDraft(drafted);
        })
        .catch(() => assembleLocally());
    },
    [inputs, app, intake, navigation, dayNamer],
  );

  if (!loaded) return <SafeAreaView style={styles.screen} edges={['top']} />;

  return (
    <PlanBuilderView
      draft={draft}
      intake={intake}
      /*
       * ⛔ THE WAY BACK IS ONE STEP IN THE INTAKE, AND THE WHOLE SCREEN OUTSIDE IT.
       *
       * In the intake the step IS the question "who writes the week", so a back arrow from the
       * editor un-answers it and returns to the doors — she came from them, always.
       *
       * ⚠️ AND ON THE PROGRAM TAB IT MUST NOT. A week she already owns opens STRAIGHT into the
       * editor (see the load effect), so stepping "back" to the doors would strand her on a screen
       * she never saw, offering to start a draft she is already holding. Out is out.
       */
      onExit={() => (intake && draft ? setDraft(null) : navigation.goBack())}
      offerDoors={draft == null}
      savedIsAuthored={(saved?.authored ?? 'engine') === 'athlete_or_coach'}
      advice={advice}
      onStartFromEngine={() => setDraft(saved ? draftFromProgram(saved) : blankDraft(`built_${Date.now()}`, dayNamer))}
      onStartBlank={() => {
        if (intake) void track(FUNNEL_EVENTS.weekDoorChosen, { door: 'blank' });
        setDraft(blankDraft(`built_${Date.now()}`, dayNamer));
      }}
      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ THE MODEL WRITES HER WEEK AGAIN, AND SHE GETS IT AS A DRAFT (founder 2026-08-29).
       *
       * *"לבנות עם הבינה זה הכי כיף וקצר וקולע. ואז על זה מלבישים שינויים במידה ורוצים כמו שאנחנו
       * עורכים במסך בניית האימון."*
       *
       * Both halves of that sentence are wired here. The model answers with days, lifts and set
       * counts (`platform/coach/planBuild`); `draftFromCoachWeek` replays them through the
       * builder's own verbs, so what she lands on is a DRAFT in the editor she is already standing
       * in — every row swappable, every set count adjustable, the clock and the advice live — and
       * her SAVE is what seals it. Nothing the model said reaches disk unread.
       *
       * ── ⚠️ AND THE FALLBACK IS THE OLD DOOR, UNCHANGED ────────────────────────────────────────
       * Unreachable, unparseable, or a week with nothing usable in it → `BuildingProgramme` with
       * the local assembler, which is exactly what this door did on its own from 2026-08-10 until
       * today. That is why bringing the call back is safe in a way it was not before: the failure
       * path is a finished, tested product rather than an error screen. She gets a week either way,
       * and the only thing a bad call costs is the few seconds it took.
       *
       * ⚠️ NO `catch` SWALLOWS A REAL DEFECT SILENTLY: `requestPlanBuild` never throws (every
       * failure is a reason), so the `catch` here is for the impossible case, and it takes the same
       * fallback rather than leaving her on a door that did nothing.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      buildBusy={buildBusy}
      /*
       * ⚠️ THE PROP IS ABSENT WHEN NOBODY CAN ANSWER FOR HER, and it is spread rather than passed
       * so that "absent" is genuinely absent: a later `onLetHushBuild={undefined}` would be
       * overridden by nothing, but an explicit prop listed after a spread wins — which is how a
       * guard like this silently does nothing. The view draws no door without it.
       */
      {...(canBuildForHer ? { onLetHushBuild: letTheModelBuild } : {})}
      onStartTemplate={(id) => {
        const tpl = templateById(id);
        if (!tpl) return;
        if (intake) void track(FUNNEL_EVENTS.weekDoorChosen, { door: 'template' });
        setDraft(materializeTemplate(tpl, (k) => t(`builder.templates.dayNames.${k}`)));
      }}
      ownedIds={owned}
      /*
       * ⚠️ HER FIGURE, FROM WHEREVER IT IS KNOWN. In the intake there is no profile yet — every
       * demonstration in the builder would have been the male athlete, for everyone, on the one
       * screen where she is choosing lifts by looking at them. The relay has carried `sex` since
       * `AboutYou`; it is asked first, and the stored profile answers everywhere else.
       */
      figure={(inputs?.sex ?? app.profile?.sex) === 'female' ? 'female' : 'male'}
      onDraft={setDraft}
      onSave={onSave}
      onRevert={onRevert}
      onAiReview={onAiReview}
      aiBusy={aiBusy}
      reviewOpen={reviewOpen}
      onReviewClose={() => setReviewOpen(false)}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────── styles */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  wrap: { padding: 20, paddingBottom: 48, gap: 14 },
  doorsWrap: { padding: 20, gap: 14 },
  /* The scaffold's own back: the bare 22px chevron at the gutter, tap target bought with hitSlop. */
  back: { alignSelf: 'flex-start', marginBottom: 10 },
  title: { fontFamily: font.serif, fontSize: 28, lineHeight: 34, color: color.textPrimary, textAlign: 'left' },
  subtitle: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  doorsBody: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, marginBottom: 6, textAlign: 'left' },
  doorBtn: { marginTop: 4 },
  /* ── the superset seam between two adjacent lift rows ── */
  /* A frame, so the seam reads as a CONTROL rather than as the rule between two rows. Quiet enough
     to stay under the lifts it sits between — this is the smallest decision on the card. */
  pairSeam: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'center',
    minWidth: 44,
    minHeight: 28,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.full,
    backgroundColor: color.surface2,
  },
  pairSeamOn: { borderColor: color.accent, backgroundColor: color.surface },
  pairWord: { color: color.accent },
  pairWordOff: { color: color.textMuted },
  pairHint: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'left', marginTop: 6 },
  /* ── the proven shelves (template cards on the doors screen) ── */
  tplLegend: { marginTop: 18, marginBottom: 2 },
  tplGroup: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textSecondary, marginTop: 18, marginBottom: 2, textAlign: 'left' },
  tplCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  tplCardPressed: { backgroundColor: color.surface2 },
  tplHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  tplName: { fontFamily: font.sansSemibold, fontSize: 18, color: color.textPrimary, flexShrink: 1, textAlign: 'left' },
  tplMeta: { flexShrink: 0 },
  tplTag: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },

  dayCard: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: 14, gap: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dayHeadFacts: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  dayName: { flex: 1, fontFamily: font.sansSemibold, fontSize: 19, color: color.textPrimary, paddingVertical: 4, textAlign: 'left' },

  liftBlock: { borderTopWidth: 1, borderTopColor: color.border },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  liftThumb: { borderRadius: radius.md, backgroundColor: color.surface2, overflow: 'hidden' },
  liftText: { flex: 1, gap: 2 },
  liftName: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  setsChip: { flexShrink: 0, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2 },
  setsFigure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  liftActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  /* ⌃ over ⌄ — one control, two directions. See the note at the markup. `-2` of vertical margin
     each side keeps the pair inside the row's own height rather than growing it. */
  reorder: { alignItems: 'center', marginVertical: -2 },
  /* The air that separates the destructive control from the reversible ones. */
  removeGap: { marginStart: 6 },

  setsStrip: { flexDirection: 'row', gap: 6, paddingBottom: 10 },
  setsCell: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: color.border },
  setsCellOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  setsCellText: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textSecondary, textAlign: 'center' },
  setsCellTextOn: { color: color.bg },

  dayActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 8 },
  addDay: { marginTop: 2 },

  advice: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 14, gap: 8 },
  adviceLegend: { color: color.textMuted },
  adviceLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  adviceNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textTertiary, textAlign: 'left' },

  aiBtn: { marginTop: 2 },
  saveBtn: { marginTop: 2 },
  /* The refusal sits UNDER the control it refuses, in the muted tone — a reason, never a scolding. */
  emptyNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textTertiary, textAlign: 'left' },
  revertBtn: { marginTop: 2 },
  revertConfirm: { gap: 8, backgroundColor: color.surface, borderRadius: radius.lg, padding: 14 },
  /*
   * ⛔ "YOURS" IS A STATEMENT, NOT A BUTTON (2026-08-26, the elevation pass).
   *
   * `ownChipHers` filled the capsule with `textPrimary` — CREAM — and put the stage's ink on it.
   * That is `Button variant="primary"`, exactly: the app's one PRIMARY ACTION colour, on a badge
   * that does nothing, in the header of a card full of real controls. The same costume the free
   * stamp on `1.5` was wearing, and it matters more here because a mis-tap on this screen is a mis-
   * tap among seven live affordances.
   *
   * ⚠️ IT STILL HAS TO WIN AGAINST ITS SIBLING. "Yours" and "mine" are the two states of one chip
   * and the difference has to be obvious at a glance — so hers keeps the cream, in the RIM and the
   * WORD rather than the ground. An outline in the light against an outline in shadow: the app's own
   * emphasis rule, distance from the ground, never a second hue.
   */
  ownChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: color.border },
  ownChipHers: { borderColor: color.textPrimary },
  ownChipText: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'center' },
  ownChipTextHers: { color: color.textPrimary },
  hybridNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textTertiary, textAlign: 'left' },
  revertBody: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },

  sheetLegend: { marginBottom: 10 },
  /* ════ the ask step (2026-08-29) ════
     The two questions breathe: this is the one screen where she talks to the model, and a wheel and
     a written line crammed together is the sheet it replaced. */
  askRows: { gap: 26 },
  askCol: { gap: 12 },
  /* The same full-ink 22 the intake's own wheel legends carry (`AboutYou`) — one legend voice over
     an instrument, across every screen that has one. */
  askLegend: { color: color.textPrimary },
  /* Says the line may be left empty. Quiet, and below the field rather than inside it: a
     placeholder that says "optional" is a placeholder spending its one line on permission. */
  askOptional: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  askAct: { marginTop: 8 },
  flex: { flex: 1 },

  /* A door and the line that says what it is — the same pairing the shelf cards already use, so
     the three options on this step read as peers rather than as one act and two footnotes. */
  door: { marginBottom: 18 },
  doorTag: { marginTop: 8, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  /* The wheel breathes: it is the only thing on this sheet, and it is an instrument, not a row. */
  daysWell: { marginBottom: 18 },
  searchWell: { borderWidth: 1, borderColor: color.border, borderRadius: radius.md, backgroundColor: color.surface2, marginBottom: 10 },
  searchInput: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, paddingHorizontal: 12, paddingVertical: 10, textAlign: 'left' },
  chipsRow: { marginBottom: 10, flexGrow: 0 },
  chipsContent: { gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: color.border },
  chipOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  chipText: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'center' },
  chipTextOn: { color: color.bg },
  sheetList: { maxHeight: 380 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: color.border },
  pickRowPressed: { backgroundColor: color.surface2 },
  pickRowTaken: { opacity: 0.4 },
  pickThumb: { borderRadius: radius.md, backgroundColor: color.surface2, overflow: 'hidden' },
  pickText: { flex: 1, gap: 2 },
  pickName: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  noMatch: { fontFamily: font.sans, fontSize: 17, color: color.textTertiary, paddingVertical: 16, textAlign: 'center' },

  reviewBody: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, paddingVertical: 12, textAlign: 'left' },
  reviewSay: { fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: color.textPrimary, marginBottom: 12, textAlign: 'left' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: color.border, paddingVertical: 10 },
  reviewText: { flex: 1, gap: 3 },
  reviewVerb: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  reviewWhy: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  reviewClose: { marginTop: 10 },
});
