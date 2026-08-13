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
// @ts-nocheck

// 

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { TrackArt, TreadmillArt } from './WhereArt';
import { font, textScale, stage as stageC, signal } from '@/design/tokens';

export function CardioReady({ onBegin }: { onBegin: (indoor: boolean) => void }) {
  const { t } = useCopy();
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE ONE QUESTION THIS SCREEN HAS TO ASK (founder, 2026-08-12)
   *
   *   *"יש רק הליכה או ריצה בחוץ או הליכה או ריצה בהליכון. זהו."*
   *
   * Four things she can do, and the app only needs to know ONE bit to serve all four: is she
   * outdoors or on a belt. Walking versus running is measured — derived from her pace, per segment,
   * and never asked (`cardioMath.kcalPerKgKm`).
   *
   * ⚠️ SO THIS IS NOT A FOUR-WAY PICKER, and that is the whole point of the two-message argument
   * behind it. A picker with Walk / Run on it would ask her to declare something the phone is about
   * to measure better than she can guess — and would then be WRONG the moment she walks a hill in
   * the middle of a run. The prescribed path never reaches here at all: a coach's treadmill session
   * carries `tracked: 'motion'` and selects the source without anyone choosing.
   *
   * ⚠️ AND OUTDOORS IS THE DEFAULT because it is the one that needs a satellite warmed up. Getting
   * it wrong indoors costs her nothing — she taps once and the receiver was never opened.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [indoor, setIndoor] = useState(false);
  const artW = Math.min(320, Math.round(useWindowDimensions().width - 52));
  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE SCREEN STARTS AT THE TOP (founder, 2026-08-12)

            *"שים את ה-CARDIO בראש המסך ותגדיל דחוף את הפקדים של בחוץ או בהליכון ותעצב אותם כמו
            בחירת המין ב-ONBOARDING, תגדיל את כל המלל כאן דחוף … יש לך כאן מסך שלם שאתה מסרב
            להשתמש בו."*

          It was one centred block floating in the middle of an 844-point screen: a 54-point title,
          an italic line, a 34-point pill pair and a caption, with three hundred points of black
          above and below. **The one control on the page was the smallest thing on it.**

          The name goes to the top where a screen's name belongs, the choice takes the two-card
          shape the onboarding sex control uses — his own reference — and the space that leaves is
          the drawing's (`WhereArt`).
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        <View style={styles.head}>
          <View style={styles.bracket}>
            <View style={styles.bracketLine} />
            <View style={styles.bracketCapL} />
            <View style={styles.bracketCapR} />
            <View style={styles.bracketDot} />
          </View>
          <Text style={styles.title} accessibilityRole="header">{t('cardio.readyTitle')}</Text>
          <Text style={styles.sub}>{t('cardio.readySub')}</Text>
        </View>

        {/*
          ⛔ TWO CARDS, NOT A PILL PAIR — the shape he named. `SegmentedControl` is the app's control
          for switching a VIEW (Lifts / Log); this is a choice about where she is standing, and it
          is the only decision on the screen. The onboarding sex control is the precedent and the
          geometry is lifted from it: equal cards, a lit border on the answer, a wash on press.
        */}
        <View style={styles.choices}>
          {([false, true] as const).map((v) => (
            <Pressable
              key={String(v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: indoor === v }}
              accessibilityLabel={t(v ? 'cardio.treadmill' : 'cardio.outside')}
              onPress={() => setIndoor(v)}
              style={({ pressed }) => [styles.choice, indoor === v && styles.choiceOn, pressed && styles.choicePressed]}
            >
              <Text style={[styles.choiceText, indoor === v && styles.choiceTextOn]}>
                {t(v ? 'cardio.treadmill' : 'cardio.outside')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* What each one measures with, said plainly — she is choosing a sensor. */}
        <Text style={styles.whereNote}>{t(indoor ? 'cardio.treadmillNote' : 'cardio.outsideNote')}</Text>

        {/* ⛔ AND THE ROOM UNDERNEATH IS THE DRAWING'S — see `WhereArt` for why it is vector, and
            why nothing in either picture is a measurement. */}
        <View style={styles.art}>
          {indoor ? <TreadmillArt width={artW} height={artW * 0.5} /> : <TrackArt width={artW} height={artW * 0.5} />}
        </View>

        <View style={styles.footer}>
          <Button
            variant="onstage"
            size="act"
            block
            label={t('cardio.startCardio')}
            onPress={() => onBegin(indoor)}
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
  head: { alignItems: 'center', gap: 12, paddingHorizontal: 26, paddingTop: 28 },
  /* ⛔ Two cards, the onboarding sex control's own geometry — his reference. 54 → 76 tall, because
     this is the only decision on the page and it was the smallest thing on it. */
  choices: { flexDirection: 'row', gap: 12, paddingHorizontal: 26, marginTop: 34 },
  choice: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
  },
  choiceOn: { borderColor: signal[0], backgroundColor: 'rgba(169,196,159,0.10)' },
  /* A press is a WASH, never a fade (founder A.13). */
  choicePressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  choiceText: { fontFamily: font.sansMedium, fontSize: 24, color: stageC.ink2, textAlign: 'center' },
  choiceTextOn: { color: stageC.ink0 },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bracket: { width: 64, height: 22, marginBottom: 4 },
  bracketLine: { position: 'absolute', left: 0, top: 10, width: 64, height: 1.5, backgroundColor: signal[0] },
  bracketCapL: { position: 'absolute', left: 0, top: 2, width: 1.5, height: 18, backgroundColor: signal[0] },
  bracketCapR: { position: 'absolute', right: 0, top: 2, width: 1.5, height: 18, backgroundColor: signal[0] },
  bracketDot: { position: 'absolute', left: 27, top: 5, width: 12, height: 12, borderRadius: 6, backgroundColor: signal[0] },
  title: { fontFamily: font.serif, fontSize: 60, lineHeight: 64, color: stageC.ink0, textAlign: 'center' },
  sub: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 22, lineHeight: 30, color: stageC.ink1, textAlign: 'center', maxWidth: 300 },
  whereNote: { fontFamily: font.sans, fontSize: 20, lineHeight: 28, color: stageC.ink2, textAlign: 'center', alignSelf: 'center', maxWidth: 320, marginTop: 18, paddingHorizontal: 26 },
  footer: { paddingHorizontal: 26, paddingBottom: 14 },
});
