/**
 * CardioReady — the Cardio tab's resting screen (handoff 3.4a). It lives INSIDE the tab (the bottom
 * bar stays visible, Cardio active); only the live run is a full-screen stage pushed above the bar.
 *
 * A dark stage: the bracket-dot mark, the serif "Cardio", "Recorded beside your lifting.", and one
 * cream "Start cardio" button. No mode picker, no goal picker (v7 open-tracking, founder 2026-07-23).
 * "Start cardio" pushes the Main-stack Cardio stage, which opens straight into the 3·2·1 countdown.
 *
 * The bracket-dot's arrival animation is a later polish layer; this is the static truth.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { font, textScale, stage as stageC, signal } from '@/design/tokens';

export function CardioReady({ onBegin }: { onBegin: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <View style={styles.bracket}>
            <View style={styles.bracketLine} />
            <View style={styles.bracketCapL} />
            <View style={styles.bracketCapR} />
            <View style={styles.bracketDot} />
          </View>
          <Text style={styles.title} accessibilityRole="header">{t('cardio.readyTitle')}</Text>
          <Text style={styles.sub}>{t('cardio.readySub')}</Text>
        </View>
        <View style={styles.footer}>
          <Button
            variant="onstage"
            size="act"
            block
            label={t('cardio.startCardio')}
            onPress={onBegin}
            leading={<Icon name="play" size={18} color={stageC[0]} />}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: stageC[0] },
  safe: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26, paddingHorizontal: 40, marginTop: -10 },
  bracket: { width: 64, height: 22, marginBottom: 4 },
  bracketLine: { position: 'absolute', left: 0, top: 10, width: 64, height: 1.5, backgroundColor: signal[0] },
  bracketCapL: { position: 'absolute', left: 0, top: 2, width: 1.5, height: 18, backgroundColor: signal[0] },
  bracketCapR: { position: 'absolute', right: 0, top: 2, width: 1.5, height: 18, backgroundColor: signal[0] },
  bracketDot: { position: 'absolute', left: 27, top: 5, width: 12, height: 12, borderRadius: 6, backgroundColor: signal[0] },
  title: { fontFamily: font.serif, fontSize: 54, lineHeight: 56, color: stageC.ink0, textAlign: 'center' },
  sub: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 19, lineHeight: 27, color: stageC.ink1, textAlign: 'center', maxWidth: 260 },
  footer: { paddingHorizontal: 26, paddingBottom: 14 },
});
