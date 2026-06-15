/**
 * 1.10 Portrait threshold alert (spec §1.10, §2.4, §4.8, §7.10; §10.12).
 *
 * Rare, event-driven surfacing when a capability crosses a threshold. Stated
 * factually, first-person, no alarm. "See your body" -> Portrait; "Later" -> Home.
 * Coalesced upstream — never two outstanding alerts.
 *
 * The push-notification trigger that opens this is a deferred native surface;
 * the event detection + copy + routing are complete here.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { thresholdLine } from '@/domain/portrait';
import { color, layout, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ThresholdAlert'>;

export function ThresholdAlert({ navigation }: Props) {
  const { t, line } = useCopy();
  const app = useApp();
  const ev = app.pendingThreshold;
  const copy = ev ? line(thresholdLine(ev)) : null;

  function dismiss(toPortrait: boolean) {
    app.clearThreshold();
    if (toPortrait) navigation.replace('PortraitRevisit');
    else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.line}>{copy ?? ''}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t('portrait.seeYourBody')} onPress={() => dismiss(true)} />
        <View style={styles.gap} />
        <TextAction label={t('portrait.later')} onPress={() => dismiss(false)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  line: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, lineHeight: typo.titleL.lineHeight },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
  gap: { height: 12 },
});
