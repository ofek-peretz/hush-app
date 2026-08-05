/**
 * THE WELCOME BACK (v7 10.1) — "opened after eleven quiet days".
 *
 * "No 'you broke your streak,' no deload. Your weights stand where you left them — the first set
 * decides whether they still fit."
 *
 * Everything about this screen is that sentence. The days away are STATED, in the legend, once, as
 * a fact — the same way Hush states a load. They are never counted against her, never framed as
 * lost, and nothing on the page is lower than it was because of them. The card underneath shows the
 * loads exactly as she left them, which is the promise made visible: the numbers did not move while
 * she was gone.
 *
 * The one act is to start. There is no "ease me back in" — that would be Hush guessing at a body it
 * has not measured since, and the engine refuses to guess (see `domain/comeback`).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
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
        <RangeMark width={44} height={18} tone={signal[0]} />
        <Legend size={11} track={0.16}>{t('comeback.legend', { days: daysAway })}</Legend>

        <Text style={styles.title} accessibilityRole="header">{t('comeback.title')}</Text>
        <Text style={styles.sub}>{t('comeback.sub')}</Text>

        {shown.length > 0 ? (
          <View style={styles.card}>
            <Legend size={11} track={0.14}>{t('comeback.cardLegend')}</Legend>
            {shown.map((l, i) => (
              <View key={l.exerciseId} style={[styles.row, i > 0 && styles.rowRuled]}>
                <Text style={styles.liftName} numberOfLines={1}>{l.name}</Text>
                {l.load != null ? (
                  <View style={styles.loadRow}>
                    <Text style={styles.load}>{l.load}</Text>
                    <Text style={[styles.unit, !monoCanDraw(unit) && styles.unitWord]}>{unit}</Text>
                  </View>
                ) : (
                  <Text style={styles.bodyweight}>{t('comeback.bodyweight')}</Text>
                )}
              </View>
            ))}
          </View>
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
  sub: { fontFamily: font.sans, fontSize: 15, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },

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
  liftName: { flexShrink: 1, fontFamily: font.serif, fontSize: 15, color: color.textPrimary, textAlign: 'left' },
  loadRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  load: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: color.textPrimary, textAlign: 'left' },
  unit: { fontFamily: font.mono, fontSize: 15, color: color.textMuted, textAlign: 'left' },
  unitWord: { fontFamily: font.sans, textAlign: 'left' },
  bodyweight: { fontFamily: font.sansMedium, fontSize: 13, color: color.textMuted, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12 },
});
