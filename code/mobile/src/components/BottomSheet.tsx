/**
 * BottomSheet (spec §2.6.8) — presentation container: a dimmed scrim over the app
 * and a bottom-anchored sheet with top radius 24 and a centered grabber
 * (36×5pt, #3A3A3C, radius 3, ~10pt from top).
 *
 * Designed to be the root of a transparent-modal route so the parent screen shows
 * through the scrim. Tapping the scrim calls `onClose`. An optional `behind` layer
 * renders the faint glimpse some sheets want (Swap §4.21, Edit Result §4.13).
 */
import React from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, radius, space } from '@/design/tokens';

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  /** Sheet background — `surface` (default), `surface2`, etc. */
  background?: string;
  /** Fractional height of the sheet (0–1). Omit to size to content. */
  heightFraction?: number;
  /** Horizontal padding inside the sheet (spec: 16 or 18). */
  gutter?: number;
  /** Scrim opacity over the parent (default 0.55). */
  scrimOpacity?: number;
  /** Optional faint-glimpse layer rendered between scrim and sheet. */
  behind?: React.ReactNode;
  style?: ViewStyle;
}

export function BottomSheet({
  onClose,
  children,
  background = color.surface,
  heightFraction,
  gutter = space.gutter,
  scrimOpacity = 0.55,
  behind,
  style,
}: Props) {
  return (
    <View style={styles.fill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${scrimOpacity})` }]}
        onPress={onClose}
      />
      {behind}
      <SafeAreaView edges={['bottom']} style={styles.anchor} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: background, paddingHorizontal: gutter },
            heightFraction != null ? { height: `${heightFraction * 100}%` } : null,
            style,
          ]}
        >
          <View style={styles.grabber} />
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFillObject,
  anchor: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3A3C',
    alignSelf: 'center',
    marginBottom: 16,
  },
});
