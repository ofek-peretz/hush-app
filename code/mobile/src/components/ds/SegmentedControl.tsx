/**
 * SegmentedControl — 1:1 from the design `components/forms/SegmentedControl.jsx`.
 * The primary choice control (units, language, goal, experience, days/week). A
 * single decisive selection. The selected segment is marked with INK, not the
 * signal color — choices are settled facts, not actions.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, control, space, font, textScale, shadow } from '@/design/tokens';

type Option = string | { value: string; label: string; icon?: React.ReactNode };

interface Props {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  block?: boolean;
  stack?: boolean; // vertical layout (onboarding goal / experience)
  size?: 'md' | 'lg';
  style?: ViewStyle | ViewStyle[];
}

export function SegmentedControl({ options, value, onChange, block, stack, size = 'md', style }: Props) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const minH = (size === 'lg' ? control.hLg : control.h) - 6;
  return (
    <View style={[styles.track, block && styles.block, stack && styles.trackStack, style]}>
      {norm.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, { minHeight: minH }, (block || stack) && styles.itemBlock, stack && styles.itemStack, active && styles.itemActive]}
          >
            {o.icon ? <View style={styles.icon}>{o.icon}</View> : null}
            <Text
              style={[
                styles.label,
                { fontSize: size === 'lg' ? textScale.base : textScale.sm },
                active ? styles.labelActive : null,
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  block: { alignSelf: 'stretch', width: '100%' },
  trackStack: { flexDirection: 'column', alignSelf: 'stretch', width: '100%' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
  itemBlock: { flex: 1 },
  itemStack: { flex: 0, alignItems: 'flex-start', justifyContent: 'center', width: '100%' },
  itemActive: { backgroundColor: color.surface, ...(shadow.md as object) },
  label: { fontFamily: font.sansMedium, color: color.textSecondary },
  labelActive: { fontFamily: font.sansSemibold, color: color.textPrimary },
});
