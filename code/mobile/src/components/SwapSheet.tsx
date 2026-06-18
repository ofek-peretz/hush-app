/**
 * 4.21 Swap Exercise sheet — alternatives that hit the SAME movement pattern.
 * Current is a white card with a check (not re-selectable); alternatives are
 * surface3 cards with a chevron. Selecting one replaces the slot's exercise
 * (capability is fixed, so all options stay in-class).
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { exerciseById, exercisesForCapability } from '@/data/exercises';
import { capabilityNameKey } from '@/domain/portrait';
import type { Capability } from '@/data/local/models';
import { color, radius, space, heroTitle, press } from '@/design/tokens';

interface Props {
  capability: Capability;
  currentExerciseId: string;
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

export function SwapSheet({ capability, currentExerciseId, onSelect, onClose }: Props) {
  const { t } = useCopy();
  const current = exerciseById(currentExerciseId);
  const alternatives = exercisesForCapability(capability).filter((e) => e.id !== currentExerciseId);
  const pattern = t(capabilityNameKey(capability));

  return (
    <BottomSheet onClose={onClose} background={color.surface2} heightFraction={0.74} gutter={space.sheetGutter}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('swap.title')}</Text>
          <Text style={styles.subtitle}>{t('swap.samePattern', { pattern })}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('swap.close')}
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [styles.close, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="close" size={16} color={color.textDim} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {current ? (
          <View style={[styles.card, styles.currentCard]}>
            <View style={styles.cardText}>
              <Text style={styles.currentName}>{current.name}</Text>
              <Text style={styles.currentSub}>{t('swap.current', { equipment: t(`equipment.${current.equipment}`) })}</Text>
            </View>
            <Icon name="check" size={18} color={color.bg} strokeWidth={2.4} />
          </View>
        ) : null}

        {alternatives.map((ex) => (
          <Pressable
            key={ex.id}
            accessibilityRole="button"
            onPress={() => onSelect(ex.id)}
            style={({ pressed }) => [styles.card, styles.altCard, { opacity: pressed ? press.opacity : 1 }]}
          >
            <View style={styles.cardText}>
              <Text style={styles.altName}>{ex.name}</Text>
              <Text style={styles.altSub}>{t(`equipment.${ex.equipment}`)}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={color.textTertiary} strokeWidth={2} />
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  headerText: { flex: 1 },
  title: { ...heroTitle(21), color: color.textPrimary, fontSize: 21, fontWeight: '600' },
  subtitle: { fontSize: 13, color: color.textSecondary, marginTop: 4 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 12, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: radius.card },
  cardText: { flex: 1, marginRight: 12 },
  currentCard: { backgroundColor: color.textPrimary },
  currentName: { fontSize: 16, fontWeight: '500', color: color.bg },
  currentSub: { fontSize: 12, color: '#6D6D72', marginTop: 2 },
  altCard: { backgroundColor: color.surface3 },
  altName: { fontSize: 16, fontWeight: '500', color: color.textPrimary },
  altSub: { fontSize: 12, color: color.textSecondary, marginTop: 2 },
});
