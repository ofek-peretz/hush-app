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

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BodyMapFigure, viewOf, type Face } from '@/components/BodyMapFigure';
import { Arrive, Button, Legend, SegmentedControl } from '@/components/ds';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { tg } from '@/i18n';
import { EASE_DAYS, liftsForbiddenNow, restsTheMuscle, type PainSeverity } from '@/domain/painReport';
import { exerciseById, muscleOf } from '@/data/exercises';
import { color, font, stage, textScale } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

/**
 * The receipt's body is INERT — see the note at its markup. Declared once, at module scope, so the
 * figure is not handed a new function on every render (it memoises nothing, but a stable prop is
 * the honest way to say "this does not do anything").
 */
const NOOP = () => {};

/**
 * The receipt's figure height.
 *
 * ⚠️ A NUMBER, UNLIKE THE PICKER'S. The picker above takes its own height because it is the subject
 * of its screen and the page scrolls around it (see the note at `figure`). This one shares a page
 * with a headline, a sentence and an act, so it is given a budget rather than allowed to set one —
 * a body that pushed the "Got it" button off a small screen would be a receipt she cannot dismiss.
 */
const FIGURE_H = 300;

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
  const [done, setDone] = useState<{ muscle: string; severity: PainSeverity } | null>(route.params?.previewDone ?? null);
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
            {/*
              ⛔ A TWINGE WAS BEING ANSWERED WITH A REST IT DOES NOT GET (2026-08-19).
              Both lines here were unconditional. `painReport` states the rule in as many words —
              *"a TWINGE is a warning — keep training the muscle, leave the movement that provoked it
              alone"* — and `restsTheMuscle('twinge')` is false. She reported a twinge, was told her
              muscle rests for three days, and met it in her next session. The screen contradicted
              the engine on the one screen whose whole job is to say what the engine just did.
            */}
            <Arrive order={1}>
              <Text style={styles.title}>
                {restsTheMuscle(done.severity)
                  ? tg('pain.responseTitleRested', { muscle: name })
                  : tg('pain.responseTitleTwinge', { muscle: name })}
              </Text>
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
                  : tg('pain.twingeFor', { count: EASE_DAYS[done.severity] })}
              </Text>
            </Arrive>

            {/*
              ════════════════════════════════════════════════════════════════════════════════════════
              ⛔ SHE IS TOLD WHAT HAPPENED TO HER BODY, SO SHE IS SHOWN HER BODY (2026-08-22)
              ════════════════════════════════════════════════════════════════════════════════════════

              FOUNDER, 2026-08-22, on the whole redesign: *"העדפה להראות במקום לכתוב כי העין של בן
              אדם אוהבת לצפות במקום לקרוא."*

              This screen said *"Your Chest keeps training — the movement that provoked it stands
              down"* over **fifty-five percent of empty black**, on the one surface in the product
              that exists to prove a report was acted on. It is the screen an athlete is most likely
              to distrust — `BodyMapEdit`'s own header records why: before that editor existed, *"she
              reports a painful shoulder, the engine rests it and rebuilds her week — and no surface
              anywhere says so."*

              ⚠️ IT IS THE SAME FIGURE, NOT A DRAWING OF ONE. `BodyMapFigure` is her map, drawn from
              her map, with the reported muscle in clay — so what she sees here is exactly what she
              will find in You → Body map when she goes to check, down to the limb. A bespoke
              illustration would have been a second picture of a fact, which is how two surfaces
              start disagreeing.

              ⚠️ AND IT IS INERT. `onSelect` is a no-op: this is a receipt, not an editor. Changing
              her map is a decision made with time to think, and it has a screen of its own.
            */}
            <Arrive order={3} style={styles.figureArrive}>
              <BodyMapFigure
                face={viewOf(done.muscle)}
                map={app.profile?.bodyMap ?? {}}
                tender={restsTheMuscle(done.severity) ? [done.muscle] : []}
                selected={restsTheMuscle(done.severity) ? null : done.muscle}
                onSelect={NOOP}
                sex={app.profile?.sex === 'male' ? 'male' : 'female'}
                height={FIGURE_H}
              />
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

          {/* ⛔ ONE FRONT/BACK TOGGLE, ONE SHAPE (2026-08-27) — the long note is at `BodyMap`.
                This one was outlined where the body map's was a filled cream pill: the same control,
                two costumes, one tap apart in her journey.

                ⚠️ THE KEYS THE BODY MAP ALREADY USES. A second pair of words for "front" and
                "back" is two vocabularies for one idea, and the map is where she learnt them. */}
          <Arrive order={1} style={styles.tabs}>
            <SegmentedControl
              size="pill"
              options={[
                { value: 'front', label: tg('ob.mapFront') },
                { value: 'back', label: tg('ob.mapBack') },
              ]}
              value={face}
              onChange={(v: string) => setFace(v as Face)}
            />
          </Arrive>

          <Arrive order={2} style={styles.figure}>
            {/*
              ⚠️ THE ANSWER TO "WHERE DOES IT HURT" IS DRAWN IN CLAY, NOT IN MOSS (audit 2026-08-24).

              This figure used to take `selected` alone — and `selected` only thickens the stroke.
              The FILL came from her training stance, so the muscle she was pointing at to report
              pain rendered moss if she happened to emphasise it and cream if she did not. Two
              things went wrong at once: the pain answer had no colour of its own, and on the
              commonest case it wore the one colour this codebase reserves for "a decision made / a
              load going up" — a raise, on the screen where she is telling us something hurts.

              The founder's token ruling already settles it: *"דברים שיש להם קשר לפציעה או לכמה
              שכואב לא יכולים להופיע בכחול; אדום הוא החלק שקשור לכאב"* — `tokens.alert` is the ONLY
              thing pain may draw in. The RECEIPT next door already obeyed it (`tender={[muscle]}`);
              the screen that ASKS did not. Pointing IS the report, so the pointed muscle is tender
              from the moment she touches it, and the two pain screens finally agree with the law
              and with each other.
            */}
            <BodyMapFigure
              face={face}
              map={app.profile?.bodyMap ?? {}}
              sex={app.profile?.sex}
              tender={muscle ? [muscle] : []}
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

  /* The receipt's body: centred, and holding the room the sentence above it used to leave black. */
  figureArrive: { alignSelf: 'stretch', alignItems: 'center', marginTop: 6 },

  /* The control draws itself; this only says where it sits. */
  tabs: { alignSelf: 'flex-start' },

  /*
   * ⛔ NO SEAT HEIGHT (2026-08-18). It was 320 — a number that only ever worked because the figure
   * drew INSIDE a box `aspectRatio` had made far taller and letterboxed itself down to fit. Now that
   * the figure's box is its drawing, a 320 seat is a body cut off at the knees by the grades below
   * it. It takes its own height here and the page scrolls, which is what a scroller is for.
   */
  figure: { alignSelf: 'stretch' },

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
