/**
 * OptStack — a stacked, single-select option group. Each choice carries a one-line
 * description; the selected option lifts, its border turns ochre and its radio fills.
 * Used for Experience.
 *
 * Founder 2026-07-12, two fixes:
 *  • The radio LEADS the row. It sat trailing, which is right for Hebrew and wrong for
 *    English — a left-to-right reader scans the start of the line first and needs the
 *    state before the label, not after it. `flexDirection: row` mirrors under RTL, so
 *    putting the radio first is correct in BOTH locales: it lands on the reading edge,
 *    wherever that edge is.
 *  • The selected border is OCHRE, not black. A 1.5px ink frame was the heaviest mark on
 *    a screen full of hairlines — it shouted. The signal colour already means "this is
 *    the live one" everywhere else in the app; selection should speak the same language.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, textScale, tracking, trackingPx, radius, shadow } from '@/design/tokens';

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
            {/* the radio leads — it lands on the reading edge in both locales */}
            <View style={[styles.radio, on ? styles.radioOn : styles.radioOff]} />
            <View style={styles.text}>
              <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
              <Text style={styles.desc}>{o.desc}</Text>
            </View>
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
  // content by the border delta (the selected look comes from the color, not width).
  optOn: { borderWidth: 1.5, borderColor: color.textPrimary, backgroundColor: color.lift, ...(shadow.md as object) },
  optOff: { borderWidth: 1.5, borderColor: color.borderControl, backgroundColor: 'transparent' },
  text: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.sansMedium, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  labelOn: { fontFamily: font.sansSemibold, textAlign: 'left' },
  desc: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 3, lineHeight: 18, textAlign: 'left' },
  radio: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.bg },
  radioOn: { borderWidth: 5.5, borderColor: color.textPrimary },
  radioOff: { borderWidth: 1.5, borderColor: color.borderControl },
});
