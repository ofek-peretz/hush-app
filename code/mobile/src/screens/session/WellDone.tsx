/**
 * 4.18 Well Done. The session is SAVED before this screen (invariant §8.4); show
 * "Well done." for ~2s, then return to Home. No summary, no interaction, no
 * back-stack entry. Success haptic fires once (§7). The Portrait simply appears
 * unlocked in its tab on the 7th session (§4.25/§5.7) — no separate unlock screen.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { wellDone as wellDoneHaptic } from '@/platform/haptics';
import { color, heroTitle } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

const DWELL_MS = 2000; // ~2s (§4.18, §6)

export function WellDone({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();

  useEffect(() => {
    wellDoneHaptic();
    const id = setTimeout(() => {
      app.clearPortraitFlag();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }, DWELL_MS);
    return () => clearTimeout(id);
  }, [navigation, app]);

  return (
    <View style={styles.root}>
      <Text style={styles.message} numberOfLines={1} accessibilityRole="header">
        {t('wellDone.message')}
        <Text style={styles.period}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  message: { ...heroTitle(40, -0.035), color: color.textPrimary, fontSize: 40, fontWeight: '600' },
  period: { color: color.textTertiary },
});
