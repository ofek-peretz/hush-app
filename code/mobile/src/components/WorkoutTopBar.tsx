/**
 * WorkoutTopBar — top row inside an active workout. Founder change (2026-06-19):
 * the left slot now shows the LIVE current clock time (e.g. "10:00"), not an
 * estimated "Nm left" — a real, always-correct value instead of a placeholder ETA.
 * Right slot = pause glyph (omitted on the brief Set-Confirmation screen via
 * `onPause === undefined`). Monochrome.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { color, space, tnum, press, s } from '@/design/tokens';

function nowLabel(): string {
  // Localized wall-clock time, hour:minute (matches the device's 12/24h setting).
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function WorkoutTopBar({ onPause }: { onPause?: () => void }) {
  const [clock, setClock] = useState(nowLabel());
  useEffect(() => {
    // Re-read at the top of each minute-ish so it stays current without churn.
    const id = setInterval(() => setClock(nowLabel()), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.row}>
      <Text style={styles.left} accessibilityLabel={`Time ${clock}`}>{clock}</Text>
      {onPause ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause workout"
          hitSlop={12}
          onPress={onPause}
          style={({ pressed }) => [styles.pause, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="pause" size={s(20)} color={color.textDim} />
        </Pressable>
      ) : (
        <View style={styles.pause} />
      )}
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
