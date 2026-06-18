/**
 * WorkoutTopBar (spec §2.6.7) — top row inside an active workout:
 * left = "{n}m left" (tnum, textSecondary), right = pause icon (textDim).
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { color, space, tnum, press, s } from '@/design/tokens';

interface Props {
  minutesLeft: number;
  onPause: () => void;
}

export function WorkoutTopBar({ minutesLeft, onPause }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.left}>{minutesLeft}m left</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pause workout"
        hitSlop={12}
        onPress={onPause}
        style={({ pressed }) => [styles.pause, { opacity: pressed ? press.opacity : 1 }]}
      >
        <Icon name="pause" size={s(20)} color={color.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingTop: 6,
  },
  left: { ...tnum, color: color.textSecondary, fontSize: s(14) },
  pause: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center', marginRight: -10 },
});
