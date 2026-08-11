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
// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, useToast } from '@/components/ds';
import { BodyMapFigure, viewOf, type Face } from '@/components/BodyMapFigure';
import { color, font } from '@/design/tokens';
import { tg } from '@/i18n';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import { muscleOf } from '@/data/exercises';
import { awaitingAnswer, easeOn, daysLeft, type EaseAnswer } from '@/domain/painReport';
import type { MuscleStance, RepBandChoice, Session } from '@/data/local/models';

const STANCES: { key: MuscleStance; word: string }[] = [
  { key: 'off', word: 'ob.stanceOff' },
  { key: 'normal', word: 'ob.stanceNormal' },
  { key: 'emphasis', word: 'ob.stanceEmphasis' },
];

/** The bands a muscle may sit in. Hers per muscle; the profile's `repBand` is the fallback. */
const BANDS: RepBandChoice[] = ['6-8', '8-10', '10-12', '12-15'];

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
  const [refused, setRefused] = useState<string[] | null>(null);
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

  const setStance = (muscle: string, stance: MuscleStance) => {
    setRefused(null);
    // F-4 — the budget is legible, not a hidden error, exactly as it is in onboarding.
    if (stance === 'emphasis' && stanceOf(muscle) !== 'emphasis' && marks.length >= EMPHASIS_BUDGET) {
      setRefused(marks.slice(0, EMPHASIS_BUDGET));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
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
      await app.updateProfileInfo({ bodyMap: map, repBandByMuscle: bands });
      toast.show(tg('profileEdit.savedDays'));
      setTouched(false);
    } finally {
      setBusy(false);
    }
  };

  const openStance: MuscleStance = open ? stanceOf(open) : 'normal';
  const openEase = open ? easeOn(eases, open, Date.now()) : null;

  return (
    <OnboardingScaffold
      onBack={() => navigation?.goBack?.()}
      title={tg('ob.mapTitle')}
      sub={tg('ob.mapSub')}
      headGap={18}
      bodyTop={18}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={tg('profileEdit.save')}
          onPress={() => void save()}
          /* Nothing to say is not a thing to save — and an always-live button teaches her to press it. */
          disabled={!touched || busy}
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

        <Text style={styles.note}>{tg('ob.mapEmphasis', { n: marks.length })}</Text>
        {refused ? (
          <Text style={styles.refusal}>
            {tg('ob.mapBudgetFull', { a: tg(`muscle.${refused[0]}`), b: tg(`muscle.${refused[1]}`) })}
          </Text>
        ) : null}
      </ScrollView>
    </OnboardingScaffold>
  );
}

export default BodyMapEdit;

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 100, borderWidth: 1, borderColor: color.borderControl },
  tabOn: { backgroundColor: color.paper, borderColor: color.paper },
  tabText: { fontFamily: font.mono, fontSize: 13, color: color.textMuted, letterSpacing: 1 },
  tabTextOn: { color: color.onPaper },
  body: { paddingTop: 16, paddingBottom: 24, alignItems: 'center' },
  sheet: { width: '100%', marginTop: 18, alignItems: 'center' },
  sheetName: { fontFamily: font.mono, fontSize: 13, color: color.textMuted, letterSpacing: 1.4, marginBottom: 8 },
  resting: { fontFamily: font.sans, fontSize: 13, color: color.accent, marginBottom: 10, textAlign: 'center' },
  rungs: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  rung: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: color.borderControl },
  rungOn: { backgroundColor: color.accent, borderColor: color.accent },
  rungText: { fontFamily: font.sans, fontSize: 14, color: color.textPrimary },
  rungTextOn: { color: color.onPaper },
  band: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.borderControl },
  bandOn: { backgroundColor: color.accent, borderColor: color.accent },
  bandText: { fontFamily: font.mono, fontSize: 13, color: color.textPrimary },
  ask: { width: '100%', marginTop: 22, alignItems: 'center' },
  askTitle: { fontFamily: font.serif, fontSize: 18, color: color.textPrimary, textAlign: 'center' },
  note: { fontFamily: font.sans, fontSize: 13, color: color.textMuted, marginTop: 16, textAlign: 'center' },
  refusal: { fontFamily: font.sans, fontSize: 13, color: color.textPrimary, marginTop: 12, textAlign: 'center' },
});
