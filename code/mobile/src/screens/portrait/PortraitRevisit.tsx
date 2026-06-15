/**
 * 1.9 Capability Portrait — revisit / compare (spec §1.9, §2.4, §4.8, §7.10).
 *
 * Re-view the current five bars + commitment line. "Compare to when you started"
 * fades in week-one ghost bars in place + one proof sentence. The Compare
 * control is HIDDEN (not disabled) until a second snapshot exists (§7.10).
 *
 * RECEIPT MODE (revised design): when reached via a resolved Portrait forecast
 * (route param `receipt`), the screen opens already in Compare mode and shows
 * the receipt line in place of the (now-fulfilled) commitment — "Eight weeks
 * ago this was your weakest. Told you." This is the loud-when-right half of the
 * asymmetry; the miss path never lands here (§5.4).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CapabilityPortrait } from '@/components/CapabilityPortrait';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { commitmentLine, compareProof } from '@/domain/portrait';
import { track, trackFirst } from '@/platform/telemetry';
import { color, layout, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PortraitRevisit'>;

export function PortraitRevisit({ route }: Props) {
  const { t, line } = useCopy();
  const app = useApp();
  const snapshot = app.currentSnapshot;
  const baseline = app.baselineSnapshot;
  const isReceipt = route.params?.receipt === true;
  const [comparing, setComparing] = useState(isReceipt);

  // Arriving via a receipt consumes the pending-receipt flag (shown once).
  useEffect(() => {
    if (isReceipt) app.clearPortraitReceipt();
  }, [isReceipt, app]);

  // Heal a snapshot missed by an offline calibration-completing session, and
  // record the revisit (trust telemetry: how often authority is re-examined).
  useEffect(() => {
    void app.ensurePortraitSnapshot();
    void trackFirst('first_portrait_viewed');
    void track('portrait_revisited', { receipt: isReceipt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!snapshot) {
    return <SafeAreaView style={styles.root} />;
  }

  const commitment = line(commitmentLine(snapshot));
  // Compare requires a distinct second snapshot (§7.10).
  const canCompare = !!baseline && baseline.timestamp !== snapshot.timestamp;
  const proof = comparing && baseline ? line(compareProof(baseline, snapshot)) : null;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.headline} accessibilityRole="header">{t('portrait.headline')}</Text>
        <View style={styles.bars}>
          <CapabilityPortrait snapshot={snapshot} baseline={baseline} showCompare={comparing} />
        </View>
        {isReceipt ? (
          // Loud when right — the kept promise, surfaced once (§4.6, §5.4).
          <Text style={styles.receipt}>{t('portrait.receiptClosed')}</Text>
        ) : commitment ? (
          <Text style={styles.commitment}>{commitment}</Text>
        ) : null}
        {proof ? <Text style={styles.proof}>{proof}</Text> : null}
        {canCompare && !isReceipt ? (
          <View style={styles.compare}>
            <TextAction label={t('portrait.compare')} onPress={() => { setComparing((v) => { void track('compare_toggled', { on: !v }); return !v; }); }} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  body: { paddingTop: 32, paddingHorizontal: layout.screenMargin, paddingBottom: 48 },
  headline: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, marginBottom: 40 },
  bars: { marginBottom: 24 },
  commitment: { color: color.textPrimary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight, marginTop: 8 },
  receipt: { color: color.textPrimary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight, marginTop: 8 },
  proof: { color: color.textSecondary, fontSize: typo.bodyM.size, lineHeight: typo.bodyM.lineHeight, marginTop: 16 },
  compare: { marginTop: 32, alignItems: 'flex-start' },
});
