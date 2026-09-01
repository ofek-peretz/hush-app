/**
 * Share sheet (§9.3) — the card, previewed, then handed to the system.
 *
 * The card is drawn once (the on-screen preview IS the capture source — one ref, no
 * hidden duplicate). A single primary action captures it to a PNG and opens the OS
 * share sheet, where Stories / WhatsApp / Save / More already live: the athlete picks
 * the destination and taps it themselves. Hush never posts for them (founder) — it
 * offers the finished card and steps back. On a runtime without native capture (web /
 * Expo Go / simulator without the modules) the action says so quietly instead of
 * failing; the preview still stands.
 */

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ds';
import { ShareCard } from '@/components/share/ShareCard';
import { share } from '@/platform/share';
import { track } from '@/platform/telemetry';
import { useCopy } from '@/i18n/useCopy';
import { color, stage, font, textScale, space, radius, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ShareCardModal'>;

export function ShareCardModal({ navigation, route }: Props) {
  const { t } = useCopy();
  const card = route.params.card;
  const cardRef = useRef<View>(null);
  // The share funnel's first half (audit lever 2): the modal opening IS the intent. Once per mount.
  useEffect(() => {
    void track('share_opened', { kind: card.kind });
    // card.kind is fixed for the modal's life; re-tracking on a card change is not a thing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  // The preview width — the same view is what the capture reads, at device pixel density.
  const previewW = Math.min(300, width - 88);

  async function onShare() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res = await share.captureAndShare(cardRef, `hush-${card.kind}.png`, t('share.sheetTitle'));
    // The funnel's second half — the result used to be thrown away, so the one growth surface the
    // product has was entirely unmeasured. 'shared' here means the OS sheet resolved, the closest
    // honest proxy iOS offers for "it left the phone".
    void track('share_completed', { kind: card.kind, result: res });
    setBusy(false);
    if (res !== 'shared') setNote(t('share.unavailable'));
  }

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} accessibilityLabel={t('common.close')} />
      <SafeAreaView style={styles.safe} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.preview} pointerEvents="none">
          <ShareCard ref={cardRef} card={card} width={previewW} />
        </View>

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle} accessibilityRole="header">{t('share.sheetTitle')}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Button variant="onstage" size="lg" block label={t('share.shareAction')} onPress={onShare} disabled={busy} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('share.done')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.ghost, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Text style={styles.ghostLabel}>{t('share.done')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(9,8,7,0.82)' },
  safe: { flex: 1, justifyContent: 'flex-end' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  sheet: {
    backgroundColor: stage[1],
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 12,
  },
  sheetTitle: { fontFamily: font.serif, fontSize: textScale.lg, color: stage.ink0, textAlign: 'center', marginBottom: 4 },
  note: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 19, color: stage.ink2, textAlign: 'center' },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.done },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },
});
