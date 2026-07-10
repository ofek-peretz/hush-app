/**
 * OptStack — a stacked, single-select option group, 1:1 from the design
 * onboarding `OptStack` (ui_kits/app/Onboarding.jsx). Each choice carries a
 * one-line description; the selected option reads in INK (a settled fact, not an
 * action) with a hairline-to-ink border, a soft lift, and a filled radio — the
 * same language as SegmentedControl. Used for Goal and Experience.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, textScale, tracking, trackingPx, radius, ink, shadow } from '@/design/tokens';

export interface OptStackOption {
  value: string;
  label: string;
  desc: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: OptStackOption[];
}

export function OptStack({ value, onChange, options }: Props) {
  return (
    <View style={styles.stack}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.opt, on ? styles.optOn : styles.optOff]}
          >
            <View style={styles.text}>
              <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
              <Text style={styles.desc}>{o.desc}</Text>
            </View>
            <View style={[styles.radio, on ? styles.radioOn : styles.radioOff]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  // Equal border widths on both states — selecting must never shift the row's
  // content by the border delta (the hairline look comes from the color, not width).
  optOn: { borderWidth: 1.5, borderColor: ink[0], backgroundColor: color.surface, ...(shadow.md as object) },
  optOff: { borderWidth: 1.5, borderColor: color.borderControl, backgroundColor: 'transparent' },
  text: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.sansMedium, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary },
  labelOn: { fontFamily: font.sansSemibold },
  desc: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 3, lineHeight: 18 },
  radio: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.bg },
  radioOn: { borderWidth: 5.5, borderColor: ink[0] },
  radioOff: { borderWidth: 1.5, borderColor: color.borderControl },
});
