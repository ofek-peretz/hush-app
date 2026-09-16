/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WHOLE CATALOGUE, IN A SHEET — search, muscle chips, one row per lift.
 *
 * ⛔ FOUNDER, 2026-09-16: *"כשלוחצים על תרגיל שרוצים להחליף בתוכנית אימון זה מציג רק שלוש אופציות של
 * אותה התנועה, אני רוצה שתציג את כל הספרייה בלחיצה על זה כי יכול להיות שארצה תרגיל אחר על שריר אחר
 * לגמרי."*
 *
 * The swap menu answers a narrow question — *this station is taken, what else trains this muscle the
 * same way* — and it answers it well: same muscle, same capability, same pattern, ranked by fidelity
 * (`domain/swapPool`). What it cannot answer is the question he is asking, because the answer is
 * outside its own gates by construction: **a different muscle entirely.**
 *
 * So the menu keeps its three and grows a door, and behind the door is this — the picker the builder
 * has used since it shipped, lifted out of `PlanBuilder` so the swap can open the same one. One
 * catalogue, one search, one set of chips, wherever the athlete is standing.
 *
 * ⚠️ IT IS THE SAME LIST THE BUILDER OFFERS, deliberately: swap-only regressions stay withheld (they
 * are offered when she says she cannot do the loaded one, never handed to somebody browsing), and a
 * lift already in the day is drawn DIMMED rather than hidden — a gap where a lift should be is a
 * mystery, and a disabled row is an answer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';

import { BottomSheet, useSheetScroll } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { MotionThumb } from '@/motion/render/MotionThumb';
import type { FigureSex } from '@/motion/types';
import { EXERCISES, exerciseDisplayName, isSwapOnly } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { color, font, radius } from '@/design/tokens';

const MUSCLES = CANONICAL_MUSCLE_ORDER;

export function ExercisePickerSheet({ legend, taken, takenLabel, figure, onPick, onClose }: {
  /** What this sheet is FOR, in her language — "add a lift", or "replace with". */
  legend: string;
  /** Lifts already in the day — drawn dimmed and unpickable, never hidden (no mystery gaps). */
  taken: ReadonlySet<string>;
  /** The word on a taken row. The builder says "in this day"; a swap says the same thing. */
  takenLabel: string;
  figure: FigureSex;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const scroll = useSheetScroll();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (e.id.startsWith('_') || isSwapOnly(e.id)) return false;
      if (muscle && e.muscle !== muscle) return false;
      if (!q) return true;
      return exerciseDisplayName(e.id).toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
    }).slice(0, 40);
  }, [query, muscle]);

  return (
    <BottomSheet onClose={onClose}>
      <Legend style={styles.sheetLegend}>{legend}</Legend>
      <View style={styles.searchWell}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('builder.searchPlaceholder')}
          placeholderTextColor={color.textTertiary}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t('builder.searchPlaceholder')}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
        {MUSCLES.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            onPress={() => setMuscle(muscle === m ? null : m)}
            style={[styles.chip, muscle === m && styles.chipOn]}
          >
            <Text style={[styles.chipText, muscle === m && styles.chipTextOn]}>{t(`muscle.${m}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={styles.sheetList} {...scroll}>
        {matches.map((e) => {
          const held = taken.has(e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={exerciseDisplayName(e.id)}
              disabled={held}
              onPress={() => onPick(e.id)}
              style={({ pressed }) => [styles.pickRow, pressed && styles.pickRowPressed, held && styles.pickRowTaken]}
            >
              {/* The still of the movement itself (founder 2026-08-25): every row says what it IS at
                  a glance — our own athlete, not a stock clip. */}
              <MotionThumb exerciseId={e.id} size={44} figure={figure} style={styles.pickThumb} />
              <View style={styles.pickText}>
                <Text style={styles.pickName} numberOfLines={1}>{bidi(exerciseDisplayName(e.id))}</Text>
                <Legend size={17} track={0.1}>{`${t(`muscle.${e.muscle}`)} · ${t(`equipment.${e.equipment}`, { defaultValue: e.equipment })}`}</Legend>
              </View>
              {held ? <Legend size={17} track={0.1}>{takenLabel}</Legend> : <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />}
            </Pressable>
          );
        })}
        {matches.length === 0 ? <Text style={styles.noMatch}>{t('builder.noMatches')}</Text> : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetLegend: { marginBottom: 10 },
  searchWell: { borderWidth: 1, borderColor: color.border, borderRadius: radius.md, backgroundColor: color.surface2, marginBottom: 10 },
  searchInput: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, paddingHorizontal: 12, paddingVertical: 10, textAlign: 'left' },
  chipsRow: { marginBottom: 10, flexGrow: 0 },
  chipsContent: { gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: color.border },
  chipOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  chipText: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'center' },
  chipTextOn: { color: color.bg },
  sheetList: { maxHeight: 380 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: color.border },
  pickRowPressed: { backgroundColor: color.surface2 },
  pickRowTaken: { opacity: 0.4 },
  pickThumb: { borderRadius: radius.md, backgroundColor: color.surface2, overflow: 'hidden' },
  pickText: { flex: 1, gap: 2 },
  pickName: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  noMatch: { fontFamily: font.sans, fontSize: 17, color: color.textTertiary, paddingVertical: 16, textAlign: 'center' },
});
