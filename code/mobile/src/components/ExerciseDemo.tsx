/**
 * Exercise Demo (spec §4.15) — the silent form guide bottom-sheet, rebuilt to the
 * Claude Design `FormGuideSheet` (ui_kits/app/v4.jsx): eyebrow → title → FormMedia
 * (looping demo video when one exists, else the vector silhouette) → technique
 * cues → Close. One coherent affordance whether or not a video is supplied. Pure
 * reference; no logging.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Eyebrow } from '@/components/Eyebrow';
import { FormMedia } from '@/components/FormMedia';
import { Button } from '@/components/ds';
import { color, font, textScale, tracking, trackingPx } from '@/design/tokens';

interface Props {
  title: string;
  cues: string[];
  focusLabel: string; // retained for API compatibility (no longer rendered as a label)
  formGuideLabel: string; // top eyebrow ("Form")
  doneLabel: string; // close button label
  onDone: () => void;
  /** The exercise whose demo video to play, when one exists (else the silhouette fallback). */
  exerciseId?: string | null;
}

export function ExerciseDemo({ title, cues, formGuideLabel, doneLabel, onDone, exerciseId }: Props) {
  return (
    <BottomSheet onClose={onDone} background={color.surface} heightFraction={0.66}>
      {/* Fixed-height sheet: the cues scroll inside their own region so the Close
          button is ALWAYS on screen, never pushed past the bottom on small phones. */}
      <View style={styles.body}>
        <Eyebrow label={formGuideLabel} size={11} trackingPx={1.5} />
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.media}>
          <FormMedia exerciseId={exerciseId} title={title} />
        </View>
        <ScrollView style={styles.cuesScroll} contentContainerStyle={styles.cues} showsVerticalScrollIndicator={false}>
          {cues.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.cue}>{c}</Text>
            </View>
          ))}
        </ScrollView>
        <Button variant="secondary" block label={doneLabel} onPress={onDone} style={styles.close} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 4, marginBottom: 14 },
  media: { marginBottom: 16 },
  cuesScroll: { flex: 1 },
  cues: { gap: 6, paddingBottom: 4 },
  cueRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: font.sans, fontSize: textScale.base, color: color.textMuted, lineHeight: 24 },
  cue: { flex: 1, fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, lineHeight: 24 },
  close: { marginTop: 16 },
});
