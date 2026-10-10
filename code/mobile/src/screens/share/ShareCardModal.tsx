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
import { Button, SegmentedControl } from '@/components/ds';
import { ShareCard } from '@/components/share/ShareCard';
import { copySticker, share } from '@/platform/share';
import { track } from '@/platform/telemetry';
import { useCopy } from '@/i18n/useCopy';
import { color, stage, font, textScale, space, radius, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ShareCardModal'>;

/** The switch's words, one per story kind. A record is never offered (see below), and names the workout if it ever is. */
const STORY_LABEL: Record<string, string> = {
  session: 'share.storySession',
  week: 'share.storyWeek',
  cardio: 'share.storyCardio',
  record: 'share.storySession',
};

export function ShareCardModal({ navigation, route }: Props) {
  const { t } = useCopy();
  /*
   * ════ ✦ WHICH STORY (design audit 2026-09-29: "templates to choose — that is what people really post") ════
   *
   * A door may hand the modal its other stories (`alternates`): Well Done and the Circle offer the
   * workout AND the week. The card she opened on is first and is the default — the founder's ruling
   * stands (device QA 2026-08-23: the door opens THE WORKOUT, always; a record rides it as a line and
   * is never a rival card, so no record is ever offered here as an alternative). One kind per option;
   * a door with nothing else to offer draws no switch at all.
   */
  const choices = [route.params.card, ...(route.params.alternates ?? [])].filter(
    (c, i, all) => all.findIndex((o) => o.kind === c.kind) === i && c.kind !== 'record',
  );
  const [kind, setKind] = useState<string>(route.params.card.kind);
  const card = choices.find((c) => c.kind === kind) ?? route.params.card;
  const cardRef = useRef<View>(null);
  /* The sticker face of the same card, drawn UNDER the preview at the same size: a capture reads a
     view's own layers, so it can be taken without the athlete ever seeing the card change. */
  const stickerRef = useRef<View>(null);
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
    const res = await share.captureAndShare(cardRef, `ferrox-${card.kind}.png`, t('share.sheetTitle'));
    // The funnel's second half — the result used to be thrown away, so the one growth surface the
    // product has was entirely unmeasured. 'shared' here means the OS sheet resolved, the closest
    // honest proxy iOS offers for "it left the phone".
    void track('share_completed', { kind: card.kind, result: res });
    setBusy(false);
    if (res !== 'shared') setNote(t('share.unavailable'));
  }

  async function onSticker() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res = await copySticker(stickerRef);
    void track('share_sticker_copied', { kind: card.kind, result: res });
    setBusy(false);
    setNote(res === 'copied' ? t('share.stickerCopied') : t('share.unavailable'));
  }

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} accessibilityLabel={t('common.close')} />
      <SafeAreaView style={styles.safe} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.preview} pointerEvents="none">
          <View>
            <View style={styles.stickerUnder}>
              <ShareCard ref={stickerRef} card={card} width={previewW} sticker />
            </View>
            <ShareCard ref={cardRef} card={card} width={previewW} />
          </View>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle} accessibilityRole="header">{t('share.sheetTitle')}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {choices.length > 1 ? (
            <SegmentedControl
              block
              size="md"
              options={choices.map((c) => ({ value: c.kind, label: t(STORY_LABEL[c.kind]) }))}
              value={kind}
              onChange={(v) => {
                setKind(v);
                void track('share_story_switched', { kind: v });
              }}
              style={styles.choice}
            />
          ) : null}
          <Button variant="onstage" size="lg" block label={t('share.shareAction')} onPress={onShare} disabled={busy} />
          {/* ✦ Over her own photo — the card as a sticker, pasted into the story (see `copySticker`). */}
          <Button variant="onstageGhost" size="md" block label={t('share.copySticker')} onPress={onSticker} disabled={busy} />
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
  stickerUnder: { position: 'absolute', top: 0, start: 0 },

  choice: { marginBottom: 14 },
  sheet: {
    backgroundColor: stage[1],
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 12,
  },
  /* The UI face, not the coach's serif (design audit 2026-09-29): a sheet asking about an OPERATION is
     the app speaking — the same voice as the stage's end-workout sheet. The serif is the coach's. */
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.lg, color: stage.ink0, textAlign: 'center', marginBottom: 4 },
  note: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 19, color: stage.ink2, textAlign: 'center' },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.done },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },
});
