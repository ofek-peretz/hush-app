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

// 

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Arrive, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { TrackArt, TreadmillArt } from './WhereArt';
import { db } from '@/data/local/db';
import { font, textScale, stage as stageC, signal } from '@/design/tokens';

export function CardioReady({ onBegin }: { onBegin: (indoor: boolean) => void }) {
  const { t } = useCopy();
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE TAB SAID NOTHING ABOUT HER RUNNING (founder, 2026-08-21).
   *
   * She opens Cardio and the screen offers her a choice and a drawing. Nothing on it knows she has
   * ever run: not how far she went last time, not when. Every app she might use instead opens on her
   * last activity, and this one had the room for it — `art` is `flex: 1`, so the drawing was
   * spreading to fill a hole rather than sitting in a composition.
   *
   * ⚠️ ONE LINE, AND ONLY WHEN IT IS TRUE. A first-time athlete has no last run, and a placeholder
   * row saying so would be the app talking about nothing — the same rule the load delta already
   * holds (`theLoadCarriesItsOwnNews`). Before her first run the screen is exactly as it was.
   *
   * ⚠️ IT STATES A DATE, NEVER AN INTERVAL. "Three days ago" is a past timeframe, which Decision 1
   * (2026-06-14) bans across the whole product and `forbiddenGlobally` enforces — the model is
   * horizonless and the copy does not get to imply otherwise. A date is a fact about a run; an
   * interval is the app counting the days she did not train, which is the shape of guilt this
   * product refuses everywhere else.
   *
   * Distance and date, and nothing more: a pace belongs beside the run it came from, and a second
   * figure here would turn a reminder into a report.
   */
  const [last, setLast] = useState<{ km: number; date: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void db
      .loadCardio()
      .then((all) => {
        if (!alive) return;
        const done = all.filter((a) => a.distanceKm > 0).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
        const a = done[0];
        if (!a) return;
        setLast({
          km: a.distanceKm,
          date: new Date(a.startedAt).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
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
        {/*
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12).

          Two beats, matching what this screen IS: its name and what it is asking, then the one
          decision on it. The two choice cards land together — they are a question with two answers,
          and letting one land before the other would put a thumb on it.
        */}
        {/* ⛔ THE ONE CENTRED HEAD IN FIVE TABS (design review 2026-09-01). Every other tab opens
            with the serif title on the start edge at 40 — this one centred a 60-point title under
            a brand bracket, so the bar's five screens disagreed about what a screen head is. The
            bracket goes with it: the wordmark lives on Today; a tab does not re-introduce the brand. */}
        <Arrive order={0} style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">{t('cardio.readyTitle')}</Text>
          <Text style={styles.sub}>{t('cardio.readySub')}</Text>
        </Arrive>

        {/*
          ⛔ TWO CARDS, NOT A PILL PAIR — the shape he named. `SegmentedControl` is the app's control
          for switching a VIEW (Lifts / Log); this is a choice about where she is standing, and it
          is the only decision on the screen. The onboarding sex control is the precedent and the
          geometry is lifted from it: equal cards, a lit border on the answer, a wash on press.
        */}
        <Arrive order={1} style={styles.choices}>
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
        </Arrive>

        {/* What each one measures with, said plainly — she is choosing a sensor. */}
        <Text style={styles.whereNote}>{t(indoor ? 'cardio.treadmillNote' : 'cardio.outsideNote')}</Text>

        {last ? (
          <Text style={styles.lastRun}>
            {t('cardio.lastRun', { km: last.km.toFixed(1), date: last.date })}
          </Text>
        ) : null}

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
  head: { alignItems: 'stretch', gap: 8, paddingHorizontal: 30, paddingTop: 20 },
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
  /* the bracket-dot styles left with the mark they dressed (design review 2026-09-01) — an
     orphaned style is the exact class of thing this codebase has been bitten by before. */
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 42, color: stageC.ink0, textAlign: 'left' },
  sub: { fontFamily: font.serif, fontSize: 22, lineHeight: 30, color: stageC.ink1, textAlign: 'left' },
  whereNote: { fontFamily: font.sans, fontSize: 20, lineHeight: 28, color: stageC.ink2, textAlign: 'center', alignSelf: 'center', maxWidth: 320, marginTop: 18, paddingHorizontal: 26 },
  /* Quieter than the sensor note above it — a reminder, not an instruction. */
  /* ⛔ `stageC.ink3` DOES NOT EXIST — found the day the typechecker was allowed to look (2026-08-23).
     The style compiled to `color: undefined`, so this line rendered in RN's platform default. There
     is deliberately no legible tier below `ink2` on the stage (see tokens: "there is no legible tier
     below the muted one"), so muted is what "quieter" honestly means here. */
  lastRun: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stageC.ink2, textAlign: 'center', alignSelf: 'center', maxWidth: 320, marginTop: 14, paddingHorizontal: 26 },
  footer: { paddingHorizontal: 26, paddingBottom: 14 },
});
