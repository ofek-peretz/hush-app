/**
 * IconButton — 1:1 from the design `components/core/IconButton.jsx`.
 * A square, quiet control for secondary affordances (back, settings, pause,
 * demo). Pass the glyph as children (a 20px icon). Always provide an
 * accessibilityLabel. Settles to 0.98 scale on press; `bordered` adds a hairline
 * + surface; `onStage` inverts for the live workout.
 */

// 

import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, control, stage as stageC } from '@/design/tokens';

interface Props {
  onPress?: () => void;
  size?: 'sm' | 'md';
  bordered?: boolean;
  onStage?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}

export function IconButton({ onPress, size = 'md', bordered, onStage, disabled, accessibilityLabel, style, children }: Props) {
  const dim = size === 'sm' ? control.hSm : control.h;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: size === 'sm' ? radius.sm : radius.md },
        bordered && styles.bordered,
        onStage && pressed && styles.onStagePressed,
        !onStage && pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bordered: { borderColor: color.borderControl, backgroundColor: color.surface },
  pressed: { backgroundColor: color.fillSubtle, transform: [{ scale: 0.98 }] },
  onStagePressed: { backgroundColor: stageC[1], transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.35 },
});
