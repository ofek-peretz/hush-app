/**
 * ════ FREE-FORM LOG — "I trained without you; keep it" (founder authorization, 2026-08-24) ════
 *
 * The competitive gap this closes, verbatim from the review: "מי שסטתה מהתוכנית היום — האימון
 * אבוד לה". A hotel gym, a friend's rack, a PR day — until now the one fact she can never get
 * back had nowhere to live unless Hush prescribed it. Every serious logger keeps it; now the
 * record does too, on the record's own terms (models.ts `Session.freeform`):
 *
 *   · KEPT WHOLE — History, tonnage, the weeks count, the milestones. A free-logged single can
 *     strike a club: a PR day is exactly what the clubs are for.
 *   · FOLDED BY NOTHING — the engine coaches its own programme. A fun max attempt must never
 *     read as a failed floor, so `advanceV5` skips `freeform` sessions entirely.
 *   · NEVER A FUNNEL — logging what she already did burns no trial session and completes no
 *     planned workout. The trial gates coached training, not her right to her own record.
 *
 * The composer is one moving part, on Strong's lesson (speed is retention): pick a lift, set the
 * two wheels, tap "Add set" — the set lands as a chip and the wheels HOLD their values, so a
 * straight 3×8 is three taps. Split container/View so the gallery can host the composer with
 * fixtures, the same seam every screen here keeps.
 */

//

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Arrive, Button, Legend, WheelPicker } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, space, textScale } from '@/design/tokens';
import { EXERCISES, exerciseDisplayName, type Exercise } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import { emptyBarKg } from '@/engine/loadMath';
import { db } from '@/data/local/db';
import { cloudAutoBackup } from '@/platform/cloudBackup';
import { track } from '@/platform/telemetry';
import { tg } from '@/i18n';
import type { Session, SetLog, Units } from '@/data/local/models';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainParamList } from '@/app/navigation';
import { useApp } from '@/state/stores/appStore';

export interface FreeSet {
  exerciseId: string;
  weightKg: number | null; // null = bodyweight
  reps: number;
}

/** Build the saved session from the composer's sets — exported pure, so the law can hold it. */
export function freeSessionOf(sets: readonly FreeSet[], nowIso: string, name: string): Session {
  const perExercise = new Map<string, number>();
  const logs: SetLog[] = sets.map((s) => {
    const idx = perExercise.get(s.exerciseId) ?? 0;
    perExercise.set(s.exerciseId, idx + 1);
    return {
      exerciseId: s.exerciseId,
      setIndex: idx,
      recommendedWeight: s.weightKg,
      recommendedReps: s.reps,
      actualWeight: s.weightKg,
      actualReps: s.reps,
      edited: false,
      persistedAt: nowIso,
    };
  });
  return {
    id: `free_${Date.parse(nowIso)}`,
    programDayId: 'free_log',
    programDayName: name,
    startedAt: nowIso,
    state: 'SAVED',
    earlyFinish: false,
    trained: true, // she trained — the workout count and the weeks count are hers
    freeform: true, // …and the engine folds none of it (models.ts)
    sets: logs,
  } as Session;
}

export function FreeLogScreen({ navigation }: NativeStackScreenProps<MainParamList, 'FreeLog'>) {
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  return (
    <FreeLogView
      units={units}
      onBack={() => navigation.goBack()}
      onSave={async (sets) => {
        const session = freeSessionOf(sets, new Date().toISOString(), tg('freeLog.title'));
        await db.appendCompletedSession(session);
        // Every record change reaches the cloud — the same promise every completion keeps.
        void cloudAutoBackup();
        void track('free_log_saved', { sets: sets.length, lifts: new Set(sets.map((s) => s.exerciseId)).size });
        navigation.goBack();
      }}
    />
  );
}

export function FreeLogView({
  units,
  onBack,
  onSave,
}: {
  units: Units;
  onBack: () => void;
  onSave: (sets: FreeSet[]) => void | Promise<void>;
}) {
  const { t } = useCopy();
  const [sets, setSets] = useState<FreeSet[]>([]);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [weightKg, setWeightKg] = useState<number>(20);
  const [reps, setReps] = useState<number>(8);
  const [saving, setSaving] = useState(false);

  /*
   * The picker searches HER words: the localized display name (Hebrew included) and the catalog
   * name both match, so "חתירה" and "row" find the same iron.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = EXERCISES.filter((e) => !e.id.startsWith('_'));
    if (!q) return all;
    return all.filter(
      (e) => exerciseDisplayName(e.id).toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
    );
  }, [query]);

  const bodyweight = exercise?.equipment === 'bodyweight';
  const wStep = exercise ? STARTING_INCREMENT[exercise.equipment] || 0.5 : 2.5;
  const wMin = exercise ? emptyBarKg(exercise.equipment) : 0; // per-family floor (F-19)

  const pick = (e: Exercise) => {
    setExercise(e);
    setPicking(false);
    setQuery('');
    const floor = emptyBarKg(e.equipment);
    if (floor > 0 && weightKg < floor) setWeightKg(floor);
  };

  const addSet = () => {
    if (!exercise) return;
    setSets((prev) => [...prev, { exerciseId: exercise.id, weightKg: bodyweight ? null : weightKg, reps }]);
    // The wheels HOLD — a straight 3×8 is three taps (Strong's lesson: speed is retention).
  };

  /** The ledger below the composer — her sets so far, grouped by lift, newest lift last. */
  const grouped = useMemo(() => {
    const order: string[] = [];
    const byId = new Map<string, FreeSet[]>();
    sets.forEach((s) => {
      if (!byId.has(s.exerciseId)) {
        byId.set(s.exerciseId, []);
        order.push(s.exerciseId);
      }
      byId.get(s.exerciseId)!.push(s);
    });
    return order.map((id) => ({ id, rows: byId.get(id)! }));
  }, [sets]);

  const removeSet = (target: FreeSet) => setSets((prev) => prev.filter((s) => s !== target));

  const weightLegend = `${t('editResult.weight')} · ${unitLabel(units)}`.toUpperCase();
  const repsLegend = t('editResult.repsLabel').toUpperCase();
  const weightVal = displayWeight(weightKg, units) ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={12} onPress={onBack}>
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        {/* ✦ IT ARRIVES (2026-08-27) — `Arrive` was built for the founder's largest note, that a
            screen should ARRIVE rather than appear (2026-08-12). See `HomeView` for the account. */}
        <Arrive order={0}>
          <Text style={styles.title} accessibilityRole="header">{t('freeLog.title')}</Text>
        </Arrive>
        <View style={styles.headerGap} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>{t('freeLog.lede')}</Text>

        {/* THE LIFT — one row that names it, or opens the search. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('freeLog.pickLift')}
          onPress={() => setPicking((p) => !p)}
          style={({ pressed }) => [styles.liftRow, pressed && styles.rowPressed]}
        >
          <Text style={exercise ? styles.liftName : styles.liftPlaceholder}>
            {exercise ? exerciseDisplayName(exercise.id) : t('freeLog.pickLift')}
          </Text>
          <Icon name={picking ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} strokeWidth={1.8} />
        </Pressable>

        {picking ? (
          <View style={styles.picker}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={t('freeLog.searchLift')}
              placeholderTextColor={color.textTertiary}
              accessibilityLabel={t('freeLog.searchLift')}
            />
            {matches.slice(0, 30).map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => pick(e)}
                style={({ pressed }) => [styles.pickRow, pressed && styles.rowPressed]}
              >
                <Text style={styles.pickName}>{exerciseDisplayName(e.id)}</Text>
                <Legend size={17} track={0.08}>{t(`muscle.${e.muscle}`)}</Legend>
              </Pressable>
            ))}
          </View>
        ) : null}

        {exercise ? (
          <View style={styles.composer}>
            <View style={styles.dials}>
              {!bodyweight ? (
                <View style={styles.dial}>
                  <Legend size={17} track={0.1} style={styles.dialLegend}>{weightLegend}</Legend>
                  <WheelPicker
                    value={weightVal}
                    onChange={(v) => setWeightKg(units === 'lb' ? +(v / 2.2046226).toFixed(1) : v)}
                    step={units === 'kg' ? wStep : 5}
                    min={units === 'kg' ? wMin : Math.round(wMin * 2.2046226)}
                    max={units === 'kg' ? 500 : 1100}
                    size="md"
                    ends="chevron"
                    label={weightLegend}
                  />
                </View>
              ) : null}
              <View style={styles.dial}>
                <Legend size={17} track={0.1} style={styles.dialLegend}>{repsLegend}</Legend>
                <WheelPicker value={reps} onChange={setReps} step={1} min={1} max={50} size="md" ends="chevron" label={repsLegend} />
              </View>
            </View>
            <Button variant="secondary" block label={t('freeLog.addSet')} onPress={addSet} />
          </View>
        ) : null}

        {grouped.map(({ id, rows }) => (
          <View key={id} style={styles.entry}>
            <Text style={styles.entryName}>{exerciseDisplayName(id)}</Text>
            <View style={styles.chips}>
              {rows.map((s, i) => {
                const w = displayWeight(s.weightKg, units);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={t('freeLog.removeSet')}
                    onLongPress={() => removeSet(s)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipNum}>{w != null ? `${w}×${s.reps}` : `×${s.reps}`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {sets.length > 0 ? <Text style={styles.removeHint}>{t('freeLog.removeHint')}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="crossing"
          block
          disabled={sets.length === 0 || saving}
          label={t('freeLog.save')}
          onPress={async () => {
            if (saving) return;
            setSaving(true);
            try {
              await onSave(sets);
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[5], paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, fontFamily: font.serif, fontSize: textScale.xl, color: color.textPrimary, textAlign: 'center' },
  headerGap: { width: 22 },
  body: { paddingHorizontal: space[5], paddingBottom: 24, gap: 14 },
  lede: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textMuted, textAlign: 'left' },
  rowPressed: { backgroundColor: color.fillSubtle },
  liftRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: color.border, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  liftName: { fontFamily: font.sansSemibold, fontSize: 19, color: color.textPrimary, textAlign: 'left' },
  liftPlaceholder: { fontFamily: font.sans, fontSize: 19, color: color.textTertiary, textAlign: 'left' },
  picker: { borderWidth: 1, borderColor: color.border, borderRadius: 14, overflow: 'hidden' },
  search: {
    fontFamily: font.sans, fontSize: 17, color: color.textPrimary, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: color.border, textAlign: 'left',
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border,
  },
  pickName: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  composer: { gap: 12 },
  dials: { flexDirection: 'row', gap: 14 },
  dial: { flex: 1, gap: 6 },
  dialLegend: { color: color.textMuted },
  entry: { gap: 8 },
  entryName: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: color.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  // Matches `WorkoutDetail.chipNum` exactly, including the alignment it drifted away from: a set
  // figure is a mono number that reads LTR in both languages, and its twin one screen over says
  // so. Without it the free log's sets flipped in Hebrew while the programme's did not.
  chipNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textMuted, textAlign: 'left' },
  removeHint: { fontFamily: font.sans, fontSize: 17, color: color.textTertiary, textAlign: 'left' },
  footer: { paddingHorizontal: space[5], paddingBottom: 30, paddingTop: 8 },
});
