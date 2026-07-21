/**
 * Weekly Update — the Saturday letter. What Hush CHANGED, and why.
 *
 * ═══ THE SECOND PASS (founder 2026-07-13) ═══
 *
 *  · "Show only the exercises that changed, and why they changed." It used to print the whole week
 *    at its new loads, with the changed lifts highlighted inside it — so the news was buried in a
 *    list of things that were not news. The screen now holds the CHANGES and nothing else; one line
 *    at the end says the rest of the plan stands.
 *  · The WHY was always there (each changed lift unfolds to Observation → Conclusion → Action) and
 *    nothing said so — a bare chevron. Every changed row now carries the word "Why?".
 *  · "If there is no change, do not leave the screen empty — that reads as no progress." A steady
 *    week is the engine being right, so it says so and PROVES it: the lifts that have moved the
 *    furthest since day one, in the athlete's own numbers. Trust me — here is the evidence.
 *  · It opens with their name. This is a letter.
 *
 * v4 rules honoured: read-only (no accept/reject/undo); a load coming down is "matched to
 * demonstrated capability, sets kept" — never a setback, never red; no forecasts or probabilities.
 *
 * Data: getWeeklyPlan() joins the program structure with the engine's per-slot state and the
 * captured weekly change snapshot; the evidence comes from the logged history (domain/progressReport).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { IconButton, Legend, Button } from '@/components/ds';
import { WhyTriple, type WhyKind } from '@/components/WhyTriple';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { getWeeklyPlan, markWeeklyUpdateSeen, type WeeklyPlanView, type WeeklyPlanLift } from '@/domain/weeklyUpdate';
import { askBackMuscle, trainedMuscles } from '@/engine/v5/bodyMap';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { allTimePeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import { exerciseDisplayName } from '@/data/exercises';
import { bidi } from '@/i18n/bidi';
import type { Session, Units } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, up, down, signal, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WeeklyUpdate'>;

// Loads arrive in kg from the engine snapshot; render in the athlete's display units
// (the rest of the app never shows a unit the athlete didn't choose).
const fmtLoad = (n: number | null, units: Units): string =>
  n == null ? 'BW' : String(+((displayWeight(n, units) ?? 0).toFixed(2)));
const rangeStr = (r: [number, number]): string => `${r[0]}-${r[1]}`;

export function WeeklyUpdate({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const name = app.profile?.name;
  const units = app.profile?.units ?? 'kg';
  const [view, setView] = useState<WeeklyPlanView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * THE SCREEN THE SATURDAY NOTE OPENS — AND IT MUST NOT SHOW LAST WEEK (founder 2026-07-13).
   *
   * The roll is LAZY: nothing happens at 20:30 on a phone in a pocket. The bucket regenerates on
   * `refreshProgram`, and the engine folds the week inside `sessionTargets` — both of which run on
   * HOME's focus effects. But the note deep-links straight here, and this screen used to read the
   * engine's record the instant it mounted, racing Home's effects behind it. The athlete would tap
   * "I've updated your program", land on this screen, and read LAST week's update — the one moment
   * in the product where being wrong is unforgivable, because it is the moment the product is
   * claiming to have done the work.
   *
   * So the screen no longer races: it PERFORMS the roll it is here to report, and only then reads.
   * Both calls are idempotent (a bucket already rolled returns immediately; `maybeAdvance` coalesces
   * an in-flight advance and folds nothing twice), so arriving from Home — where the effects have
   * already run — costs a no-op.
   */
  useEffect(() => {
    let active = true;
    void (async () => {
      // 1 · the calendar roll (a new bucket, if Saturday 20:30 has passed since the last one)
      await app.refreshProgram().catch(() => {});
      // The store's `app.program` in this closure is the PRE-roll one; read the bucket that now
      // exists on disk, or fall back to what we were rendered with.
      const program = (await db.loadProgram().catch(() => null)) ?? app.program;
      if (!active) return;
      if (!program) {
        setLoaded(true);
        return;
      }
      // 2 · the engine's weekly fold (raises, match-downs, swaps) — it runs inside sessionTargets,
      //     which is where the record this screen renders is actually written.
      try {
        const day = program.days.find((d) => !d.isRest);
        if (day) {
          await app.model.sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions });
        }
      } catch {
        /* the engine could not advance — render whatever record exists rather than nothing */
      }
      // 3 · …and only now, read it.
      const v = await getWeeklyPlan(program);
      if (!active) return;
      setView(v);
      setLoaded(true);
      void track('weekly_update_viewed', { weekIndex: v?.weekIndex ?? null, changes: v?.changedCount ?? 0 });
      if (v && !v.seen) void markWeeklyUpdateSeen();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    void track('weekly_update_dismissed', { changes: view?.changedCount ?? 0 });
    navigation.goBack();
  }

  /**
   * THE EVIDENCE (founder 2026-07-13) — for the week where Hush changed nothing. An empty screen on
   * the day the product is supposed to prove it is working reads as "nothing is happening", which is
   * the opposite of the truth: a steady week means the plan is already right. So the screen fills
   * with the athlete's own history — the lifts that have travelled furthest since Hush met them.
   * Loaded only when there is nothing to report (the common case still costs no disk read).
   */
  const [evidence, setEvidence] = useState<QuarterlyProgressEntry[] | null>(null);
  const steady = loaded && (view?.changedCount ?? 0) === 0;
  useEffect(() => {
    if (!steady) return;
    let active = true;
    void db
      .loadHistory()
      .then((h: Session[]) => {
        if (!active) return;
        const top = allTimePeakProgress(h, Date.now())
          .filter((e) => e.deltaKg > 0)
          .sort((a, b) => b.deltaKg - a.deltaKg)
          .slice(0, 3);
        setEvidence(top);
      })
      .catch(() => active && setEvidence([]));
    return () => {
      active = false;
    };
  }, [steady]);

  /**
   * S-56 — THE ONE QUESTION THE MIRROR MAY ASK. "A muscle is switched off after she has trained it.
   * Once — and once only — Hush comes back: 'Legs have been off a while. Want them back?' One tap;
   * if she says no, it is never raised again (L4)… asked once, at the Saturday mirror, and never
   * counted in days." The candidate is a FACT (off on the map + a logged set exists + never asked);
   * either answer marks it asked forever. The map editor itself obeys an OFF in silence (L8).
   */
  const [askBack, setAskBack] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [history, prefs] = await Promise.all([db.loadHistory(), db.loadPreferences()]);
        if (!active) return;
        setAskBack(
          askBackMuscle(app.profile?.bodyMap, trainedMuscles(history), new Set(prefs.askedBackMuscles ?? [])),
        );
      } catch {
        /* no storage, no question — silence is the safe failure (L8) */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Answering — either way — retires the question for this muscle forever (L4). */
  async function answerAskBack(bringBack: boolean) {
    const m = askBack;
    if (!m) return;
    setAskBack(null);
    void track('askback_answered', { muscle: m, bringBack });
    try {
      const prefs = await db.loadPreferences();
      const asked = new Set(prefs.askedBackMuscles ?? []);
      asked.add(m);
      await db.savePreferences({ ...prefs, askedBackMuscles: [...asked] });
    } catch {
      /* worst case the question is seen again next Saturday — never blocks the answer itself */
    }
    if (bringBack) {
      // Back to `normal`; the muscle RESUMES with all its exercises' history (S-44 — v5 keys
      // progression to the exercise, so nothing was ever reset). The store rebuilds the week.
      const map = { ...(app.profile?.bodyMap ?? {}), [m]: 'normal' as const };
      await app.updateProfileInfo({ bodyMap: map }).catch(() => {});
    }
  }

  const changedCount = view?.changedCount ?? 0;
  const whenLabel = view
    ? `${new Date(view.at).toLocaleDateString(undefined, { weekday: 'long' })} · ${new Date(view.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headSpacer} />
        <Text style={styles.when}>{whenLabel}</Text>
        <IconButton accessibilityLabel={t('common.close')} onPress={close}>
          <Icon name="close" size={20} color={color.textPrimary} strokeWidth={2} />
        </IconButton>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Legend style={styles.eyebrow}>{steady ? t('weekly.evidenceLegend') : t('weekly.eyebrow')}</Legend>
        {/* A letter opens with the name of the person it is written to (founder 2026-07-13). */}
        {name ? <Text style={styles.vocative}>{t('common.vocative', { name: bidi(name) })}</Text> : null}
        <Text style={styles.title}>{view ? t('weekly.weekTitle', { n: view.weekIndex + 1 }) : t('weekly.title')}</Text>
        <Text style={styles.intro}>
          {steady ? t('weekly.evidenceIntro') : t('weekly.intro', { count: changedCount })}
        </Text>

        {/* ── S-56 · the one question the mirror may ask (asked once per muscle, ever) ── */}
        {askBack ? (
          <View style={styles.askBack}>
            <Text style={styles.askBackTitle}>{t('weekly.askBackTitle', { muscle: t(`muscle.${askBack}`) })}</Text>
            <Text style={styles.askBackBody}>{t('weekly.askBackBody')}</Text>
            <View style={styles.askBackActions}>
              <Button variant="secondary" size="md" label={t('weekly.askBackNo')} onPress={() => void answerAskBack(false)} />
              <Button variant="primary" size="md" label={t('weekly.askBackYes')} onPress={() => void answerAskBack(true)} />
            </View>
          </View>
        ) : null}

        {/* ── the week where something changed: ONLY what changed ── */}
        {!steady
          ? view?.workouts.map((w) => {
              // A workout with nothing changed in it is not news, and does not appear.
              const changed = w.lifts.filter((l) => l.change);
              if (changed.length === 0) return null;
              return (
                <View key={w.dayId} style={styles.workout}>
                  <View style={styles.workoutHead}>
                    <Text style={styles.workoutName}>{w.name}</Text>
                    <Text style={styles.workoutGroups}>{w.groups.join(' · ').toUpperCase()}</Text>
                  </View>
                  {changed.map((lift, i) => (
                    <LiftRow
                      key={`${w.dayId}:${i}`}
                      lift={lift}
                      open={openId === lift.change!.snapshot.slotId}
                      onToggle={() => {
                        const id = lift.change!.snapshot.slotId;
                        setOpenId((cur) => (cur === id ? null : id));
                        if (openId !== id)
                          void track('weekly_update_why_opened', { pattern: lift.change!.explanation.pattern });
                      }}
                    />
                  ))}
                </View>
              );
            })
          : null}

        {/* ── Loop 3 · volume moves — muscle-level news that belongs to no single lift row ── */}
        {!steady && view?.volume?.length ? (
          <View style={styles.volumeBlock}>
            {view.volume.map((v) => (
              <View key={v.muscle} style={styles.volumeRow}>
                <View style={styles.volumeTop}>
                  <Text style={styles.volumeMuscle}>{t(`muscle.${v.muscle}`)}</Text>
                  <View style={styles.evidenceMoveRow}>
                    <Text style={[styles.volumeMove, { color: v.setsTo > v.setsFrom ? up[0] : down[0] }]}>
                      {`${v.setsFrom} → ${v.setsTo}`}
                    </Text>
                    <Text style={styles.evidenceUnit}>{t('weekly.setsUnit')}</Text>
                  </View>
                </View>
                {/* The why, in place — a volume move is one sentence, not a foldout. */}
                <Text style={styles.volumeWhy}>{t(v.explanation.text.key, v.explanation.text.params ?? {})}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* The plan is bigger than the news. One line, so the athlete knows the rest is intact. */}
        {!steady && changedCount > 0 ? <Text style={styles.unchanged}>{t('weekly.unchangedNote')}</Text> : null}

        {/* ── the steady week: the proof (see the header) ── */}
        {steady && evidence ? (
          evidence.length > 0 ? (
            <View style={styles.evidence}>
              {evidence.map((e) => {
                const reps = e.mode === 'reps';
                // Reps are a count; a load goes through the athlete's units and the same trim every
                // other figure on this screen uses (62.50 → 62.5, never 62.50).
                const from = reps ? e.initialPeakKg : fmtLoad(e.initialPeakKg, units);
                const to = reps ? e.periodPeakKg : fmtLoad(e.periodPeakKg, units);
                return (
                  <View key={e.exerciseId} style={styles.evidenceRow}>
                    <Text style={styles.evidenceName} numberOfLines={1}>
                      {bidi(exerciseDisplayName(e.exerciseId))}
                    </Text>
                    {/* The figures are MEASURED (mono, which has no Hebrew — so it may carry no
                        words); the unit standing beside them is SPOKEN, and sits in its own Text. */}
                    <View style={styles.evidenceMoveRow}>
                      <Text style={styles.evidenceMove}>{`${from} → ${to}`}</Text>
                      <Text style={styles.evidenceUnit}>{reps ? t('weekly.repsUnit') : unitLabel(units)}</Text>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.evidenceClose}>{t('weekly.evidenceClose')}</Text>
            </View>
          ) : (
            // Too early to have proof of anything — so we claim none.
            <Text style={styles.evidenceClose}>{t('weekly.evidenceEmpty')}</Text>
          )
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" block label={t('weekly.done')} onPress={close} />
      </View>
    </SafeAreaView>
  );
}

function LiftRow({ lift, open, onToggle }: { lift: WeeklyPlanLift; open: boolean; onToggle: () => void }) {
  const { t } = useCopy();
  const units = useApp().profile?.units ?? 'kg';
  const unit = unitLabel(units);
  const ch = lift.change?.snapshot;
  const expl = lift.change?.explanation;
  const hasWhy = !!lift.change;
  const swapped = ch?.swapped ?? false;
  const loadChanged = !!ch && ch.loadFrom !== ch.loadTo && !swapped;
  const setsChanged = !!ch && ch.setsFrom !== ch.setsTo;
  const rangeChanged = !!ch && (ch.rangeFrom[0] !== ch.rangeTo[0] || ch.rangeFrom[1] !== ch.rangeTo[1]);
  const prominent = loadChanged || setsChanged || rangeChanged || swapped;
  const tone: WhyKind = swapped ? 'swap' : loadChanged ? (ch!.loadTo! >= (ch!.loadFrom ?? -Infinity) ? 'up' : 'down') : 'neutral';
  const loadColor = tone === 'up' ? up[0] : tone === 'down' ? down[0] : color.textPrimary;

  const toLoad = ch ? ch.loadTo : lift.loadKg;
  const sets = ch ? ch.setsTo : lift.sets;
  const range = ch ? ch.rangeTo : lift.repRange;

  // The right-hand load cluster (load + optional chevron).
  const loadCluster = (
    <View style={styles.loadCluster}>
      {swapped ? (
        <Text style={styles.loadSwap}>
          {fmtLoad(toLoad, units)}<Text style={styles.kg}> {unit}</Text>
        </Text>
      ) : loadChanged ? (
        <Text style={styles.loadLine}>
          <Text style={styles.loadFrom}>{fmtLoad(ch!.loadFrom, units)} </Text>
          <Text style={styles.arrow}>→ </Text>
          <Text style={[styles.loadTo, { color: loadColor }]}>{fmtLoad(toLoad, units)}</Text>
          <Text style={styles.kg}> {unit}</Text>
        </Text>
      ) : (
        <Text style={styles.loadPlain}>
          {fmtLoad(toLoad, units)}<Text style={styles.kg}> {unit}</Text>
        </Text>
      )}
      {hasWhy ? <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={color.textTertiary} strokeWidth={2} /> : null}
    </View>
  );

  return (
    <Pressable onPress={hasWhy ? onToggle : undefined} style={styles.lift} accessibilityRole={hasWhy ? 'button' : undefined}>
      <View style={styles.liftTop}>
        <Text style={[styles.liftName, prominent && styles.liftNameStrong]} numberOfLines={1}>
          {lift.name}
        </Text>
        {swapped ? (
          <View style={styles.swapBadge}>
            <Icon name="repeat" size={12} color={color.accentText} strokeWidth={2} />
            <Text style={styles.swapBadgeText}>{t('weekly.swapped').toUpperCase()}</Text>
          </View>
        ) : (
          loadCluster
        )}
      </View>

      {prominent ? (
        <View style={styles.liftSecond}>
          {swapped ? (
            <Text style={styles.newExercise}>{t('weekly.newExercise')}</Text>
          ) : (
            <Text style={styles.sub}>
              {setsChanged ? (
                <>
                  <Text style={styles.subFrom}>{ch!.setsFrom} </Text>
                  <Text style={styles.subArrow}>→ </Text>
                  <Text style={styles.subStrong}>{sets} </Text>
                </>
              ) : (
                <Text>{sets} </Text>
              )}
              <Text>{t('weekly.setsUnit')}</Text>
              {range ? (
                <>
                  <Text style={styles.subDot}> · </Text>
                  {rangeChanged ? (
                    <>
                      <Text style={styles.subFrom}>{rangeStr(ch!.rangeFrom)} </Text>
                      <Text style={styles.subArrow}>→ </Text>
                      <Text style={styles.subStrong}>{rangeStr(range)} </Text>
                    </>
                  ) : (
                    <Text>{rangeStr(range)} </Text>
                  )}
                  <Text>{t('weekly.repsUnit')}</Text>
                </>
              ) : null}
            </Text>
          )}
          {swapped ? loadCluster : null}
        </View>
      ) : null}

      {/* THE WORD "WHY" (founder 2026-07-13). The explanation was always one tap away and nothing
          said so — a chevron is a shape, not a promise. Now the row states what pressing it gives. */}
      {hasWhy ? (
        <View style={styles.whyRow}>
          <Text style={styles.whyLink}>{t('weekly.whyLink')}</Text>
        </View>
      ) : null}

      {open && expl ? (
        <View style={styles.whyWrap}>
          <WhyTriple
            saw={t(expl.observation.key, expl.observation.params ?? {})}
            means={t(expl.conclusion.key, expl.conclusion.params ?? {})}
            did={t(expl.action.key, expl.action.params ?? {})}
            kind={tone}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 4, minHeight: 44 },
  headSpacer: { width: 40 },
  when: { flex: 1, textAlign: 'center', fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, letterSpacing: 0.2 },

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 20 },
  eyebrow: { marginTop: 12, marginBottom: 10 },
  vocative: { fontFamily: font.sans, fontSize: textScale.lg, color: color.textSecondary, textAlign: 'left', marginBottom: 2 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: color.textPrimary, lineHeight: textScale['3xl'] * 1.02, textAlign: 'left' },
  intro: { marginTop: 12, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 25, color: color.textSecondary, maxWidth: 340, textAlign: 'left' },

  workout: { marginTop: 24 },
  workoutHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: color.borderStrong },
  workoutName: { fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  workoutGroups: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.textTertiary, textAlign: 'left' },

  lift: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.border },
  liftTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  liftNameStrong: { fontFamily: font.sansSemibold, textAlign: 'left' },
  liftSecond: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },

  sub: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  subFrom: { color: color.textTertiary },
  subArrow: { color: color.textTertiary },
  subStrong: { fontFamily: font.monoSemibold, color: color.textPrimary, textAlign: 'left' },
  subDot: { color: color.textTertiary },
  newExercise: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },

  loadCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadLine: { fontFamily: font.mono, fontSize: textScale.md, color: color.textMuted, textAlign: 'left' },
  loadFrom: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },
  arrow: { color: color.textTertiary, fontSize: textScale.sm },
  loadTo: { fontFamily: font.monoSemibold, fontSize: textScale.lg, textAlign: 'left' },
  loadPlain: { fontFamily: font.mono, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  loadSwap: { fontFamily: font.monoSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  kg: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },

  swapBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.full, backgroundColor: color.fillSubtle },
  swapBadgeText: { fontFamily: font.sansSemibold, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.accentText, textAlign: 'left' },

  whyRow: { marginTop: 8 },
  whyLink: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accentText, textAlign: 'left' },
  whyWrap: { marginTop: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: color.surface3, borderRadius: radius.lg },

  // the rest of the plan stands — said once, at the end
  unchanged: { marginTop: 20, fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },

  // Loop 3 — a volume move is a muscle's news, so it gets a muscle row, not a fake lift row.
  volumeBlock: { marginTop: 24 },
  volumeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  volumeRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.border },
  volumeMuscle: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  volumeMove: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.md, textAlign: 'left' },
  volumeWhy: { marginTop: 6, fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },

  // S-56 — the one question the mirror may ask. A quiet card, not a modal: the letter is hers to
  // read, and the question waits inside it rather than standing in front of it (L9).
  askBack: { marginTop: 20, padding: 16, backgroundColor: color.surface3, borderRadius: radius.lg, gap: 8 },
  askBackTitle: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  askBackBody: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },
  askBackActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2], marginTop: 6 },

  // the steady week: the athlete's own history, as proof
  evidence: { marginTop: 24 },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  evidenceName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  // A measurement, in the measuring voice — and it is a RISE, so it is sage.
  evidenceMove: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.md, color: up[0], textAlign: 'left' },
  evidenceMoveRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  evidenceUnit: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
  evidenceClose: { marginTop: 22, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 25, color: color.textSecondary, textAlign: 'left' },

  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: color.border },
});
