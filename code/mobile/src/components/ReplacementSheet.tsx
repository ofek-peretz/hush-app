/**
 * Replacement surface (UX §1). A single sheet "Replace [exercise]": a search
 * field, then — when empty — Recommended / Your exercises / All [capability]
 * exercises. Search is incremental and ALWAYS in-class (never breaks the
 * capability, §1.2). Every result is valid and selectable.
 *
 * Deliberate (from Program Detail): tap a row -> staged with its resolved target
 * -> "Use [exercise]" confirms (§1.9). Mid-session (from Transition Rest): a
 * Recommended tap swaps in place immediately, lighter (§1.10).
 *
 * Dismissal (swipe-down / tap-outside) = cancellation, no change (§1.11).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { track } from '@/platform/telemetry';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCopy } from '@/i18n/useCopy';
import type { Capability, Units } from '@/data/local/models';
import { exerciseById, type Exercise } from '@/data/exercises';
import { capabilityNameKey } from '@/domain/portrait';
import { allByEquipment, recentsForSlot, recommended, searchExercises } from '@/domain/replacement';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, layout, press, type as typo } from '@/design/tokens';

interface Props {
  capability: Capability;
  currentExerciseId: string;
  target: { weight: number | null; reps: number };
  units: Units;
  recents: string[];
  mode: 'deliberate' | 'session';
  onUse: (exerciseId: string) => void;
  onDismiss: () => void;
}

export function ReplacementSheet({ capability, currentExerciseId, target, units, recents, mode, onUse, onDismiss }: Props) {
  const { t } = useCopy();
  const [query, setQuery] = useState('');
  const [stagedId, setStagedId] = useState<string | null>(null);

  // Preference-learning events: the sheet was opened (considered), and ultimately
  // accepted (with from→to) or dismissed (rejected/kept original).
  useEffect(() => {
    void track('replacement_opened', { capability, currentExerciseId, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const accept = (exId: string) => {
    void track('replacement_accepted', { capability, from: currentExerciseId, to: exId, mode });
    onUse(exId);
  };
  const dismiss = () => {
    void track('replacement_dismissed', { capability, currentExerciseId, mode });
    onDismiss();
  };

  const currentName = exerciseById(currentExerciseId)?.name ?? '';
  const results = useMemo(() => searchExercises(capability, currentExerciseId, query), [capability, currentExerciseId, query]);
  const recs = useMemo(() => recommended(capability, currentExerciseId), [capability, currentExerciseId]);
  const yours = useMemo(() => recentsForSlot(recents, capability, currentExerciseId), [recents, capability, currentExerciseId]);
  const all = useMemo(() => allByEquipment(capability, currentExerciseId), [capability, currentExerciseId]);

  const targetStr = (ex: Exercise) => {
    const w = displayWeight(target.weight, units);
    return w == null ? ex.name : `${ex.name}  ·  ${w} ${unitLabel(units)} × ${target.reps}`;
  };

  function pick(ex: Exercise) {
    if (mode === 'session') {
      accept(ex.id); // lighter: swap in place + dismiss
    } else {
      setStagedId(ex.id); // stage; commit via "Use"
    }
  }

  const staged = stagedId ? exerciseById(stagedId) : null;
  const searching = query.trim().length > 0;

  return (
    <Pressable style={styles.scrim} onPress={dismiss}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.title}>{t('replacement.title', { exercise: currentName })}</Text>
        <TextInput
          style={styles.search}
          placeholder={t('replacement.searchPlaceholder')}
          placeholderTextColor={color.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        {staged ? (
          <View style={styles.staged}>
            <Text style={styles.stagedName}>{targetStr(staged)}</Text>
          </View>
        ) : null}

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {searching ? (
            results.length === 0 ? (
              <Text style={styles.noResults}>{t('replacement.noResults')}</Text>
            ) : (
              results.map((ex) => <Row key={ex.id} label={ex.name} onPress={() => pick(ex)} />)
            )
          ) : (
            <>
              <Section title={t('replacement.sectionRecommended')}>
                {recs.map((ex) => <Row key={ex.id} label={targetStr(ex)} onPress={() => pick(ex)} />)}
              </Section>
              {yours.length > 0 ? (
                <Section title={t('replacement.sectionYours')}>
                  {yours.map((ex) => <Row key={ex.id} label={ex.name} onPress={() => pick(ex)} />)}
                </Section>
              ) : null}
              <Section title={t('replacement.sectionAll', { capability: t(capabilityNameKey(capability)) })}>
                {all.map((g) => (
                  <View key={g.family}>
                    <Text style={styles.subhead}>{g.family}</Text>
                    {g.exercises.map((ex) => <Row key={ex.id} label={ex.name} onPress={() => pick(ex)} />)}
                  </View>
                ))}
              </Section>
            </>
          )}
        </ScrollView>

        {staged ? (
          <PrimaryButton label={t('replacement.use', { exercise: staged.name })} onPress={() => accept(staged.id)} />
        ) : null}
      </Pressable>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.bgSurface, padding: layout.screenMargin, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88%' },
  title: { color: color.textPrimary, fontSize: typo.titleM.size, marginBottom: 16 },
  search: { backgroundColor: color.bgBase, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: color.textPrimary, fontSize: typo.bodyL.size, marginBottom: 16 },
  staged: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle, marginBottom: 8 },
  stagedName: { color: color.textPrimary, fontSize: typo.bodyL.size },
  list: { flexGrow: 0 },
  section: { marginBottom: 20 },
  sectionTitle: { color: color.textSecondary, fontSize: typo.caption.size, marginBottom: 8 },
  subhead: { color: color.textTertiary, fontSize: typo.micro.size, marginTop: 8, marginBottom: 4, textTransform: 'capitalize' },
  row: { minHeight: 44, justifyContent: 'center' },
  rowLabel: { color: color.textPrimary, fontSize: typo.bodyL.size },
  noResults: { color: color.textSecondary, fontSize: typo.bodyM.size, textAlign: 'center', marginTop: 24 },
});
