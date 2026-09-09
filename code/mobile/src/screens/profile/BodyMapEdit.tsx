/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER BODY, AFTER ONBOARDING — the map she can actually change.
 *
 * ⛔ FOUNDER, 2026-08-11: *"מסך שאלת הפציעה זה לא יהיה בBODYMAP?"* — and the honest answer was that
 * the body map was not a PLACE yet. It existed on exactly one screen, in onboarding, drawn once and
 * never reachable again. Measured: `BodyMapFigure` appeared in `onboarding/BodyMap` and the dev
 * gallery, and NOTHING under `src/screens` mentioned `painEases` at all.
 *
 * So today, before this screen: she reports a painful shoulder, the engine rests it and rebuilds her
 * week — **and no surface anywhere says so.** Her programme changes under her hands. That is worse
 * than a missing question; it is a silent change she did not ask for, which is the one thing this
 * product is built not to do.
 *
 * ⚠️ THE TEST FOR THIS SCREEN WAS WRITTEN BEFORE THE SCREEN. `bodyMapEditor.test.tsx` has been in the
 * suite, failing to run, for as long as the module has been missing — one of the two blocked suites
 * reported in every count this session. It is the contract, and this file is built to it rather than
 * to a fresh opinion.
 *
 * ── THE TWO RULES ONLY THIS SCREEN CAN BREAK ────────────────────────────────────────────────────
 *   · **S-56 — an OFF is obeyed in SILENCE.** The one "want it back?" question is asked later, once,
 *     at the Saturday mirror. Never as a confirm in front of the toggle. This screen does not argue
 *     with a choice she is making right now (L8).
 *   · **The map that is saved is the map she DREW** — whole-object, never merged. `normal` is the
 *     absence of a decision, so a muscle taken back to normal must really LEAVE the object; the
 *     engine reads absence as normal, and a merge could not express a muscle coming back.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, SegmentedControl, useToast } from '@/components/ds';
import { BodyMapFigure, viewOf, type Face } from '@/components/BodyMapFigure';
import { color, font } from '@/design/tokens';
import { tg } from '@/i18n';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import { emphasisBudgetFor, emphasisRefusal, type MarkRefusal } from '@/engine/v5/bodyMap';
import { muscleOf } from '@/data/exercises';
import { activeEases, awaitingAnswer, easeOn, daysLeft, type EaseAnswer } from '@/domain/painReport';
import type { MuscleStance, RepBandChoice, Session } from '@/data/local/models';

const STANCES: { key: MuscleStance; word: string }[] = [
  { key: 'off', word: 'ob.stanceOff' },
  { key: 'normal', word: 'ob.stanceNormal' },
  { key: 'emphasis', word: 'ob.stanceEmphasis' },
];

/** The bands a muscle may sit in. Hers per muscle; the profile's `repBand` is the fallback. */
const BANDS: RepBandChoice[] = ['6-8', '8-10', '8-12', '10-12', '12-15'];

/** The three answers a lapsed rest window can take — see `painReport`. */
const ANSWERS: { key: EaseAnswer; word: string }[] = [
  { key: 'recovered', word: 'pain.answerRecovered' },
  { key: 'tender', word: 'pain.answerTender' },
  { key: 'hurts', word: 'pain.answerHurts' },
];

export function BodyMapEdit({ navigation }: { navigation: any; route?: any }) {
  const app = useApp();
  const toast = useToast();
  const [face, setFace] = useState<Face>('front');
  const [open, setOpen] = useState<string | null>(null);
  /** Only her decisions — see the header. `{}` is a complete map. */
  const [map, setMap] = useState<Record<string, MuscleStance>>({ ...(app.profile?.bodyMap ?? {}) });
  const [bands, setBands] = useState<Record<string, RepBandChoice>>({ ...(app.profile?.repBandByMuscle ?? {}) });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ reason: MarkRefusal; marks: string[] } | null>(null);
  /** Alive through an await — a toast or a `setBusy` after she has left is a state update on a screen
   *  that is gone. Same guard `ExerciseLibrary` keeps for the same reason. */
  const aliveRef = React.useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  /**
   * ⚠️ READ, NEVER SHOWN AS A WARNING. S-56 is why: the fact that a muscle has been trained changes
   * NOTHING this screen does or says. It is loaded because the register scopes the Saturday question
   * to muscles she has actually trained, and because a screen that silently ignores its own inputs
   * invites someone to wire a confirm dialog to it later.
   */
  const [trained, setTrained] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void db.loadHistory().then((h: Session[]) => {
      if (!alive) return;
      const seen = new Set<string>();
      for (const s of h ?? []) for (const set of s.sets ?? []) {
        const m = muscleOf(set.exerciseId);
        if (m) seen.add(m);
      }
      setTrained(seen);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const eases = app.profile?.painEases;
  const marks = useMemo(() => Object.entries(map).filter(([, s]) => s === 'emphasis').map(([m]) => m), [map]);
  const asked = useMemo(() => awaitingAnswer(eases, Date.now()), [eases]);

  const stanceOf = (m: string): MuscleStance => map[m] ?? 'normal';

  /**
   * ⛔ NOTHING LEFT ON IS NOT A PROGRAMME (S-3) — AND THIS SCREEN WAS THE DOOR TO IT.
   *
   * ⛔ FOUNDER, 2026-08-12: *"אם יש לנו משתמש שלא רוצה לאמן רגליים בכלל, יש לנו אפשרות כזאת?"*
   *
   * Switching a REGION off works and works well — measured: legs off at three, four and five days
   * gives Upper A–E, 45 to 60 minutes each, zero leg work anywhere. Nothing is templated; the shape
   * falls out of the volume, which is what Part 3 says structure is.
   *
   * Switching EVERYTHING off does not, and this screen allowed it. Onboarding has refused it since
   * the map shipped (`nothingOn` kills the button and says why); the editor never learned the same
   * rule. Traced: `generateProgram` has a safety net that calls the assembler again with NO body
   * map, so she switched off all ten muscles, pressed save, and was handed **three full-body days
   * of seven lifts** — every muscle she had just turned off, trained. The engine overruling her in
   * silence is the one thing the map exists to prevent.
   *
   * The engine's half is fixed too (it now returns no workout rather than inventing one), but the
   * fix that matters is this: she is never in that state, and the button says so instead of
   * failing afterwards.
   */
  const nothingOn = useMemo(() => CANONICAL_MUSCLE_ORDER.every((m) => map[m] === 'off'), [map]);

  const setStance = (muscle: string, stance: MuscleStance) => {
    setRefused(null);
    // F-4 — the budget is legible, not a hidden error, exactly as it is in onboarding.
    // One question, one home — the same `emphasisRefusal` onboarding asks, so the two screens and the
    // engine can never disagree about which marks her week can actually honour (F-4 + the region rule).
    if (stance === 'emphasis') {
      const why = emphasisRefusal(map, muscle, CANONICAL_MUSCLE_ORDER, app.profile?.daysPerWeek);
      if (why) {
        setRefused({ reason: why, marks });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
    }
    /*
     * ⛔ NO CONFIRM, NO SHEET, NO ARGUMENT (S-56 / L8). Turning a muscle off just happens — even one
     * she has trained for months. The single "do you want it back?" is asked once, later, at the
     * Saturday mirror, where she is looking back rather than deciding.
     */
    void Haptics.selectionAsync().catch(() => {});
    setTouched(true);
    setMap((prev) => {
      const next = { ...prev };
      if (stance === 'normal') delete next[muscle]; // …and it leaves no trace
      else next[muscle] = stance;
      return next;
    });
  };

  const setBand = (muscle: string, band: RepBandChoice) => {
    void Haptics.selectionAsync().catch(() => {});
    setTouched(true);
    setBands((prev) => ({ ...prev, [muscle]: band }));
  };

  const answer = async (muscle: string, a: EaseAnswer) => {
    void Haptics.selectionAsync().catch(() => {});
    await app.answerEaseCheck?.(muscle, a);
  };

  /*
   * ⚠️ WHOLE OBJECTS, NEVER MERGED. `updateProfileInfo` spreads what it is given onto the profile, so
   * handing it a partial map would make a muscle taken back to normal impossible to express: the old
   * value would survive. The engine reads ABSENCE as normal, which is exactly what the whole object
   * says and a merge cannot.
   */
  const save = async () => {
    if (!touched || busy) return;
    setBusy(true);
    try {
      const rebuilt = await app.updateProfileInfo({ bodyMap: map, repBandByMuscle: bands });
      if (!aliveRef.current) return;
      /*
       * ⚠️ THE TOAST SAYS WHAT ACTUALLY HAPPENED. It said *"Your week was rebuilt to match"* on every
       * save — and `updateProfileInfo` returns without rebuilding anything when the week is one she
       * brought, because a week she brought is not ours to rewrite. She turned a muscle off, was told
       * her week had been rebuilt around it, and opened Today to the same week. `ExerciseLibrary`
       * has drawn this distinction since `saveLibrary` started answering; the sentence for a week
       * that stays as it is is already written, and one fact keeps one sentence.
       */
      toast.show(rebuilt ? tg('profileEdit.savedDays') : tg('library.savedNoRebuild'));
      setTouched(false);
    } catch {
      if (!aliveRef.current) return;
      /*
       * ⛔ A THROW WAS AN UNHANDLED REJECTION: no toast, no error, `touched` left true and the map
       * she drew lost the moment she walked away. `db.saveProfile` can fail; being silent about it
       * cannot. Same shape as `ExerciseLibrary`, which fixed exactly this.
       */
      toast.show(tg('library.saveFailed'));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  /**
   * ⛔ THE BACK ARROW THREW THE MAP AWAY (found 2026-08-18).
   *
   * Every other profile surface is instant-apply; this one is not — a stance and a rep band are held
   * in local state until Save. So `goBack` discarded, in silence, every edit she had made: the
   * muscle she just switched off, the band she just moved, gone with no sentence and no chance to
   * say no.
   *
   * It SAVES rather than asking. This product does not open dialogs to argue with a decision she has
   * already made (S-56 / L8), and "are you sure?" over a body map is exactly that argument.
   *
   * ⚠️ EXCEPT WHEN THERE IS NOTHING LEFT ON, which is not a programme (S-3) and is the one map the
   * button itself refuses to write. That state leaves unsaved — a dead end guarding a refusal is
   * worse than an edit not kept.
   */
  const leave = async () => {
    if (touched && !nothingOn) await save();
    navigation?.goBack?.();
  };

  const openStance: MuscleStance = open ? stanceOf(open) : 'normal';
  const openEase = open ? easeOn(eases, open, Date.now()) : null;

  return (
    <OnboardingScaffold
      onBack={() => void leave()}
      title={tg('ob.mapTitle')}
      /* ⛔ THE SAME BUDGET ONBOARDING PROMISES (found 2026-08-18). This screen hardcoded the
         two-lead copy while `onboarding/BodyMap` asks `emphasisBudgetFor(days)` — so on a three-day
         week the editor promised her two leads and `emphasisRefusal` then refused the second. The
         header of this file says the two screens can never disagree; they could, and here is where.
         One question, one home — the subtitle and the line at the foot both ask it. */
      sub={emphasisBudgetFor(app.profile?.daysPerWeek) === 1 ? tg('ob.mapSubOne') : tg('ob.mapSub')}
      headGap={18}
      bodyTop={18}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={tg('profileEdit.save')}
          onPress={() => void save()}
          /* Nothing to say is not a thing to save — and an always-live button teaches her to press it.
             …and NOTHING LEFT ON is not a programme (S-3) — see `nothingOn`. */
          disabled={!touched || busy || nothingOn}
        />
      }
    >
      {/* The refusal is stated, not just enforced — a dead button with no sentence is the silent
          failure this screen exists to remove. Same words onboarding uses. */}
      {nothingOn ? <Text style={styles.refusal}>{tg('ob.mapNothingOn')}</Text> : null}
      {/*
        ⛔ ONE FRONT/BACK TOGGLE, ONE SHAPE (2026-08-27).

        This control existed in FOUR places and was drawn in THREE ways:

          Progress  Lifts / Log     two outlined pills          (now the DS control)
          PainWhere front / back    outlined, cream border
          BodyMap   front / back    a FILLED CREAM pill
          BodyMapEdit               the same filled cream pill

        The filled one is the worst of the three, and not because of taste: cream-on-dark is this
        product's PRIMARY ACTION material — it is what `התחל` is made of. So on the body map the
        selected face tab wore the costume of the button that starts a workout.

        `SegmentedControl` is the app's control for switching a VIEW; its own docblock says so and
        so does `ProfileSheet`. Front and back are two views of one body. It draws all four now.
      */}
      <SegmentedControl
        size="pill"
        style={styles.tabs}
        options={[
          { value: 'front', label: tg('ob.mapFront') },
          { value: 'back', label: tg('ob.mapBack') },
        ]}
        value={face}
        onChange={(v: string) => setFace(v as Face)}
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/*
          ⛔ A RESTING MUSCLE IS DRAWN ON THE BODY, NOT ONLY WRITTEN IN ITS SHEET (2026-08-22).

          The window has been stated here since this screen existed — and only inside the sheet a
          TAP opens. So the fact that the whole feature exists to make visible was visible to
          nobody who did not already know which limb to press. This screen's own header names the
          defect it was built for: *"she reports a painful shoulder, the engine rests it and rebuilds
          her week — and no surface anywhere says so."* Half of that was still true here.

          The clay is `tokens.alert`, which is reserved for exactly this and for destruction, and it
          is the same mark the pain receipt draws — so the screen she is sent to and the screen she
          checks agree limb for limb.
        */}
        <BodyMapFigure
          face={face}
          sex={app.profile?.sex}
          map={map}
          tender={activeEases(eases, Date.now()).map((e) => e.muscle)}
          selected={open}
          onSelect={(m) => {
            setRefused(null);
            setFace(viewOf(m));
            setOpen((cur) => (cur === m ? null : m));
          }}
        />

        {open ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetName}>{tg(`muscle.${open}`)}</Text>

            {/*
              ⛔ THE REST WINDOW, WHERE THE FACT LIVES. Before this screen, a muscle resting because
              she said it hurt was invisible everywhere in the app — the engine knew, and she did not.
            */}
            {openEase ? (
              <Text style={styles.resting}>
                {tg('pain.resting', { n: daysLeft(openEase, Date.now()) })}
              </Text>
            ) : null}

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

            {/*
              ⛔ AN OFF MUSCLE HAS NO BAND TO SET — it lands in no range, so a scale there would decide
              nothing. The stance rungs stay, because turning it back on must remain one tap away.
            */}
            {openStance !== 'off' ? (
              <View style={styles.rungs}>
                {BANDS.map((b) => {
                  const isOn = (bands[open] ?? app.profile?.repBand) === b;
                  return (
                    <Pressable
                      key={b}
                      accessibilityRole="button"
                      accessibilityLabel={`${tg(`muscle.${open}`)} — ${b}`}
                      accessibilityState={{ selected: isOn }}
                      onPress={() => setBand(open, b)}
                      style={[styles.band, isOn && styles.bandOn]}
                    >
                      <Text style={[styles.bandText, isOn && styles.rungTextOn]}>{b}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/*
          ⛔ THE REST WINDOW THAT RAN OUT — the founder's rule, on the surface where the fact lives.
          `awaitingAnswer` reads the clock, so a window that lapsed while the app was closed appears
          the moment she opens this screen. Her three answers are facts about her body, and one of
          them ("recovered") deliberately writes nothing but a close.
        */}
        {asked.map((e) => (
          <View key={e.muscle} style={styles.ask}>
            <Text style={styles.askTitle}>{tg('pain.askBack', { muscle: tg(`muscle.${e.muscle}`) })}</Text>
            <View style={styles.rungs}>
              {ANSWERS.map((a) => (
                <Pressable
                  key={a.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${tg(`muscle.${e.muscle}`)} — ${tg(a.word)}`}
                  onPress={() => void answer(e.muscle, a.key)}
                  style={styles.rung}
                >
                  <Text style={styles.rungText}>{tg(a.word)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* ⛔ THE LINE SAYS WHAT HER WEEK CAN HONOUR — the same words, from the same question, as
            onboarding's. See the subtitle above. */}
        <Text style={styles.note}>
          {emphasisBudgetFor(app.profile?.daysPerWeek) === 1
            ? tg('ob.mapEmphasisOne', { n: marks.length })
            : tg('ob.mapEmphasis', { n: marks.length })}
        </Text>
        {refused ? (
          <Text style={styles.refusal}>
            {refused.reason === 'budget'
              ? tg('ob.mapBudgetFull', { a: tg(`muscle.${refused.marks[0]}`), b: tg(`muscle.${refused.marks[1]}`) })
              : refused.reason === 'same_region'
                ? tg('ob.mapSameRegion', { a: tg(`muscle.${refused.marks[0]}`) })
                : tg('ob.mapFullBodyWeek', { n: app.profile?.daysPerWeek, a: tg(`muscle.${refused.marks[0]}`) })}
          </Text>
        ) : null}
      </ScrollView>
    </OnboardingScaffold>
  );
}

export default BodyMapEdit;

const styles = StyleSheet.create({
  /* The control draws itself; this only says where it sits. */
  tabs: { alignSelf: 'center' },
  // ⚠️ EVERY TEXT STYLE HERE STATES ITS ALIGNMENT. Without one, React Native falls back to the
  // PHYSICAL left, so in Hebrew the tabs, the muscle name, the stance rungs and the band chips all
  // froze against the wrong edge inside containers that centre everything else. `lint-rtl` names it.
  /* ⛔ SANS, NOT MONO: it carries a WORD. `monoCarriesNoWords` scanned only for `t(` and these
     rows are fed by `tg(`, so four Hebrew labels sat in a face with no Hebrew glyphs, with
     tracking applied on top. The law knows both translators now (2026-08-19). */
  body: { paddingTop: 16, paddingBottom: 24, alignItems: 'center' },
  sheet: { width: '100%', marginTop: 18, alignItems: 'center' },
  sheetName: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted, marginBottom: 8, textAlign: 'center' },
  resting: { fontFamily: font.sans, fontSize: 17, color: color.accent, marginBottom: 10, textAlign: 'center' },
  rungs: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  rung: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  rungText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  rungTextOn: { color: color.onPaper },
  band: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.borderControl },
  bandOn: { backgroundColor: color.accent, borderColor: color.accent },
  bandText: { fontFamily: font.mono, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  ask: { width: '100%', marginTop: 22, alignItems: 'center' },
  askTitle: { fontFamily: font.serif, fontSize: 18, color: color.textPrimary, textAlign: 'center' },
  note: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginTop: 16, textAlign: 'center' },
  refusal: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, marginTop: 12, textAlign: 'center' },
});
