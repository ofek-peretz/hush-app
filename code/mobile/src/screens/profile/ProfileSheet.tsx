/**
 * 1.19 Profile Sheet — account/identity hub, NOT a performance dashboard.
 * Identity block: name, sex · height · weight (name from auth provider; if
 * unavailable, stats only — no placeholder name, spec §10.2).
 *
 * M1 scope: identity block + Sign Out (returns to Enrollment). The full row
 * set (Program / History / "What Hush knows" / Settings / Health / About) lands
 * with those screens' milestones; "What Hush knows" is absent until the Portrait
 * unlocks (spec §2.11, §6.2) — clean absence, no tease.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, layout, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProfileSheet'>;

export function ProfileSheet({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const p = app.profile;
  const portraitUnlocked = app.modeState.portrait === 'PORTRAIT_UNLOCKED';
  const pendingPortraitForecast = app.forecasts.some((f) => f.type === 'portrait' && f.state === 'PENDING');

  const stats = [
    p?.sex,
    p?.heightCm ? `${p.heightCm} cm` : null,
    p?.weightKg ? `${p.weightKg} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.identity}>
        {p?.name ? <Text style={styles.name}>{p.name}</Text> : null}
        {stats.length > 0 ? <Text style={styles.stats}>{stats}</Text> : null}
      </View>
      <View style={styles.rows}>
        <View style={styles.row}>
          <TextAction label={t('profile.program')} onPress={() => navigation.navigate('Program')} />
        </View>
        <View style={styles.row}>
          <TextAction label={t('profile.history')} onPress={() => navigation.navigate('History')} />
        </View>
        {/* "What Hush knows" appears only after the Portrait unlocks (§2.11). */}
        {portraitUnlocked ? (
          <View style={styles.row}>
            <TextAction label={t('profile.whatHushKnows')} onPress={() => navigation.navigate('PortraitRevisit')} />
          </View>
        ) : null}
        <View style={styles.row}>
          <TextAction label={t('profile.settings')} onPress={() => navigation.navigate('Settings')} />
        </View>

        {/* Test harness — compiled out of release builds (__DEV__ only). */}
        {__DEV__ && !portraitUnlocked ? (
          <View style={styles.row}>
            <TextAction
              label="DEV · jump to Portrait unlock"
              onPress={async () => {
                await app.devUnlockPortrait();
                navigation.navigate('PortraitUnlock');
              }}
            />
          </View>
        ) : null}
        {__DEV__ && portraitUnlocked && app.pendingThreshold ? (
          <View style={styles.row}>
            <TextAction label="DEV · show threshold alert" onPress={() => navigation.navigate('ThresholdAlert')} />
          </View>
        ) : null}
        {__DEV__ && pendingPortraitForecast ? (
          <>
            <View style={styles.row}>
              <TextAction
                label="DEV · resolve forecast: success"
                onPress={async () => {
                  await app.devResolvePortraitForecast(true);
                  navigation.navigate('PortraitRevisit', { receipt: true });
                }}
              />
            </View>
            <View style={styles.row}>
              <TextAction label="DEV · resolve forecast: fail (silent)" onPress={() => app.devResolvePortraitForecast(false)} />
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSurface, paddingHorizontal: layout.screenMargin, paddingTop: 32 },
  identity: { marginBottom: 32 },
  name: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight },
  stats: { color: color.textSecondary, fontSize: typo.bodyM.size, marginTop: 8 },
  rows: { marginTop: 16, alignItems: 'flex-start' },
  row: { marginBottom: 8 },
});
