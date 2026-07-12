/**
 * 4.21 Swap Exercise sheet — rebuilt 1:1 to the Claude Design "Design System"
 * swap (ui_kits/app/Program.jsx → WorkoutSheet swap, ui_kits/app/LiveWorkout.jsx
 * → Overlay 'swap'). A light sheet, not dark cards: a `Swap · {muscle}` legend,
 * a short line, the current exercise as a muted row carrying a "Current" badge,
 * then the alternatives as plain rows — each labelled by its MUSCLE GROUP (not
 * equipment) with a chevron. Selecting one replaces the slot's exercise; Hush
 * keeps the load progression intact.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
// The gesture-handler ScrollView, so RNGH can run the list's scroll alongside the sheet's
// drag-to-dismiss instead of one cancelling the other (see BottomSheet).
import { ScrollView } from 'react-native-gesture-handler';
import { BottomSheet, useSheetScroll } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseById, similarExercises, muscleOf } from '@/data/exercises';
import { color, font, textScale, tracking, trackingPx, signal, press } from '@/design/tokens';

interface Props {
  currentExerciseId: string;
  /** Exercises already in THIS workout — never offered, so a swap can't create a duplicate lift
   *  in the same session (founder 2026-07-09). */
  exclude?: readonly string[];
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

export function SwapSheet({ currentExerciseId, exclude, onSelect, onClose }: Props) {
  const { t } = useCopy();
  // Swipe-down-to-dismiss works from anywhere on the sheet, and defers to this list
  // whenever it is scrolled away from the top (see BottomSheet).
  const sheetScroll = useSheetScroll();
  const current = exerciseById(currentExerciseId);
  const muscle = muscleOf(currentExerciseId);
  const muscleLabel = muscle ? t(`muscle.${muscle}`) : '';
  // Program editor: the FULL set for this muscle (wide variety), best-match first — minus anything
  // already in the workout (no duplicate lift in one session).
  const excludeSet = new Set(exclude ?? []);
  const alternatives = similarExercises(currentExerciseId).filter((e) => !excludeSet.has(e.id));

  return (
    <BottomSheet onClose={onClose} heightFraction={0.74} scroll={sheetScroll}>
      <Legend style={styles.legend}>{t('swap.titleMuscle', { muscle: muscleLabel })}</Legend>
      <Text style={styles.body}>{t('swap.body')}</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} {...sheetScroll.scrollProps}>
        {current ? <SwapRow title={current.name} subtitle={muscleLabel} currentBadge muted /> : null}
        {alternatives.map((ex, i) => (
          <SwapRow
            key={ex.id}
            title={ex.name}
            subtitle={muscleLabel}
            last={i === alternatives.length - 1}
            onPress={() => onSelect(ex.id)}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function SwapRow({
  title,
  subtitle,
  currentBadge,
  muted,
  last,
  onPress,
}: {
  title: string;
  subtitle?: string;
  currentBadge?: boolean;
  muted?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { t } = useCopy();
  const body = (
    <>
      <View style={styles.info}>
        <Text style={[styles.title, muted && styles.titleMuted]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {currentBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('swap.currentBadge').toUpperCase()}</Text>
        </View>
      ) : onPress ? (
        <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, { opacity: pressed ? press.opacity : 1 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.row, !last && styles.rowBorder]}>{body}</View>;
}

const styles = StyleSheet.create({
  legend: { marginBottom: 6 },
  body: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textMuted, marginBottom: 8 },
  list: { paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary },
  titleMuted: { color: color.textSecondary },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },
  badge: { backgroundColor: signal.wash, borderRadius: 4, paddingHorizontal: 8, height: 22, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.accentText },
});
