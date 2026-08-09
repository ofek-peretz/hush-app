/**
 * Card — v7. A surface floats on the dark stage as a faint translucent-cream
 * raise with a hairline. `paper` flips it to an opaque warm paper card carrying
 * dark ink (the "cards only" paper). `interactive` settles to 0.98 on press;
 * `accent` marks the active item with moss; `stage` is a deeper dark card;
 * `raised` lifts with the deep warm shadow.
 */
// @ts-nocheck

// 

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
  paper?: boolean;
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
  paper = false,
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
    paper ? styles.paper : null,
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
    borderRadius: radius.card,
  },
  padMd: { padding: space[6] },
  padLg: { padding: space[7] },
  flat: { backgroundColor: 'transparent' },
  raisedBorder: { borderColor: 'transparent' },
  accent: { borderColor: color.accent },
  stage: { backgroundColor: stageC[1], borderColor: stageC[2] },
  paper: { backgroundColor: color.paper, borderColor: 'transparent' },
  pressed: { transform: [{ scale: 0.985 }], borderColor: color.borderStrong },
});
