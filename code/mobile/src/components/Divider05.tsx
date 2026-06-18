/**
 * Divider05 (spec §2.6.5) — 0.5pt hairline in `border`. Full width by default.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { hairline } from '@/design/tokens';

export function Divider05({ style }: { style?: ViewStyle }) {
  return <View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: {
    height: hairline.width,
    backgroundColor: hairline.color,
    alignSelf: 'stretch',
  },
});
