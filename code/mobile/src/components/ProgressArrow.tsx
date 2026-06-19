/**
 * ProgressArrow — the founder's replacement for the spoken progression sentences
 * (#13): a small ▲ when the model raised the load, a small ▼ when it lowered it,
 * and nothing at all when the load is unchanged. Monochrome, no words. Used on the
 * Active Set (load vs last week) and the Program screen (this week's change).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { color, s } from '@/design/tokens';

export type ProgressDirection = 'up' | 'down' | null;

/** Map a recommendation reason to a direction (hold / unknown → no arrow). */
export function directionFromReason(reason?: 'increase' | 'decrease' | 'hold'): ProgressDirection {
  if (reason === 'increase') return 'up';
  if (reason === 'decrease') return 'down';
  return null;
}

export function ProgressArrow({ direction, size }: { direction: ProgressDirection; size?: number }) {
  if (!direction) return null;
  const dim = size ?? s(18);
  return (
    <View style={styles.wrap} accessibilityLabel={direction === 'up' ? 'increased' : 'decreased'}>
      <Icon
        name={direction === 'up' ? 'chevronUp' : 'chevronDown'}
        size={dim}
        color={color.textPrimary}
        strokeWidth={2.4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
