/**
 * Workout Detail — the read-only record of one logged session, opened from the Log
 * (v7 · 3.3b THE RECORD — FROM THE LOG). "Every lift, set by set. Facts only, no
 * grades." A centred LOG legend, the workout named in the serif, a mono facts row
 * (MIN · KCAL · T MOVED · UP), then each lift with the load it set for next time
 * (moss NEXT / muted HOLDS) over its actual logged sets as "weight×reps" chips.
 * Immutable — no targets to edit, and Hush attaches no verdict to the work.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { durationMinutes } from '@/domain/duration';
import { displayWeight, unitLabel, sessionDayName } from '@/domain/schedule';
import { sessionKcal } from '@/domain/energy';
import type { ItemResult, Session, SetLog } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WorkoutDetail'>;

type Forward = Record<string, { loadFrom: number | null; loadTo: number | null }>;

/** Wall-clock seconds from the session's start to its last logged set. */
function durationSec(s: Session): number {
  if (s.sets.length === 0) return 0;
  const last = Date.parse(s.sets[s.sets.length - 1].persistedAt);
  return Math.max(0, Math.round((last - Date.parse(s.startedAt)) / 1000));
}

export function WorkoutDetail({ navigation, route }: Props) {
  const app = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [forward, setForward] = useState<Forward>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    db.loadHistory().then((all) => {
      if (!active) return;
      const s = all.find((x) => x.id === route.params.sessionId) ?? null;
      setSession(s);
      setLoading(false);
      // The forward loads this occurrence set — read back from the engine's own stamped fold
      // (never recomputed here). A held lift has no entry; its badge falls back to "HOLDS".
      if (s) {
        // Through the SEAM (`app.model`), never the fixture directly. Reaching past it works today
        // only because the fixture IS the model; the moment a backend client is selected this screen
        // would keep reading the local engine while every other surface moved on, and nothing would
        // fail — it would just quietly show a different set of numbers than the rest of the app.
        app.model
          .sessionForward?.({ startedAtMs: Date.parse(s.startedAt) })
          .then((f) => active && setForward(f ?? {}))
          .catch(() => active && setForward({}));
      }
    });
    return () => {
      active = false;
    };
  }, [route.params.sessionId]);

  return (
    <WorkoutDetailView
      session={session}
      forward={forward}
      loading={loading}
      units={app.profile?.units ?? 'kg'}
      dayName={session ? sessionDayName(session) : ''}
      bodyweightKg={app.profile?.weightKg}
      onBack={() => navigation.goBack()}
    />
  );
}

/**
 * 3.3b · THE RECORD, as a pure view.
 *
 * Split from the container so the gallery can draw a real record: everything here is one saved
 * session plus the engine log that session stamped, and a harness has neither.
 */
export function WorkoutDetailView({
  session,
  forward,
  loading,
  units,
  dayName,
  bodyweightKg,
  onBack,
}: {
  session: Session | null;
  forward: Forward;
  loading: boolean;
  units: 'kg' | 'lb';
  dayName: string;
  bodyweightKg?: number;
  onBack: () => void;
}) {
  const { t } = useCopy();

  // Group logged sets by exercise, preserving the order they were trained.
  const order: string[] = [];
  const byEx: Record<string, SetLog[]> = {};
  for (const set of session?.sets ?? []) {
    if (!byEx[set.exerciseId]) {
      byEx[set.exerciseId] = [];
      order.push(set.exerciseId);
    }
    byEx[set.exerciseId].push(set);
  }

  /**
   * Everything she did that was NOT a set, in the order she met it — see the block that draws it.
   * A reps item is already above, grouped with its lift, so it is skipped here.
   */
  const other = (session?.items ?? []).filter((i) => i.kind !== 'reps');

  const d = session ? new Date(session.startedAt) : null;
  // "SATURDAY 18 JULY" — weekday, day, month, composed to avoid the locale comma.
  const dateLabel = d
    ? [
        d.toLocaleDateString(undefined, { weekday: 'long' }),
        d.toLocaleDateString(undefined, { day: 'numeric' }),
        d.toLocaleDateString(undefined, { month: 'long' }),
      ].join(' ')
    : '';

  // ── The facts row: MIN · KCAL · T MOVED · UP ── all read from the saved session.
  const durSec = session ? durationSec(session) : 0;
  const kcal = session ? sessionKcal(session, durSec * 1000, bodyweightKg) : null;
  const tonnes = (() => {
    const kg = (session?.sets ?? []).reduce((sum, s) => sum + (s.actualWeight ?? 0) * s.actualReps, 0);
    return kg > 0 ? (kg / 1000).toFixed(1) : null;
  })();
  // UP = lifts whose next load the engine set ABOVE what it held before (a progression).
  const upCount = Object.values(forward).filter((f) => f.loadFrom != null && f.loadTo != null && f.loadTo > f.loadFrom).length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        {session ? <Legend align="center" style={styles.headLegend}>{`${t('history.logLabel')} · ${dateLabel}`}</Legend> : <View style={styles.headLegend} />}
        <View style={styles.headSpacer} />
      </View>

      {loading || !session ? null : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title} accessibilityRole="header">{dayName}</Text>

          <View style={styles.facts}>
            <Fact value={String(durationMinutes(durSec))} label={t('common.minShort')} />
            {kcal != null ? <Fact value={String(kcal)} label={t('complete.kcal')} /> : null}
            {tonnes != null ? <Fact value={tonnes} label={`${t('complete.tonneUnit')} ${t('complete.moved')}`} /> : null}
            {upCount > 0 ? <Fact value={String(upCount)} label={t('history.upLabel')} accent /> : null}
          </View>

          <View style={styles.exercises}>
            {order.map((exId, idx) => {
              const sets = byEx[exId];
              const fwd = forward[exId];
              // The heaviest working weight logged for this lift — the load a HOLD holds at.
              const worked = sets.reduce<number | null>((mx, s) => (s.actualWeight != null && (mx == null || s.actualWeight > mx) ? s.actualWeight : mx), null);
              const rose = fwd?.loadFrom != null && fwd?.loadTo != null && fwd.loadTo > fwd.loadFrom;
              const nextLoad = fwd?.loadTo != null ? displayWeight(fwd.loadTo, units) : null;
              const holdLoad = worked != null ? displayWeight(worked, units) : null;
              return (
                <View key={exId} style={[styles.exercise, idx === order.length - 1 ? styles.exerciseLast : styles.exerciseBorder]}>
                  <View style={styles.exHead}>
                    <Text style={styles.exName} numberOfLines={1}>{exerciseDisplayName(exId)}</Text>
                    {nextLoad != null ? (
                      <Text style={styles.badge}>
                        <Text style={[styles.badgeLabel, rose && styles.badgeLabelUp]}>{t('history.nextBadge')}: </Text>
                        <Text style={[styles.badgeNum, rose && styles.badgeNumUp]}>{nextLoad}</Text>
                      </Text>
                    ) : holdLoad != null ? (
                      <Text style={styles.badge}>
                        <Text style={styles.badgeLabel}>{t('history.holdsBadge')} </Text>
                        <Text style={styles.badgeNum}>{holdLoad}</Text>
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.chips}>
                    {sets.map((set, i) => {
                      const w = displayWeight(set.actualWeight, units);
                      return (
                        <View key={i} style={styles.chip}>
                          {w != null ? <Text style={styles.chipNum}>{`${w}×${set.actualReps}`}</Text> : <Text style={styles.chipNum}>{`×${set.actualReps}`}</Text>}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {/* ════ AND EVERYTHING THAT WAS NOT A SET ════
                ⚠️ THIS SCREEN GROUPED `sets` AND NOTHING ELSE. An interval session — a warm-up, six
                400 m repeats, a cool-down — logs no `SetLog`, so tapping its row in the Log opened a
                page with an empty body: her whole workout, saved and counted, rendered as nothing.
                One row per item, in the order she met them, saying what she actually did. */}
            {other.map((item, idx) => (
              <View
                key={`${item.ex}-${idx}`}
                style={[styles.exercise, idx === other.length - 1 ? styles.exerciseLast : styles.exerciseBorder]}
              >
                <View style={styles.exHead}>
                  <Text style={styles.exName} numberOfLines={1}>{exerciseDisplayName(item.ex)}</Text>
                </View>
                <View style={styles.chips}>
                  <View style={styles.chip}>
                    <Text style={styles.chipNum}>{didOf(item)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* honest close — the record is not coached */}
          <Text style={styles.footer}>{t('history.recordFooter')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * What she actually did, in the shape's own unit — the one figure a non-set item has.
 *
 * Metres under a kilometre and kilometres above it, the same reading `ItemStage` gives her while she
 * is doing it: a record that says "5000 m" for the run the screen called "5 km" is the same fact in
 * a voice she did not hear.
 */
function didOf(item: ItemResult): string {
  switch (item.kind) {
    case 'time': {
      const s = Math.max(0, Math.round(item.seconds));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    case 'distance':
      return item.metres >= 1000
        ? `${Number.isInteger(item.metres / 1000) ? item.metres / 1000 : (item.metres / 1000).toFixed(1)} km`
        : `${Math.round(item.metres)} m`;
    case 'reps':
      return `×${item.reps}`;
    case 'open':
      // No number was worth stating when it was prescribed, and inventing one now would be worse.
      return '·';
  }
}

/** One inline fact — a mono figure with its sans meta label (MIN / KCAL / T MOVED / UP). */
function Fact({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factVal, accent && styles.factValUp]}>{value}</Text>
      <Legend size={11} tone={accent ? 'accent' : 'muted'}>{label}</Legend>
    </View>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.12)';
const CHIP_BG = 'rgba(241,238,229,0.10)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 4,
    paddingTop: 6,
    paddingBottom: 2,
    minHeight: 44,
  },
  back: { width: 22, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headLegend: { flex: 1 },
  headSpacer: { width: 22 },
  // flexGrow so the closing line can be pushed to the FOOT of the page (the handoff's margin-top:auto)
  // on a short record, while a long one still scrolls it into place after the last lift.
  body: { flexGrow: 1, paddingTop: 16, paddingHorizontal: space.gutter, paddingBottom: 44 },

  // v7 (2026-07-22): the record's headline is the serif — the workout named in the coach's voice.
  title: { fontFamily: font.serif, fontSize: textScale['4xl'], lineHeight: Math.round(textScale['4xl'] * 1.05), color: color.textPrimary, textAlign: 'left' },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  factVal: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  factValUp: { fontFamily: font.monoMedium, color: signal[0] }, // rtl-ok: merged onto factVal, which sets textAlign

  exercises: { marginTop: 20 },
  exercise: { paddingVertical: 14, gap: 8 },
  exerciseBorder: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  exerciseLast: { borderTopWidth: 1, borderTopColor: HAIRLINE, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  exHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  exName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  badge: { textAlign: 'left' },
  // "Next" / "Holds" are words (he: "הבא" / "נשאר") — sans, never mono.
  badgeLabel: { fontFamily: font.sansMedium, fontSize: 15, color: color.textMuted }, // rtl-ok: nested span inside badge, which sets textAlign
  badgeLabelUp: { color: signal[0] },
  badgeNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 15, color: color.textMuted }, // rtl-ok: nested span inside badge, which sets textAlign
  badgeNumUp: { color: signal[0] },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 5, paddingHorizontal: 11, backgroundColor: CHIP_BG, borderRadius: 100 },
  chipNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 15, color: color.textMuted, textAlign: 'left' },

  footer: { marginTop: 'auto', paddingTop: 26, fontFamily: font.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});
