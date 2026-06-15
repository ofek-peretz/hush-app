/**
 * Workout card — Home primary content group (spec §4.1).
 * Workout name is the single largest element (48px Bold), never exceeded.
 * Forbidden forever: calories, streaks, XP, greetings, weather, tips,
 * AI-coach language.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { a11y, color, type as typo } from '@/design/tokens';

interface Props {
  name: string;
  metadata: string; // muscle groups, or rest-day line
}

export function WorkoutCard({ name, metadata }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.name} allowFontScaling maxFontSizeMultiplier={a11y.titleMaxScale} accessibilityRole="header">
        {name}
      </Text>
      {metadata.length > 0 ? <Text style={styles.meta}>{metadata}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  name: {
    fontSize: typo.titleXL.size,
    lineHeight: typo.titleXL.lineHeight,
    fontWeight: typo.titleXL.weight,
    color: color.textPrimary,
  },
  meta: {
    marginTop: 8,
    fontSize: typo.bodyM.size,
    color: color.textSecondary,
  },
});
