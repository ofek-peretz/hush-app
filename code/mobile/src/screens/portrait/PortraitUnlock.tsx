/**
 * 1.8 Capability Portrait — first unlock. The signature moment (spec §1.8,
 * §2.7, §4.8; UX §2.7/§2.10/§2.11, §7.4).
 *
 * Auto-presented once after the Well Done of the calibration-completing session.
 * Headline, the five bars drawing in sequentially, and the first-person
 * commitment line — which IS a falsifiable eight-week forecast (revised design):
 * Hush commits to closing the gap on the most-untapped capability. On dismissal
 * (Start), the forecast record is created and the athlete returns to Home; the
 * Portrait will resurface only if/when that forecast resolves true (§5.4).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CapabilityPortrait } from '@/components/CapabilityPortrait';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { commitmentLine } from '@/domain/portrait';
import { trackFirst } from '@/platform/telemetry';
import { color, layout, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PortraitUnlock'>;

export function PortraitUnlock({ navigation }: Props) {
  const { t, line } = useCopy();
  const app = useApp();
  const snapshot = app.currentSnapshot;

  // Heal a snapshot missed by an offline calibration-completing session, and
  // record the signature-moment view (trust telemetry).
  useEffect(() => {
    void app.ensurePortraitSnapshot();
    void trackFirst('first_portrait_viewed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitment = snapshot ? line(commitmentLine(snapshot)) : null;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.headline} accessibilityRole="header">{t('portrait.headline')}</Text>
        {snapshot ? (
          <View style={styles.bars}>
            <CapabilityPortrait snapshot={snapshot} animate />
          </View>
        ) : null}
        {commitment ? <Text style={styles.commitment}>{commitment}</Text> : null}
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          label={t('portrait.start')}
          onPress={async () => {
            // The commitment becomes a real forecast at the moment of dismissal.
            await app.createPortraitForecast();
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  body: { flex: 1, paddingTop: 72, paddingHorizontal: layout.screenMargin },
  headline: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, marginBottom: 40 },
  bars: { marginBottom: 24 },
  commitment: { color: color.textPrimary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight, marginTop: 8 },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
});
