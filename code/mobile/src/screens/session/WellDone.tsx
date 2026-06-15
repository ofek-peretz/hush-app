/**
 * 1.18 Well Done. 2.5s acknowledgment, then route. No summary. No interaction,
 * no back-stack entry (spec §1.18, §3.2). Success haptic fires once (§8.3).
 * The session was already SAVED before this screen (invariant §8.4).
 *
 * Routes to the Capability Portrait first-unlock when this session completed
 * calibration (unlockedPortrait); otherwise to Home (spec §1.18, §2.7).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { wellDone as wellDoneHaptic } from '@/platform/haptics';
import { color, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

const DWELL_MS = 2500;

export function WellDone({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { unlockedPortrait } = route.params;

  useEffect(() => {
    wellDoneHaptic();
    const id = setTimeout(() => {
      // The 7th Well Done fades directly into the Portrait first-unlock (§2.7).
      app.clearPortraitFlag();
      if (unlockedPortrait) {
        navigation.replace('PortraitUnlock');
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    }, DWELL_MS);
    return () => clearTimeout(id);
  }, [navigation, app, unlockedPortrait]);

  return (
    <View style={styles.root}>
      <Text style={styles.message}>{t('wellDone.message')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, alignItems: 'center', justifyContent: 'center' },
  message: { color: color.textPrimary, fontSize: typo.titleXL.size, fontWeight: typo.titleXL.weight },
});
