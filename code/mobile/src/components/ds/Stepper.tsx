/**
 * Stepper — 1:1 from the design `components/forms/Stepper.jsx`.
 * Precise numeric adjustment for values the athlete owns or corrects (actual
 * weight/reps, days per week, body data). The value is mono + tabular so it never
 * shifts as digits change. Deliberate — no acceleration.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, control, font, textScale } from '@/design/tokens';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  size?: 'md' | 'lg';
  format?: (v: number) => string;
  style?: ViewStyle | ViewStyle[];
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  unit = '',
  size = 'md',
  format,
  style,
}: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
  const set = (v: number) => onChange(clamp(v));
  const shown = format ? format(value) : String(value);
  const h = size === 'lg' ? control.hLg : control.h;

  return (
    <View style={[styles.wrap, { height: h }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        disabled={value <= min}
        onPress={() => set(value - step)}
        style={({ pressed }) => [styles.btn, { width: h }, pressed && styles.btnPressed, value <= min && styles.btnDisabled]}
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <View style={styles.valBox}>
        <Text style={[styles.num, size === 'lg' && styles.numLg]}>{shown}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        disabled={value >= max}
        onPress={() => set(value + step)}
        style={({ pressed }) => [styles.btn, { width: h }, pressed && styles.btnPressed, value >= max && styles.btnDisabled]}
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: color.borderControl,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  btn: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  btnPressed: { backgroundColor: color.fillSubtle },
  btnDisabled: { opacity: 0.4 },
  sign: { fontFamily: font.sans, fontSize: 20, color: color.textPrimary, lineHeight: 22 },
  valBox: {
    // `flexGrow + flexBasis:'auto'` (NOT `flex:1`, whose flexBasis:0 makes the
    // auto-width wrap size as if the value were 0-wide, then minWidth overflows and
    // `overflow:'hidden'` clips the trailing "+" button to a sliver). With an auto
    // basis the wrap content-sizes to −/value/+ in full; flexGrow still lets the
    // value fill when a parent stretches the control.
    flexGrow: 1,
    flexBasis: 'auto',
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: color.border,
  },
  // lineHeight ≥ fontSize + includeFontPadding:false, or RN clips the tall mono
  // digit tops inside the fixed-height, overflow-hidden control (same headroom the
  // stage hero needs — see SessionFlow `hero`).
  num: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.md, lineHeight: 22, includeFontPadding: false, color: color.textPrimary },
  numLg: { fontSize: textScale.xl, lineHeight: 30 },
  unit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
});
