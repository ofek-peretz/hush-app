/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * KEY POINTS — what the coach wants her to know about this workout, read when she asks for it.
 *
 * ⛔ FOUNDER, 2026-08-02: *"a KEY POINTS button on the workout screen — tapping it explains the
 * points and why. Far smarter than loading up the workout screens. For cardio and for strength."*
 *
 * The reasoning behind it is in `domain/emphases`. What matters HERE is the drawing:
 *
 * ── IT IS THE STAGE, NOT A SHEET FROM THE LIGHT SIDE OF THE APP ──────────────────────────────────
 * She opens this mid-workout, in a dark gym, three seconds after looking at a black stage. A cream
 * card sliding up over that is a flashbulb. So it wears `stage.*` throughout — the training ground,
 * the training inks — and the only bright thing on it is the coach's own words.
 *
 * ── THE COACH'S VOICE IS THE SERIF, EVERYWHERE IT SPEAKS ────────────────────────────────────────
 * Same italic serif as the Why sheet's closing line, the chat and the cardio legend. One voice with
 * one face across every surface it reaches, so she never has to work out who is talking.
 *
 * ── AND THE EXERCISE IS THE QUIET HALF ──────────────────────────────────────────────────────────
 * The name is a 12px legend above the sentence, not a heading over it. She already knows what she is
 * doing; the name is here to say WHICH point this is, and then get out of the way.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheet, useSheetScroll } from '@/components/BottomSheet';
import { ScrollView } from 'react-native-gesture-handler';
import { Legend, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import type { Emphasis } from '@/domain/emphases';
import { font, stage } from '@/design/tokens';

export function EmphasesSheet({ emphases, onClose }: { emphases: Emphasis[]; onClose: () => void }) {
  const { t } = useCopy();
  const sheetScroll = useSheetScroll();
  if (emphases.length === 0) return null;
  return (
    /* `scroll` because the count is the coach's, not ours: it wrote one line for a three-lift day
       and nine for a full week's session, and a sheet that clips the ninth is worse than no sheet. */
    <BottomSheet onClose={onClose} scroll={sheetScroll}>
      <ScrollView {...sheetScroll.scrollProps} showsVerticalScrollIndicator={false} style={styles.list}>
      <Legend size={12} track={0.24} tone="onStage" style={styles.head}>
        {t('workout.keyPoints')}
      </Legend>
      {emphases.map((e) => (
        <View key={e.ex} style={styles.point}>
          <Legend size={12} track={0.22} tone="onStage" style={styles.pointEx}>
            {exerciseDisplayName(e.ex)}
          </Legend>
          <Text style={styles.pointSay}>{e.say}</Text>
        </View>
      ))}
      </ScrollView>
      <Button variant="primary" block label={t('common.close')} onPress={onClose} style={styles.foot} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Capped so a nine-point session cannot push the CLOSE button off the bottom of the sheet.
  list: { maxHeight: 360 },
  head: { marginBottom: 20 },
  // A point is parted from the next by air, not by a rule — four hairlines down a black screen read
  // as a table, and this is a briefing.
  point: { marginBottom: 26 },
  pointEx: { marginBottom: 8, opacity: 0.72 },
  pointSay: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 19,
    lineHeight: 29,
    textAlign: 'left',
    color: stage.ink0,
  },
  foot: { marginTop: 6 },
});
