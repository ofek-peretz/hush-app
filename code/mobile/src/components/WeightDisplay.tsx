/**
 * Weight display — the Workout Screen hero (spec §4.3). 92px Bold, the single
 * largest element on screen (hierarchy law, UX §8.1). Unit "kg/lb" 16px,
 * bottom-right, non-competing. Tap -> Reason Sheet ONLY if a reason exists;
 * otherwise inert (spec §4.3, §10.24).
 *
 * Raw number only in the hero. Reason/forecast/receipt are separate lines.
 */
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { a11y, color, type as typo } from '@/design/tokens';

interface Props {
  weight: number | null; // null => bodyweight
  units: string; // "kg" | "lb"
  hasReason: boolean;
  onPressReason?: () => void;
  bodyweightLabel: string;
  /** Full composed VoiceOver label (§8.3): "[weight], [reps] reps, set n of m". */
  a11yLabel?: string;
}

export function WeightDisplay({ weight, units, hasReason, onPressReason, bodyweightLabel, a11yLabel }: Props) {
  const isBodyweight = weight == null;
  const label = a11yLabel ?? (isBodyweight ? bodyweightLabel : `${weight} ${units === 'kg' ? 'kilograms' : 'pounds'}`);

  const content = (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {isBodyweight ? (
        <Text style={styles.bodyweight} allowFontScaling maxFontSizeMultiplier={a11y.titleMaxScale}>
          {bodyweightLabel}
        </Text>
      ) : (
        <>
          <Text style={styles.hero} allowFontScaling maxFontSizeMultiplier={a11y.heroMaxScale}>
            {formatWeight(weight)}
          </Text>
          <Text style={styles.unit} maxFontSizeMultiplier={a11y.bodyMaxScale}>{units}</Text>
        </>
      )}
    </View>
  );

  // A reason sheet exists only where a reason exists (spec §10.24): inert otherwise.
  if (hasReason && onPressReason) {
    return (
      <Pressable accessibilityRole="button" onPress={onPressReason}>
        {content}
      </Pressable>
    );
  }
  return content;
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : String(w);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  hero: {
    fontSize: typo.hero.size,
    lineHeight: typo.hero.lineHeight,
    fontWeight: typo.hero.weight,
    color: color.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  bodyweight: {
    fontSize: typo.titleXL.size,
    fontWeight: typo.titleXL.weight,
    color: color.textPrimary,
  },
  unit: {
    fontSize: typo.unit.size,
    color: color.textSecondary,
    marginStart: 6,
    marginBottom: 14,
  },
});
