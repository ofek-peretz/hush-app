/**
 * TabBar (spec §2.6.6, §2.5) — the translucent bottom bar with 4 icon+label tabs.
 * Active = textPrimary + filled glyph (slightly heavier label); inactive =
 * tabInactive. Height 62pt above the safe area; top hairline; rgba background.
 *
 * NOTE: real backdrop-blur (spec §2.3) needs `expo-blur`, a native module that
 * requires a dev-client rebuild. Approximated here with a translucent rgba fill;
 * swap in BlurView during the infra build. Presentational only — the navigator
 * (Root) supplies `active` + `onPress`.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { color, tabBar, press } from '@/design/tokens';

export type TabKey = 'home' | 'program' | 'history' | 'portrait';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'program', label: 'Program', icon: 'program' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'portrait', label: 'Portrait', icon: 'portrait' },
];

interface Props {
  active: TabKey;
  onPress: (tab: TabKey) => void;
}

export function TabBar({ active, onPress }: Props) {
  return (
    <View style={styles.wrap}>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={styles.row}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const tint = isActive ? color.textPrimary : color.tabInactive;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
                hitSlop={6}
                onPress={() => onPress(tab.key)}
                style={({ pressed }) => [styles.tab, { opacity: pressed ? press.opacity : 1 }]}
              >
                <Icon name={tab.icon} size={24} color={tint} strokeWidth={isActive ? 2.2 : 1.8} filled={isActive} />
                <Text style={[styles.label, { color: tint, fontWeight: isActive ? '500' : '400' }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tabBar.bg,
    borderTopWidth: 0.5,
    borderTopColor: tabBar.topBorder,
  },
  bar: { paddingTop: 0 },
  row: { flexDirection: 'row', height: tabBar.height },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10 },
});
