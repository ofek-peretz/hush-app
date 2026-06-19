/**
 * BackBar — a thin top row with a single back chevron, for screens pushed from the
 * Menu (Program · History · Portrait) now that the Tab Bar is gone. The screen's own
 * large title still renders below it; this only provides the return affordance.
 */
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, space, press } from '@/design/tokens';

export function BackBar({ onBack }: { onBack: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        hitSlop={10}
        onPress={onBack}
        style={({ pressed }) => [styles.btn, { opacity: pressed ? press.opacity : 1 }]}
      >
        <Icon name="chevronLeft" size={24} color={color.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 2 },
  btn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
});
