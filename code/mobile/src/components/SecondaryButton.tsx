/**
 * SecondaryButton (spec §2.6.2) — transparent fill, 0.5–1pt `border`, white text,
 * radius 14. Used for "Continue with Google" and other non-primary affordances.
 * Optional leading content (e.g. a brand logo) rendered left of the label.
 */
import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, press } from '@/design/tokens';

interface Props {
  label: string;
  onPress: () => void;
  leading?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}

export function SecondaryButton({ label, onPress, leading, disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, { opacity: pressed ? press.opacity : 1 }, style]}
    >
      <View style={styles.row}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: radius.card,
    borderWidth: 0.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  leading: { marginRight: 8 },
  label: { color: color.textPrimary, fontSize: 15, fontWeight: '500' },
});
