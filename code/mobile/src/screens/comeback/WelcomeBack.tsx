/**
 * THE WELCOME BACK (v7 10.1) — "opened after eleven quiet days".
 *
 * "No 'you broke your streak,' no deload — the first set decides what still fits."
 *
 * Everything about this screen is that sentence. The days away are STATED, in the legend, once, as
 * a fact — the same way Hush states a load. They are never counted against her and never framed as
 * lost.
 *
 * ⛔ AND IT USED TO CLAIM MORE THAN THAT, UNTIL B-9 MADE THE CLAIM FALSE (2026-08-19).
 *
 * The header and the copy both said *"your weights stand where you left them … the numbers did not
 * move while you were gone."* They do move: `applyDetrainingV5` writes `ExerciseState.load` after
 * `COMEBACK_DAYS`, decaying by `DETRAIN_RETAINED_PER_MONTH` to a `DETRAIN_FLOOR` — ratified as B-9
 * on the very screen that was denying it. The register still carries S-38's *"no easing, no ×0.90,
 * no 'welcome back' adjustment"* alongside B-9, so the document asserts both and the screen picked
 * the one that was no longer true.
 *
 * ⚠️ THE CARD WAS ALWAYS HONEST — it draws her CURRENT loads, so it has been showing the eased
 * numbers all along. Only the sentence over it was wrong, and only the part that promised nothing
 * had changed. What the screen actually guarantees survives intact and is what it says now: being
 * away is not punished here, and the bar decides the rest.
 *
 * The one act is to start. There is no "ease me back in" she has to ask for — no screen negotiates
 * a load in this product; the first set does (see `domain/comeback`).
 */

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Arrive, Button, Legend } from '@/components/ds';
import { RangeMark } from '@/components/RangeMark';
import { useCopy } from '@/i18n/useCopy';
import { monoCanDraw } from '@/design/monoVoice';
import { color, font, signal } from '@/design/tokens';

/** One lift, standing where she left it. */
export interface StandingLift {
  exerciseId: string;
  name: string;
  /** Display-unit load; null = bodyweight, and the row then says so rather than printing nothing. */
  load: number | null;
}

export interface WelcomeBackViewProps {
  daysAway: number;
  /** The workout waiting, and the loads it holds. Empty → the card does not draw. */
  lifts: StandingLift[];
  unit: string;
  onStart: () => void;
}

export function WelcomeBackView({ daysAway, lifts, unit, onStart }: WelcomeBackViewProps) {
  const { t } = useCopy();
  const shown = lifts.slice(0, 2); // the handoff shows two — enough to prove the point, not a list

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        {/*
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12) — and reached six screens out of forty-seven. This
          is the screen an athlete meets after being away: it opens by saying how long it has been
          and then that it is glad she is back. A greeting that is simply THERE on the first frame
          is a greeting nobody made. Three beats: the mark and the absence, the sentence, the loads
          that waited for her.
        */}
        <Arrive order={0}>
          <RangeMark width={44} height={18} tone={signal[0]} />
        </Arrive>
        <Arrive order={0}>
          <Legend size={17} track={0.16}>{t('comeback.legend', { days: daysAway })}</Legend>
        </Arrive>

        <Arrive order={1}>
          <Text style={styles.title} accessibilityRole="header">{t('comeback.title')}</Text>
          <Text style={styles.sub}>{t('comeback.sub')}</Text>
        </Arrive>

        {shown.length > 0 ? (
          <Arrive order={2} style={styles.card}>
            <Legend size={17} track={0.14}>{t('comeback.cardLegend')}</Legend>
            {shown.map((l, i) => (
              <View key={l.exerciseId} style={[styles.row, i > 0 && styles.rowRuled]}>
                <Text style={styles.liftName} numberOfLines={1}>{l.name}</Text>
                {l.load != null ? (
                  /* ⛔ ONE NODE, ONE FACT. The load and its unit were sibling `<Text>`s, so
                     VoiceOver read "41", stopped, then "kg" — two stops for one number, on the
                     screen whose entire promise is that the numbers did not move while she was
                     gone. Same pattern as `session/WellDone.Fact`. */
                  <View style={styles.loadRow} accessible accessibilityLabel={`${l.load} ${unit}`}>
                    <Text style={styles.load}>{l.load}</Text>
                    <Text style={[styles.unit, !monoCanDraw(unit) && styles.unitWord]}>{unit}</Text>
                  </View>
                ) : (
                  <Text style={styles.bodyweight}>{t('comeback.bodyweight')}</Text>
                )}
              </View>
            ))}
          </Arrive>
        ) : null}
      </View>

      <View style={styles.foot}>
        <Button variant="signal" size="act" block label={t('comeback.start')} onPress={onStart} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 24 },
  // 34 in the coach's serif — a greeting, said once.
  title: { fontFamily: font.serif, fontSize: 34, lineHeight: 39, color: color.textPrimary, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },

  card: {
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRuled: { borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.1)', paddingTop: 12 },
  // The lift is named in the serif; its load is the measured figure beside it.
  liftName: { flexShrink: 1, fontFamily: font.serif, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  loadRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  load: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: color.textPrimary, textAlign: 'left' },
  unit: { fontFamily: font.mono, fontSize: 17, color: color.textMuted, textAlign: 'left' },
  unitWord: { fontFamily: font.sans, textAlign: 'left' },
  bodyweight: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12 },
});
