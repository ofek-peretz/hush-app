/**
 * Workout Detail — the read-only record of one logged session, opened from the Log
 * (v7 · 3.3b THE RECORD — FROM THE LOG). "Every lift, set by set. Facts only, no
 * grades." A centred LOG legend, the workout named in the serif, a mono facts row
 * (MIN · KCAL · T MOVED · UP), then each lift with the load it set for next time
 * (moss NEXT / muted HOLDS) over its actual logged sets as "weight×reps" chips.
 * Hush attaches no verdict to the work, and no target here can be edited. What CAN be corrected,
 * since 2026-09-09 (the formula report), is the log itself: a chip opens a sheet, the set is
 * re-written to what she says it was and stamped `amendedAt`. The engine's decisions stand.
 */

// 

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Arrive, Legend, Button, TextField } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { LB_PER_KG } from '@/domain/schedule';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { durationMinutes } from '@/domain/duration';
import { displayWeight, unitLabel, sessionDayName } from '@/domain/schedule';
import { sessionDurationSec, sessionEnergyKcal, sessionTonnageKg, tonnesFromKg } from '@/domain/sessionMetrics';
import { correctionsByPosition } from '@/domain/liveCorrections';
import type { ItemResult, Session, SetLog } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press, signal, directionTone } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

type Props = NativeStackScreenProps<MainParamList, 'WorkoutDetail'>;

type Forward = Record<string, { loadFrom: number | null; loadTo: number | null }>;

/*
 * ⛔ THIS SCREEN USED TO MEASURE ITS OWN MINUTES, AND IT MEASURED THEM OFF `sets` ALONE.
 *
 * "38 min" on the Log row, "0 min" on the record one tap later — the same workout, two screens, and
 * the record is the one that claims to BE what happened. Worse: the kcal figure hangs off that same
 * span, so the record billed an interval session at nothing. The block below draws every item she
 * did; the facts row now measures the same session the block draws. `domain/sessionMetrics`.
 */

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
      onAmend={async (ordinal, v) => {
        const ok = await db.amendSessionSet(route.params.sessionId, ordinal, v);
        if (!ok) return;
        const all = await db.loadHistory();
        setSession(all.find((x) => x.id === route.params.sessionId) ?? null);
      }}
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
  onAmend,
}: {
  session: Session | null;
  forward: Forward;
  loading: boolean;
  units: 'kg' | 'lb';
  dayName: string;
  bodyweightKg?: number;
  onBack: () => void;
  /** Re-write one set to what she says it was (kg, reps) — absent in fixtures, where the chips are read-only. */
  onAmend?: (ordinal: number, v: { weight: number | null; reps: number }) => Promise<void>;
}) {
  const { t } = useCopy();
  /** The chip she opened: its ordinal in the session's log, and the figures as typed (her units). */
  const [amend, setAmend] = useState<{ ordinal: number; weight: string; reps: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const ordinalOf = new Map<SetLog, number>();

  // Group logged sets by exercise, preserving the order they were trained.
  const order: string[] = [];
  const byEx: Record<string, SetLog[]> = {};
  (session?.sets ?? []).forEach((set, i) => ordinalOf.set(set, i));
  for (const set of session?.sets ?? []) {
    /*
     * WORKING sets only (2026-08-24). A warm-up bridge (`isApproach`) is excluded for two reasons,
     * one of them a real defect: the record counts the same sets every other surface counts (Well
     * Done, the Log, the wrist), and — worse — the bridge→work weight jump would be read by
     * `correctionsByPosition` as a Loop 1 move and drawn with an arrow, crediting the engine with
     * a change it never made.
     */
    if (set.isApproach) continue;
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
        d.toLocaleDateString(currentLocale(), { weekday: 'long' }),
        d.toLocaleDateString(currentLocale(), { day: 'numeric' }),
        d.toLocaleDateString(currentLocale(), { month: 'long' }),
      ].join(' ')
    : '';

  // ── The facts row: MIN · KCAL · T MOVED · UP ── all read from the saved session.
  const durSec = sessionDurationSec(session);
  const kcal = sessionEnergyKcal(session, bodyweightKg);
  const tonnes = (() => {
    const kg = sessionTonnageKg(session);
    // No tonnage is not "0.0 t" — a session of holds and repeats moved no bar, and the fact simply
    // has no line. (The minutes and the calories above it still do.)
    return kg > 0 ? tonnesFromKg(kg).toFixed(1) : null;
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
          {/* ✦ IT ARRIVES (2026-08-27) — see the note at `HomeView`. Two beats: which session this
              was, then what it came to. The set rows below land with the facts, because a record is
              read as one table and not dealt out row by row. */}
          <Arrive order={0}>
            <Text style={styles.title} accessibilityRole="header">{dayName}</Text>
          </Arrive>

          <Arrive order={1} style={styles.facts}>
            {/* A free-form log spans no time — "0 min" is a measurement the record never took. */}
            {durationMinutes(durSec) > 0 ? <Fact value={String(durationMinutes(durSec))} label={t('common.minShort')} /> : null}
            {kcal != null && kcal > 0 ? <Fact value={String(kcal)} label={t('complete.kcal')} /> : null}
            {tonnes != null ? <Fact value={tonnes} label={`${t('complete.tonneUnit')} ${t('complete.moved')}`} /> : null}
            {upCount > 0 ? <Fact value={String(upCount)} label={t('history.upLabel')} accent /> : null}
          </Arrive>

          <View style={styles.exercises}>
            {order.map((exId, idx) => {
              const sets = byEx[exId];
              const fwd = forward[exId];
              // The heaviest working weight logged for this lift — the load a HOLD holds at.
              const worked = sets.reduce<number | null>((mx, s) => (s.actualWeight != null && (mx == null || s.actualWeight > mx) ? s.actualWeight : mx), null);
              /* Where Loop 1 moved the load INTO a set of this lift — see the note at the chips.
                 Derived from the whole session's log so a lift trained twice in one workout is read
                 as one sequence, which is what exercise-keying means everywhere else. */
              const corrections = correctionsByPosition(session.sets ?? [], exId);
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
                  {/*
                    ════════════════════════════════════════════════════════════════════════════════
                    ⛔ THE MID-LIFT CORRECTION SURVIVES THE SESSION (2026-08-22)
                    ════════════════════════════════════════════════════════════════════════════════

                    Moving the iron between sets is the one thing this product does that nothing else
                    does — and it existed for 2.2 seconds on the stage and then **nowhere**. The
                    finish ledger reports Loop 2 (what the NEXT occurrence gets); the Saturday letter
                    mirrors the week; and this record, which claims to BE what happened, printed her
                    sets as flat chips. A reader could see the weight change between chip two and
                    chip three and had no way to know whether she had moved it or the engine had.

                    ⚠️ IT IS A READ, NOT A NEW FIELD. `domain/liveCorrections` derives it from what
                    every set already stores, and subtracts her own carry-forward first — a record
                    that credited the engine with a weight SHE reached for would be worse than one
                    that said nothing.

                    ⚠️ AND IT IS SAID IN TODAY'S GRAMMAR, not a new one: the glyph carries the
                    direction and `directionTone` colours it, exactly as a changed load is drawn on
                    the first screen she opens. Nothing here is a word.
                  */}
                  <View style={styles.chips}>
                    {sets.map((set, i) => {
                      const w = displayWeight(set.actualWeight, units);
                      const moved = corrections.get(i + 1);
                      const ordinal = ordinalOf.get(set) ?? -1;
                      return (
                        <Pressable
                          key={i}
                          style={({ pressed }) => [styles.chip, pressed && onAmend && { opacity: press.opacity }]}
                          disabled={!onAmend || ordinal < 0}
                          accessibilityRole={onAmend ? 'button' : undefined}
                          accessibilityLabel={onAmend ? t('history.amendTitle') : undefined}
                          onPress={() => setAmend({ ordinal, weight: w != null ? String(w) : '', reps: String(set.actualReps) })}
                        >
                          {moved ? (
                            <Text
                              style={[styles.chipMark, { color: directionTone(moved.direction) }]}
                              accessibilityLabel={t(
                                moved.direction === 'up' ? 'history.movedUp' : 'history.movedDown',
                              )}
                            >
                              {moved.direction === 'up' ? '↑' : '↓'}
                            </Text>
                          ) : null}
                          {w != null ? <Text style={styles.chipNum}>{`${w}×${set.actualReps}`}</Text> : <Text style={styles.chipNum}>{`×${set.actualReps}`}</Text>}
                          {/* The clock's mark, kept in the record she reads back (2026-09-07): a set
                              nobody stood behind is drawn as the plan's number, and says so. */}
                          {set.presumed ? <Text style={styles.chipTag}>{t('workout.presumedCell')}</Text> : null}
                          {set.amendedAt ? <Text style={styles.chipTag}>{t('history.amendedTag')}</Text> : null}
                        </Pressable>
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
      {amend && onAmend ? (
        /* The correction sheet — two figures in her units, one verb. A blank weight is bodyweight. */
        <BottomSheet onClose={() => setAmend(null)} heightFraction={0.46}>
          <Text style={styles.amendTitle}>{t('history.amendTitle')}</Text>
          <View style={styles.amendFields}>
            <TextField
              label={`${t('history.amendWeight')} · ${unitLabel(units)}`}
              value={amend.weight}
              keyboardType="decimal-pad"
              onChangeText={(weight) => setAmend((a) => (a ? { ...a, weight } : a))}
              block
            />
            <TextField
              label={t('history.amendReps')}
              value={amend.reps}
              keyboardType="number-pad"
              onChangeText={(reps) => setAmend((a) => (a ? { ...a, reps } : a))}
              block
            />
          </View>
          <Button
            variant="primary"
            block
            label={t('history.amendSave')}
            disabled={saving || !(Number(amend.reps) >= 1)}
            onPress={() => {
              const shown = amend.weight.trim() === '' ? null : Number(amend.weight.replace(',', '.'));
              if (shown != null && !Number.isFinite(shown)) return;
              const weightKg = shown == null ? null : units === 'lb' ? Math.round((shown / LB_PER_KG) * 100) / 100 : shown;
              setSaving(true);
              void onAmend(amend.ordinal, { weight: weightKg, reps: Math.round(Number(amend.reps)) }).finally(() => {
                setSaving(false);
                setAmend(null);
              });
            }}
          />
        </BottomSheet>
      ) : null}
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
      <Legend size={17} tone={accent ? 'accent' : 'muted'}>{label}</Legend>
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
  badgeLabel: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted }, // rtl-ok: nested span inside badge, which sets textAlign
  badgeLabelUp: { color: signal[0] },
  badgeNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textMuted }, // rtl-ok: nested span inside badge, which sets textAlign
  badgeNumUp: { color: signal[0] },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  /*
   * ⛔ THE CHIP WAS A COLUMN, AND EVERY MARKED SET SAT A LINE LOWER THAN THE REST (2026-08-27).
   *
   * No `flexDirection`, so React Native's default — `column` — stacked the direction glyph ABOVE the
   * figure. Measured on `3.3b`: three chips on one row, `44×8` and `44×6` with their figures at
   * y=399, and the eased set drawing `↓` at 399 with `41×8` **twenty-two points below it**. A row
   * whose whole job is to be read as a sequence had one of its sets off the line, and every plain
   * chip carried an empty second line to match its height.
   *
   * ⚠️ AND `chipMark` SAYS WHAT WAS MEANT: `marginEnd: 3`. An END margin is air toward a horizontal
   * neighbour — it can only have been written for a glyph sitting BESIDE the figure, and in a column
   * it did nothing at all. The style was right about the design and the container never agreed.
   */
  chip: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 5, paddingHorizontal: 11, backgroundColor: CHIP_BG, borderRadius: 100 },
  chipNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textMuted, textAlign: 'left' },
  /* Her word on the set, beside its figures — sans (it is a WORD; mono carries no words), quieter
     than the number it annotates. */
  /* The direction glyph on a chip Loop 1 moved into. Mono, because it sits on the figure's baseline
     and the chip is a reading; the COLOUR comes from `directionTone` at the call site, so this row
     can never hold an opinion about direction the rest of the app does not share. */
  chipMark: { fontFamily: font.monoMedium, fontSize: 17, lineHeight: 22, marginEnd: 3, textAlign: 'left' },
  /* "counted as written" beside a presumed set's figures — a word, so sans, and the chip's quietest ink. */
  chipTag: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, marginStart: 6, textAlign: 'left' },
  amendTitle: { fontFamily: font.serif, fontSize: 24, lineHeight: 28, color: color.textPrimary, textAlign: 'left', marginBottom: 16 },
  amendFields: { gap: 14, marginBottom: 22 },

  footer: { marginTop: 'auto', paddingTop: 26, fontFamily: font.serif, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});
