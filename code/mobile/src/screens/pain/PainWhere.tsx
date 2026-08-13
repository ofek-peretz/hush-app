/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * SOMETHING HURTS — she points at it, and the engine acts.
 *
 * ⛔ FOUNDER, 2026-08-12: *"דיווח פציעה — הורדנו ושמנו את מפת הגוף."*
 *
 * ── WHAT WAS HERE, AND WHY IT WENT ──────────────────────────────────────────────────────────────
 * A chat window. Built 2026-08-02 on his request at the time — *"take the body-map screens off and
 * put a chat window with the AI in their place"* — and it was a good argument for an AI product: an
 * engine can act on a muscle and a number, and only a coach can act on *"the outside of my elbow
 * when I straighten it"*.
 *
 * The product stopped being an AI product. And his FIRST instruction of the rebuild, weeks before
 * that one, was the opposite and is the one that stands:
 *
 *   > *"פציעות כאבים ומה אסור יהיה בBODYMAP לכן לא צריך טקסט חופשי."*
 *
 * ⚠️ I built the chat version on the newer request and never brought him the conflict. That is the
 * mistake this file is the correction of, not the chat itself.
 *
 * ── ⛔ AND NOTHING IS LOST, WHICH IS WHY THE MAP IS ENOUGH ───────────────────────────────────────
 * Every decision this screen makes was ALREADY the engine's, and the chat's answer was only a
 * roundabout way of reaching it:
 *
 *   `patternsAt`     which movements the muscle refuses at this severity — a table, not an opinion
 *   `EASE_DAYS`      how long it rests: 3 / 7 / 14 days, a WINDOW and never a healing estimate
 *   `reportPain`     writes the ease; the assembler reads it and the week is rebuilt around it
 *   `awaitingAnswer` brings it back when the window lapses, and asks her before it does
 *
 * The model added latency and a paid call between her and a table lookup. What it could genuinely
 * do — read prose about an elbow — is a thing Hush has no way to act on anyway (R7: it would have
 * been a sentence with no consequence).
 *
 * ── TWO TAPS, AND THE SECOND ONE IS THE DECISION ────────────────────────────────────────────────
 * Where, then how sharp. She is never asked to diagnose, name a tissue, or estimate a recovery —
 * the three things a person in pain cannot do and no app should ask of them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BodyMapFigure, type Face } from '@/components/BodyMapFigure';
import { Arrive, Button, Legend } from '@/components/ds';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { tg } from '@/i18n';
import { EASE_DAYS, liftsForbiddenNow, restsTheMuscle, type PainSeverity } from '@/domain/painReport';
import { exerciseById, muscleOf } from '@/data/exercises';
import { color, font, stage, textScale } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PainWhere'>;

/** The three rungs, and what each one MEANS to her rather than to a clinician. */
const GRADES: PainSeverity[] = ['twinge', 'pain', 'sharp'];

export function PainWhere({ navigation, route }: Props) {
  const app = useApp();
  /* ⛔ The live session, so a report reaches TODAY and not only next week — see `report`. */
  const session = useSession();
  /*
   * ⚠️ SHE ARRIVES FROM A LIFT MORE OFTEN THAN NOT — the door is on the session stage. So the muscle
   * that lift trains is pre-selected: it is right nearly always, it is one tap to change, and it
   * saves a person who is hurting from hunting for their own shoulder on a diagram.
   */
  const fromLift = route.params?.exerciseId ? muscleOf(route.params.exerciseId) : undefined;
  const [face, setFace] = useState<Face>('front');
  const [muscle, setMuscle] = useState<string | null>(fromLift ?? null);
  const [done, setDone] = useState<{ muscle: string; severity: PainSeverity } | null>(null);
  const [busy, setBusy] = useState(false);

  async function report(severity: PainSeverity) {
    if (!muscle || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await app.reportPain(muscle, severity);
      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ AND IT REACHES THE WORKOUT SHE IS STANDING IN (founder, 2026-08-12)
       *
       *   *"אני באימון חזה ודיווחתי על פציעה בחזה והמשכתי את האימון וזה נשאר לי על תרגיל חזה. אז
       *   מה המשמעות של זה לא הבנתי?"*
       *
       * `reportPain` saved the ease and rebuilt the PROGRAMME — every week after this one. The
       * session in front of her was untouched, so Back and Resume put her straight back on the
       * lift she had just said hurt. **The one moment the report is most urgent was the one it did
       * nothing about.**
       *
       * ⚠️ THE SAME TABLE DECIDES BOTH (`liftsForbiddenNow` → `patternsAt`), so today and next
       * week forbid exactly the same movements — and the same guard applies: `applyLiveEdit`
       * refuses a drop that would leave nothing at or after where she is standing, so a session
       * cannot be emptied out from under her. What it will not do is end her workout for her.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      const remaining = session.sessionExerciseIds ?? [];
      const gone = liftsForbiddenNow(remaining, app.profile?.painEases, Date.now(), (id) => exerciseById(id)?.pattern);
      if (gone.length > 0) session.reviseToday(gone.map((ex) => ({ do: 'drop', ex }) as const));
      setDone({ muscle, severity });
    } finally {
      setBusy(false);
    }
  }

  /* ── WHAT HAPPENED, once she has told us ─────────────────────────────────────────────────────── */
  if (done) {
    const name = tg(`muscle.${done.muscle}`, { defaultValue: done.muscle });
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Arrive order={0}>
              <Legend size={17} track={0.2} tone="accent">{tg('pain.adjusted', { muscle: name })}</Legend>
            </Arrive>
            <Arrive order={1}>
              <Text style={styles.title}>{tg('pain.responseTitleRested', { muscle: name })}</Text>
            </Arrive>
            {/*
              ⚠️ THE WINDOW IS STATED, AND SO IS ITS ENDING. "It comes back on its own" is the half
              athletes do not believe unless it is said — an ease that looked permanent is why the
              old map screen was distrusted. A twinge rests nothing at all, and says that instead.
            */}
            <Arrive order={2}>
              <Text style={styles.line}>
                {restsTheMuscle(done.severity)
                  ? tg('pain.easedFor', { muscle: name, days: EASE_DAYS[done.severity] }) + tg('pain.easedTail')
                  : tg('pain.resting', { n: EASE_DAYS[done.severity] })}
              </Text>
            </Arrive>
          </ScrollView>
          <View style={styles.footer}>
            <Button variant="primary" size="lg" block label={tg('pain.gotIt')} onPress={() => navigation.goBack()} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ── WHERE, then HOW SHARP ───────────────────────────────────────────────────────────────────── */
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Arrive order={0}>
            <Text style={styles.title} accessibilityRole="header">{tg('pain.whereTitle')}</Text>
            {/* ⛔ "I never ask you to diagnose" — the promise this screen is built on. */}
            <Text style={styles.sub}>{tg('pain.whereSub')}</Text>
          </Arrive>

          <Arrive order={1} style={styles.tabs}>
            {(['front', 'back'] as Face[]).map((f) => (
              <Pressable
                key={f}
                accessibilityRole="tab"
                accessibilityState={{ selected: face === f }}
                accessibilityLabel={tg(f === 'front' ? 'ob.mapFront' : 'ob.mapBack')}
                onPress={() => setFace(f)}
                style={({ pressed }) => [styles.tab, face === f && styles.tabOn, pressed && styles.pressWash]}
              >
                {/* ⚠️ THE KEYS THE BODY MAP ALREADY USES. A second pair of words for "front" and
                    "back" is two vocabularies for one idea, and the map is where she learnt them. */}
                <Text style={[styles.tabText, face === f && styles.tabTextOn]}>
                  {tg(f === 'front' ? 'ob.mapFront' : 'ob.mapBack')}
                </Text>
              </Pressable>
            ))}
          </Arrive>

          <Arrive order={2} style={styles.figure}>
            <BodyMapFigure
              face={face}
              map={app.profile?.bodyMap ?? {}}
              selected={muscle}
              onSelect={(m) => {
                void Haptics.selectionAsync().catch(() => {});
                setMuscle(m);
              }}
            />
          </Arrive>

          {/*
            ⛔ THE SEVERITY APPEARS ONLY ONCE SHE HAS POINTED. Asking "how sharp?" before there is a
            muscle is asking about nothing, and a control that cannot act is the defect this codebase
            keeps finding. It is also what makes the screen two taps rather than a form.
          */}
          {muscle ? (
            <Arrive order={3} style={styles.grades}>
              <Legend size={17} track={0.18}>{tg('pain.howSharp')}</Legend>
              {GRADES.map((g, i) => (
                <Pressable
                  key={g}
                  accessibilityRole="button"
                  accessibilityLabel={`${tg(`pain.grade_${g}`)} — ${tg(`pain.gradeNote_${g}`)}`}
                  disabled={busy}
                  onPress={() => void report(g)}
                  style={({ pressed }) => [styles.grade, i === GRADES.length - 1 && styles.gradeLast, pressed && styles.pressWash]}
                >
                  <Text style={styles.gradeName}>{tg(`pain.grade_${g}`)}</Text>
                  {/* What it MEANS, not what it is called — "a warning", "stop this", "every rep". */}
                  <Text style={styles.gradeNote}>{tg(`pain.gradeNote_${g}`)}</Text>
                </Pressable>
              ))}
            </Arrive>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, gap: 18 },

  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 38, color: stage.ink0, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: 17, lineHeight: 20, color: color.textSecondary, marginTop: 8, textAlign: 'left' },
  line: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },

  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(241,238,229,0.16)' },
  tabOn: { borderColor: color.textPrimary },
  tabText: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center' },
  tabTextOn: { color: color.textPrimary },

  figure: { height: 320 },

  grades: { borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.12)', paddingTop: 6 },
  grade: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.12)',
  },
  gradeLast: {},
  gradeName: { fontFamily: font.sansMedium, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  gradeNote: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'right' },

  /* A press is a WASH under the control, never a fade of it (founder A.13). */
  pressWash: { backgroundColor: 'rgba(241,238,229,0.06)' },

  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 30 },
});
