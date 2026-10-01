/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE TRAINEE, AS HER COACH SEES HER (the coach track, 2026-09-17)
 *
 * ⛔ RULING 3: *the coach sees every set from the link date on* — load, reps, swaps, skips, pain.
 * Bodyweight only when she switched it on. Never her history from before, never Health, never GPS.
 * This screen draws exactly what `/coach/athlete` returns, and the server already rebuilt that field
 * by field (law 4) — there is nothing on it the coach should not have.
 *
 * ── THE ORDER IS THE COACH'S QUESTIONS, IN THE ORDER HE ASKS THEM ────────────────────────────────
 *   1. What did I send, and how much of it is done?   — the paper card: title, days, done pips
 *   2. Is it working?                                   — an e1RM line per main lift, the figure, the move
 *   3. What actually happened?                          — the last workouts, set by set
 *   4. What do I change?                                — the pen, one button
 *
 * ⛔ A SWAP IS A FACT, NOT A VERDICT (ruling 4). "Swapped from X" sits beside the lift she did, in
 * the muted tone — no clay, no icon, no count. She is allowed to swap for today; the coach is told.
 * The pattern (the same lift swapped away three times) is the roster's flag, not this row's tone.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { BottomSheet } from '@/components/BottomSheet';
import { Arrive, Button, Legend, Sparkline, opticalFigure } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { bidi, rtl } from '@/i18n/bidi';
import { color, font, radius, paper, ink, signal, tracking, trackingPx } from '@/design/tokens';
import { exerciseDisplayName } from '@/data/exercises';
import { adherence } from '@/domain/coachTrack';
import { liftTrends, painAreaWords, sessionLines, shortDate, type LiftTrend, type SessionRead } from '@/domain/coachDesk';
import { currentWeekOpen } from '@/domain/weekCadence';
import { coachAthlete, coachRemoveAthlete, type AthleteDetail as AthleteData, type CoachTrackError } from '@/platform/coachTrackClient';
import { CoachTrackContext } from '@/state/stores/coachStore';

/** How many workouts the log shows — the last few is what a coach reads; the trend holds the rest. */
export const LOG_SESSIONS = 3;

/* ─────────────────────────────────────────────────────────────── the pure view */

export interface AthleteDetailViewProps {
  name: string;
  /** Null while the read is out. */
  data: AthleteData | null;
  error?: CoachTrackError | null;
  /** The version just sent from the pen — the confirmation line at the top. */
  sentVersion?: number;
  nowMs: number;
  onBack: () => void;
  onEditWeek: () => void;
  onRemove: () => void;
  removing: boolean;
}

function TrendBlock({ trend, width }: { trend: LiftTrend; width: number }) {
  const { t } = useCopy();
  const sign = trend.delta > 0 ? '+' : '';
  /*
   * ⛔ A LIFT THAT HAS NOT MOVED SAYS SO IN WORDS (2026-09-18, walked on glass).
   *
   * It printed `0 ק״ג · 3 שב׳` — a bare nought in the instrument face, beside a flat sparkline,
   * in the same treatment as `+9.5`. Two of the three trends on a real trainee were that, so a
   * third of the screen's most expensive ink said nothing. And it IS something: a lift that has
   * not moved in six weeks is the most actionable line on a coach's screen — it just has to be a
   * SENTENCE, not a figure, because a figure implies a measurement and nought is the absence of
   * one. Same rule as `theLoadCarriesItsOwnNews`: say nothing until there is something to say,
   * and when there is, say it.
   */
  const flat = trend.delta === 0;
  return (
    <View style={styles.trend}>
      <Legend size={17} track={0.06} style={styles.trendLegend}>{t('coachTrack.coach.athlete.trendLegend', { ex: exerciseDisplayName(trend.ex) })}</Legend>
      <Sparkline data={trend.series} width={width} height={44} />
      <View style={[styles.trendFacts, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Text style={styles.bigFigure}>{opticalFigure(trend.current)}</Text>
        {/* The signed move is a FIGURE in its own run, isolated LTR (U+2066…U+2069) so `+9.5` never
            reads `9.5+`; the unit and the span are words beside it (walked on web, 2026-09-17). */}
        {/* A natural row (it follows the language): the figure is read first in both — at the start. */}
        {flat ? (
          <Text style={styles.trendFlat} numberOfLines={2}>{t('coachTrack.coach.athlete.trendFlat', { weeks: trend.weeks })}</Text>
        ) : (
          <View style={styles.trendMoveRow}>
            <Text style={styles.trendDelta}>{`⁦${sign}${trend.delta}⁩`}</Text>
            <Text style={styles.trendMove}>{t('coachTrack.coach.athlete.trendMove', { weeks: trend.weeks })}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SessionBlock({ at, day, minutes, read }: { at: string; day: string; minutes: number; read: SessionRead }) {
  const { t } = useCopy();
  return (
    <View style={styles.session}>
      <Legend size={17} track={0.06} style={styles.sessionLegend}>
        {day ? `${shortDate(at)} · ${day}` : shortDate(at)}
      </Legend>
      {read.lines.map((l) => (
        <View key={l.ex} style={styles.lift}>
          <View style={styles.liftText}>
            <Text style={styles.liftName}>{bidi(exerciseDisplayName(l.ex))}</Text>
            {l.swappedFrom ? (
              <Text style={styles.liftSwap}>{t('coachTrack.coach.athlete.swappedFrom', { ex: exerciseDisplayName(l.swappedFrom) })}</Text>
            ) : null}
          </View>
          <Text style={styles.liftFigure}>{l.figure}</Text>
        </View>
      ))}
      {read.skipped.length > 0 ? (
        <Text style={styles.sessionNote}>{t('coachTrack.coach.athlete.skipped', { list: read.skipped.map((x) => exerciseDisplayName(x)).join(' · ') })}</Text>
      ) : null}
      {read.pain.length > 0 ? (
        <Text style={styles.sessionPain}>{t('coachTrack.coach.athlete.pain', { list: painAreaWords(read.pain, t) })}</Text>
      ) : null}
      <Text style={styles.sessionNote}>
        {read.early ? t('coachTrack.coach.athlete.minutesEarly', { min: minutes }) : t('coachTrack.coach.athlete.minutes', { min: minutes })}
      </Text>
    </View>
  );
}

export function AthleteDetailView(p: AthleteDetailViewProps) {
  const { t } = useCopy();
  const { width } = useWindowDimensions();
  const [confirm, setConfirm] = useState(false);
  const d = p.data;
  const week = d?.week;
  const days = week?.week.days.length ?? 0;
  const done = d ? adherence({ days: days || d.days, recent: d.sessions }, currentWeekOpen(p.nowMs)).done : 0;
  const prefer = week ? week.week.days.flatMap((day) => day.lifts.map((l) => l.ex)) : [];
  const trends = d ? liftTrends(d.sessions, { prefer }) : [];
  const recent = d ? [...d.sessions].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, LOG_SESSIONS) : [];
  const sparkW = Math.max(160, Math.min(width, 560) - 40);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack} hitSlop={12} style={styles.back}>
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Arrive order={0}>
          <Text style={styles.title}>{bidi(p.name)}</Text>
          {d ? <Text style={styles.since}>{t('coachTrack.coach.athlete.since', { date: shortDate(d.since) })}</Text> : null}
          {p.sentVersion ? (
            <View style={styles.sent}>
              <Icon name="check" size={18} color={color.accent} strokeWidth={2} />
              <Text style={styles.sentText}>{t('coachTrack.coach.athlete.sent', { name: p.name })}</Text>
            </View>
          ) : null}
          {p.error ? (
            <Text style={styles.muted}>{t(`coachTrack.coach.error.${p.error}`, { defaultValue: t('coachTrack.coach.error.network') })}</Text>
          ) : null}
        </Arrive>

        {d ? (
          <Arrive order={1}>
            {/* ── 1 · what he sent, and how much of it is done — PAPER, because it is his document ── */}
            {/*
              ⛔ PAPER MEANS THERE IS A DOCUMENT (2026-09-18, walked on glass).
              *
              * The no-week state was drawn on the same cream slab as a week he had written: a blank
              * page, in the one material this app reserves for HIS OWN WRITING, saying that nothing
              * was written. It also apologised — "no week has been sent yet" — and then left the
              * next move at the foot of the screen under a button that said EDIT a week that does
              * not exist.
              *
              * On the stage now, as a state that TEACHES: what she is training from meanwhile, what
              * he sees the moment he writes one, and the act right there, in the words of the thing
              * it actually does.
            */}
            {week ? (
              <View style={styles.paperCard}>
                <Text style={styles.paperSmall}>
                  {week.week.title
                    ? t('coachTrack.coach.athlete.weekTitled', { title: week.week.title })
                    : t('coachTrack.coach.athlete.weekUntitled', { version: week.version })}
                </Text>
                <Text style={styles.paperMain}>{t('coachTrack.coach.athlete.daysDone', { count: days, done: Math.min(done, days) })}</Text>
                <View style={[styles.pips, { flexDirection: rtl ? 'row-reverse' : 'row' }]} accessibilityElementsHidden>
                  {Array.from({ length: days }, (_, i) => (
                    <View key={i} style={[styles.pip, i < done && styles.pipOn]} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.firstWeek}>
                <Text style={styles.firstWeekTitle}>{t('coachTrack.coach.athlete.noWeek')}</Text>
                <Text style={styles.firstWeekLine}>{t('coachTrack.coach.athlete.noWeekSub', { name: p.name })}</Text>
                <Text style={styles.firstWeekLine}>{t('coachTrack.coach.athlete.noWeekThen')}</Text>
                <Button
                  block
                  variant="signal"
                  size="card"
                  label={t('coachTrack.coach.athlete.writeWeek', { name: p.name })}
                  onPress={p.onEditWeek}
                  style={styles.firstWeekAct}
                />
              </View>
            )}

            {/* ── 2 · is it working ── */}
            {trends.map((tr) => (
              <TrendBlock key={tr.ex} trend={tr} width={sparkW} />
            ))}

            {/* ── 3 · what happened ── */}
            {/* ⛔ "No workouts yet" under "you have not sent a week yet" is the same fact twice, and the
                   second telling reads like a second problem. The first-week card owns that state. */}
            {recent.length === 0 ? (
              week ? <Text style={styles.muted}>{t('coachTrack.coach.athlete.noSessions', { name: p.name })}</Text> : null
            ) : (
              <>
                {recent.map((s) => <SessionBlock key={s.id} at={s.at} day={s.day} minutes={s.minutes} read={sessionLines(s)} />)}
                {/* ⛔ A LOG THAT STOPS MUST SAY THAT IT STOPPED. Three workouts is what a coach reads;
                    a trainee two months in has thirty, and the screen simply ended — so "she has done
                    three" and "I am showing three" were the same picture. The trend above holds the
                    rest, and this line is what says so. */}
                {d.sessions.length > recent.length ? (
                  <Text style={styles.logMore}>{t('coachTrack.coach.athlete.logShown', { shown: recent.length, total: d.sessions.length })}</Text>
                ) : null}
              </>
            )}

            {d.bodyweightKg != null ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>{t('coachTrack.coach.athlete.bodyweight')}</Text>
                <Text style={styles.factFigure}>{String(d.bodyweightKg)}</Text>
              </View>
            ) : null}
          </Arrive>
        ) : null}

        {/* ── 4 · the pen — and ONLY where the card above has not already carried it. The first-week
               state ends in that act; repeating it at the foot printed the same sentence twice on a
               screen with four lines on it, which is how one act becomes a choice between two. ── */}
        {week || !d ? (
          <Button block label={t('coachTrack.coach.athlete.editWeek', { name: p.name })} onPress={p.onEditWeek} disabled={!d} style={styles.edit} />
        ) : null}
        <Button block variant="quiet" label={t('coachTrack.coach.athlete.remove', { name: p.name })} onPress={() => setConfirm(true)} disabled={!d || p.removing} style={styles.remove} />
      </ScrollView>

      {confirm ? (
        <BottomSheet onClose={() => setConfirm(false)}>
          <Text style={styles.confirmTitle}>{t('coachTrack.coach.athlete.removeTitle', { name: p.name })}</Text>
          <Text style={styles.confirmBody}>{t('coachTrack.coach.athlete.removeBody', { name: p.name })}</Text>
          <Button block variant="danger" label={t('coachTrack.coach.athlete.removeYes')} onPress={() => { setConfirm(false); p.onRemove(); }} style={styles.confirmAct} />
          <Button block variant="ghost" label={t('common.cancel')} onPress={() => setConfirm(false)} />
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────── the container */

type Props = NativeStackScreenProps<MainParamList, 'AthleteDetail'>;

export function AthleteDetail({ navigation, route }: Props) {
  const { linkId, sentVersion } = route.params;
  const coachTrack = useContext(CoachTrackContext);
  const [data, setData] = useState<AthleteData | null>(null);
  const [error, setError] = useState<CoachTrackError | null>(null);
  const [removing, setRemoving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void coachAthlete(linkId).then((r) => {
        if (!alive) return;
        if (r.ok) {
          setData(r.value);
          setError(null);
        } else setError(r.error);
      });
      return () => {
        alive = false;
      };
    }, [linkId, sentVersion]),
  );

  const name = data?.name ?? route.params.name ?? '';

  return (
    <AthleteDetailView
      name={name}
      data={data}
      error={error}
      {...(sentVersion ? { sentVersion } : {})}
      nowMs={Date.now()}
      onBack={() => navigation.goBack()}
      onEditWeek={() => {
        if (!data) return;
        navigation.navigate('CoachWeekBuilder', {
          linkId,
          name: data.name,
          ...(data.sex ? { sex: data.sex } : {}),
          ...(data.days ? { days: data.days } : {}),
          ...(data.bodyweightKg != null ? { bodyweightKg: data.bodyweightKg } : {}),
          ...(data.week ? { week: data.week.week } : {}),
        });
      }}
      removing={removing}
      onRemove={() => {
        setRemoving(true);
        void coachRemoveAthlete(linkId).then((r) => {
          setRemoving(false);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          void coachTrack?.refreshMe().catch(() => null);
          navigation.goBack();
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  wrap: { padding: 20, paddingBottom: 56 },
  back: { alignSelf: 'flex-start', marginBottom: 10 },
  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, color: color.textPrimary, textAlign: 'left' },
  since: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left', marginTop: 2 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: color.accentWash, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  sentText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textPrimary, textAlign: 'left' },
  muted: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left', marginTop: 12 },
  /* The paper card — his document, on the stage. Ink on paper, deep moss for the done pips. */
  paperCard: { backgroundColor: paper[0], borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 14, marginTop: 18, gap: 4 },
  paperSmall: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: ink[1], textAlign: 'left' },
  paperMain: { fontFamily: font.sansSemibold, fontSize: 19, lineHeight: 25, color: ink[0], textAlign: 'left' },
  pips: { gap: 4, marginTop: 6 },
  /* No week yet — on the STAGE, in the app's own card, never on paper (see the render note). */
  firstWeek: { marginTop: 18, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: 18, gap: 8 },
  firstWeekTitle: { fontFamily: font.serif, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 2 },
  firstWeekLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },
  firstWeekAct: { marginTop: 10 },
  logMore: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'left', marginTop: 18 },
  pip: { width: 18, height: 5, borderRadius: 3, backgroundColor: paper[2] },
  pipOn: { backgroundColor: signal[1] },
  trend: { marginTop: 24, gap: 6 },
  trendLegend: { marginBottom: 2 },
  trendFacts: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  /* ⛔ 34pt IS THE FIGURE RAMP'S FIRST RUNG (the elevation pass: `tracking.figure` from ~26pt up).
     It shipped at 0 — looser than every other display figure in the product, and mono at 34 with no
     tracking reads as `4 6 . 5`. The same fault the pass found ten times over, an eleventh time. */
  bigFigure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 34, lineHeight: 38, letterSpacing: trackingPx(34, tracking.figure), color: color.textPrimary, textAlign: 'left' },
  trendMoveRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  /* A lift that has not moved — a sentence, in the muted tone, never a nought in the instrument face. */
  trendFlat: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'right' },
  trendMove: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'right' },
  trendDelta: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textPrimary, textAlign: 'right' },
  session: { marginTop: 26 },
  sessionLegend: { marginBottom: 4 },
  lift: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.border },
  liftText: { flex: 1, gap: 2 },
  liftName: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  /* The swap — a fact, in the muted tone. No clay: she was allowed to. */
  liftSwap: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  liftFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textSecondary, textAlign: 'right' },
  sessionNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'left', marginTop: 6 },
  /* Pain — the one thing on this screen drawn in clay. */
  sessionPain: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.alert, textAlign: 'left', marginTop: 6 },
  factRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.border },
  factLabel: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'left' },
  factFigure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: color.textPrimary, textAlign: 'right' },
  edit: { marginTop: 30 },
  remove: { marginTop: 8 },
  /* The UI face, not the coach's serif (design audit 2026-09-29): a sheet asking about an OPERATION is
     the app speaking — the same voice as the stage's end-workout sheet. The serif is the coach's. */
  confirmTitle: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 8 },
  confirmBody: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },
  confirmAct: { marginTop: 16, marginBottom: 6 },
});
