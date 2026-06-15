/**
 * 1.20 Program. Shows Hush's output: frequency, the day list, and — only when
 * something material changed — the applied-change line (Undo) and/or the
 * frame-change decision (veto). No line when nothing changed (spec §3.6, §5.5 R7).
 *
 * Reached from Profile -> Program and from the Weekly Program Ready notification.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProgramChangeCard } from '@/components/ProgramChangeCard';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import type { ProgramChange } from '@/data/local/models';
import { color, layout, press, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Program'>;

export function Program({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const program = app.program;
  const [changes, setChanges] = useState<ProgramChange[] | null>(null);

  useEffect(() => {
    void track('program_viewed', {});
    app.model
      .programChanges({ completedSessions: app.modeState.completedSessions })
      .then(setChanges);
  }, [app.model, app.modeState.completedSessions]);

  // C5 (ratified 2026-06-15): a program change may be ACKNOWLEDGED, VETOED, or IGNORED.
  // EVERY response is stored as DATA for learning + trust measurement and must NEVER alter
  // model state or future recommendations (not user-controlled progression). So each response
  // is a research event (telemetry → athlete_event); the card removal below is purely cosmetic
  // (dismisses the line) and changes no program. `respondedRef`/`changesRef` let us also record
  // the IGNORED case — a change shown but left un-acted-upon when the athlete leaves the screen.
  const respondedRef = useRef<Set<string>>(new Set());
  const changesRef = useRef<ProgramChange[]>([]);
  changesRef.current = changes ?? [];

  const removeCard = (id: string) => setChanges((cs) => (cs ?? []).filter((c) => c.id !== id));

  const record = (id: string, action: 'acknowledged' | 'vetoed' | 'ignored') => {
    const c = changesRef.current.find((x) => x.id === id);
    void track('program_change_response', {
      changeId: id,
      kind: c?.kind,
      target: c?.capabilityOrTarget,
      action,
    });
  };

  const respond = (id: string, action: 'acknowledged' | 'vetoed') => {
    respondedRef.current.add(id);
    record(id, action);
    removeCard(id);
  };
  const onUndo = (id: string) => respond(id, 'vetoed'); // rejecting a load change
  const onGotIt = (id: string) => respond(id, 'acknowledged'); // frame acknowledged
  const onKeepAsIs = (id: string) => respond(id, 'vetoed'); // frame vetoed

  // IGNORED: on leaving the screen, record any change that was shown but never acted upon.
  // Mounted once — reads the latest changes/responded via refs (no stale closure).
  useEffect(
    () => () => {
      for (const c of changesRef.current) {
        if (!respondedRef.current.has(c.id)) record(c.id, 'ignored');
      }
    },
    [],
  );

  if (!program) return <SafeAreaView style={styles.root} />;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.frequency}>{t('program.frequency', { n: program.frequency })}</Text>

        {/* Intelligence line(s) appear ONLY when material — never "no changes". */}
        {(changes ?? []).map((c) => (
          <ProgramChangeCard key={c.id} change={c} onUndo={onUndo} onGotIt={onGotIt} onKeepAsIs={onKeepAsIs} />
        ))}

        <View style={styles.days}>
          {program.days.map((d, i) =>
            d.isRest ? (
              <View key={d.id} style={styles.dayRow}>
                <Text style={styles.restName}>{t('program.restDay')}</Text>
              </View>
            ) : (
              <View key={d.id} style={styles.dayRowWrap}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('ProgramDetail', { dayId: d.id })}
                  style={({ pressed }) => [styles.dayMain, { opacity: pressed ? press.opacity : 1 }]}
                >
                  <Text style={styles.dayName}>{d.name}</Text>
                  <Text style={styles.dayMeta}>{d.muscleGroups.join(' · ')}</Text>
                </Pressable>
                {/* Athlete-owned workout order (Athlete > Model; persists across weeks). */}
                <View style={styles.reorder}>
                  {i > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('program.moveUp')}
                      onPress={() => void app.reorderWorkouts(i, i - 1)}
                      style={({ pressed }) => [styles.arrow, { opacity: pressed ? press.opacity : 1 }]}
                    >
                      <Text style={styles.arrowText}>↑</Text>
                    </Pressable>
                  ) : null}
                  {i < program.days.length - 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('program.moveDown')}
                      onPress={() => void app.reorderWorkouts(i, i + 1)}
                      style={({ pressed }) => [styles.arrow, { opacity: pressed ? press.opacity : 1 }]}
                    >
                      <Text style={styles.arrowText}>↓</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ),
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  body: { paddingTop: 24, paddingHorizontal: layout.screenMargin, paddingBottom: 48 },
  frequency: { color: color.textSecondary, fontSize: typo.bodyM.size, marginBottom: 24 },
  days: { marginTop: 8 },
  dayRow: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle },
  dayRowWrap: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle },
  dayMain: { flex: 1, paddingVertical: 16 },
  dayName: { color: color.textPrimary, fontSize: typo.titleM.size },
  dayMeta: { color: color.textSecondary, fontSize: typo.caption.size, marginTop: 4 },
  restName: { color: color.textTertiary, fontSize: typo.titleM.size },
  reorder: { flexDirection: 'row', alignItems: 'center' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: color.textSecondary, fontSize: typo.titleM.size },
});
