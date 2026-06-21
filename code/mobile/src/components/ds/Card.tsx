/**
 * Card — 1:1 from the design system `components/core/Card.jsx`.
 * A surface sits on the page with a HAIRLINE, not a shadow. Elevation is
 * reserved for things that truly float. `interactive` firms the border + settles
 * 1px on press; `accent` marks the active item; `stage` flips to the inverted
 * focus surface; `raised` lifts with the warm md shadow.
 */
import React from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, border, shadow, stage as stageC } from '@/design/tokens';

type Pad = 'none' | 'md' | 'lg';

interface Props {
  pad?: Pad;
  flat?: boolean;
  raised?: boolean;
  interactive?: boolean;
  accent?: boolean;
  stage?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

export function Card({
  pad = 'md',
  flat = false,
  raised = false,
  interactive = false,
  accent = false,
  stage = false,
  onPress,
  style,
  children,
}: Props) {
  const base: ViewStyle[] = [
    styles.card,
    pad === 'md' ? styles.padMd : pad === 'lg' ? styles.padLg : null,
    flat ? styles.flat : null,
    raised ? (shadow.md as ViewStyle) : null,
    raised ? styles.raisedBorder : null,
    accent ? styles.accent : null,
    stage ? styles.stage : null,
  ].filter(Boolean) as ViewStyle[];

  if (onPress || interactive) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...base,
          interactive && pressed ? styles.pressed : null,
          ...(Array.isArray(style) ? style : style ? [style] : []),
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[...base, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: border.width,
    borderColor: color.border,
    borderRadius: radius.lg,
  },
  padMd: { padding: space[6] },
  padLg: { padding: space[7] },
  flat: { backgroundColor: 'transparent' },
  raisedBorder: { borderColor: 'transparent' },
  accent: { borderColor: color.accent },
  stage: { backgroundColor: stageC[1], borderColor: stageC[2] },
  pressed: { transform: [{ translateY: 1 }], borderColor: color.borderStrong },
});
