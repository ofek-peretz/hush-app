/**
 * Minimal back affordance for pushed full-layer screens (Program, History,
 * Settings, etc.). These run headerShown:false, so without this the only way
 * back is the platform edge-swipe / hardware back — a visible control ensures an
 * athlete can never be trapped (spec §7.1). Top-left, 44pt target, no chrome.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, layout, press } from '@/design/tokens';

export function BackButton({ onPress }: { onPress: () => void }) {
  const { t } = useCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.tap, { opacity: pressed ? press.opacity : 1 }]}
    >
      <Icon name="chevronLeft" size={22} color={color.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tap: {
    width: 44,
    height: 44,
    marginLeft: layout.screenMargin - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
