/**
 * Internal debug / QA screen (DEV only) — dumps every Hush v4 per-slot state field for the
 * TestFlight verification pass. Reachable from Settings only under __DEV__. Not user-facing; uses
 * plain literals (no i18n) by design.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { getDebugState, type V4DebugState } from '@/engine/v4/v4Engine';
import { isV4Enabled } from '@/engine/v4/flag';
import { exerciseDisplayName } from '@/data/exercises';
import type { SlotState } from '@/engine/v4/types';
import { color, space, font, textScale } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'V4Debug'>;
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const bestE1rm = (s: SlotState): number => s.history.reduce((m, w) => Math.max(m, w.e1rm_week), 0);

function Field({ k, v }: { k: string; v: string | number | boolean | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fk}>{k}</Text>
      <Text style={styles.fv}>{String(v)}</Text>
    </View>
  );
}

export function V4Debug({ navigation }: Props) {
  const [state, setState] = useState<V4DebugState | null>(null);
  useEffect(() => {
    void getDebugState().then(setState);
  }, []);

  return (
    <SafeAreaView style={styles.canvas} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={HIT} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="chevronLeft" size={28} color={color.textPrimary} />
        </Pressable>
        <Text style={styles.title}>v4 engine state</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.meta}>flag: {isV4Enabled() ? 'ON' : 'OFF'}</Text>
        {state && (
          <>
            <Text style={styles.meta}>
              global · daysSinceLast {state.global.days_since_last_session} · injury {String(!!state.global.injury_flag)} · lastAdvanceAt{' '}
              {state.lastAdvanceAt}
            </Text>
            <Text style={styles.meta}>
              lastUpdate · {state.lastUpdate ? `wk ${state.lastUpdate.weekIndex} · ${state.lastUpdate.changes} changes · seen ${String(state.lastUpdate.seen)}` : 'none'}
            </Text>
            <Text style={styles.count}>{state.slots.length} slots</Text>

            {state.slots.map((s) => (
              <View key={s.slotId} style={styles.card}>
                <Text style={styles.slotName}>
                  {exerciseDisplayName(s.current_exercise_id)} · {s.pattern}
                </Text>
                <Text style={styles.slotId}>{s.slotId}</Text>
                <Field k="load_kg" v={s.current_load_kg} />
                <Field k="rep_target" v={s.rep_target} />
                <Field k="rep_range" v={`[${s.rep_range[0]},${s.rep_range[1]}]`} />
                <Field k="sets" v={s.current_sets} />
                <Field k="calibrating" v={s.calibrating} />
                <Field k="calib_weeks" v={s.calib_weeks} />
                <Field k="miss_streak" v={s.miss_streak} />
                <Field k="flat_weeks" v={s.flat_weeks} />
                <Field k="hold_mode" v={s.hold_mode} />
                <Field k="levers_tried" v={s.levers_tried.join(',') || '—'} />
                <Field k="tenure_weeks" v={s.tenure_weeks} />
                <Field k="weeks_since_swap" v={s.weeks_since_swap} />
                <Field k="locked" v={s.locked} />
                <Field k="best_e1rm" v={Math.round(bestE1rm(s) * 10) / 10} />
                <Field k="history" v={`${s.history.length} wk`} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space.gutter, paddingTop: space[2], paddingBottom: space[1] },
  title: { color: color.textPrimary, fontFamily: font.sansSemibold, fontSize: textScale.lg },
  scroll: { paddingHorizontal: space.gutter, paddingBottom: space[10] },
  meta: { color: color.textSecondary, fontFamily: font.mono, fontSize: textScale.xs, marginBottom: space[1] },
  count: { color: color.textPrimary, fontFamily: font.mono, fontSize: textScale.sm, marginTop: space[2], marginBottom: space[2] },
  card: { backgroundColor: color.bgSurface, borderRadius: 12, padding: space[4], marginBottom: space[3] },
  slotName: { color: color.textPrimary, fontFamily: font.sansSemibold, fontSize: textScale.base },
  slotId: { color: color.textTertiary, fontFamily: font.mono, fontSize: textScale['2xs'], marginBottom: space[2] },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  fk: { color: color.textSecondary, fontFamily: font.mono, fontSize: textScale.xs },
  fv: { color: color.textPrimary, fontFamily: font.mono, fontSize: textScale.xs },
});
