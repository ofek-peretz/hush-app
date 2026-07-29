/**
 * THE ENGINE RESPONDS (v7 13.3) — "real-time, with the why".
 *
 * "Left shoulder tender → shoulders go off for a set window and the lift swaps within the same
 * muscle — the swap that's already legal, not a new rule or a permanent change. Stated as fact, one
 * tap to accept."
 *
 * ════ THIS SCREEN DECIDES NOTHING ════
 * It reads back two things that have already happened, and offers one act:
 *   · the muscle is resting — `reportPain` wrote the ease and the week was rebuilt around it;
 *   · the lift is swapped — through `domain/swapPool`, the same pool every other swap uses, and the
 *     load beside it is whatever the ENGINE prescribes for the lift that came in. That is why the
 *     card can say "was 42.5" honestly: 42.5 was the old lift's number, not a discount applied here.
 *
 * The one act is ACCEPT. Declining is not a fight — "skip it today" leaves the muscle resting and
 * simply drops the lift from this session, which the athlete can already do.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { exerciseDisplayName, muscleOf } from '@/data/exercises';
import { bestSwap } from '@/domain/swapPool';
import { EASE_DAYS, type PainSeverity } from '@/domain/painReport';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, font, textScale, space, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PainResponse'>;

export function PainResponse({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const { muscle, severity, exerciseId } = route.params;
  const units = app.profile?.units ?? 'kg';
  const name = t(`muscle.${muscle}`);

  // THE SWAP — the ordinary pool, excluding what today already holds. Absent when the muscle offers
  // no admissible peer, and then the screen says only what it can: the muscle is resting.
  const replacement = exerciseId
    ? bestSwap(exerciseId, { sessionExerciseIds: session.sessionExerciseIds ?? [] })
    : undefined;

  // The muscle the session is still TRAINING — the lift's own, not the one that hurts. "Keep
  // training the chest" is the point of the swap; "keep training the shoulder" would be nonsense,
  // because the shoulder is exactly what just went to rest.
  const trained = exerciseId ? muscleOf(exerciseId) : undefined;
  const trainedName = trained ? t(`muscle.${trained}`) : null;

  const wasLoad = session.currentTarget?.recommendedWeight ?? null;
  const was = wasLoad != null ? displayWeight(wasLoad, units) : null;

  function accept() {
    if (replacement && exerciseId) session.swapCurrentExercise?.(replacement.id);
    navigation.goBack();
  }

  function skip() {
    // The muscle is already resting; skipping just drops the lift from today. Nothing to undo.
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <RangeMark width={44} height={18} tone={signal[0]} />
        <Legend size={11}>{t('pain.adjusted', { muscle: name })}</Legend>

        <Text style={styles.title} accessibilityRole="header">
          {replacement && trainedName
            ? t('pain.responseTitle', { hurt: name, trained: trainedName })
            : t('pain.responseTitleRested', { muscle: name })}
        </Text>

        {/* THE SWAP, as one card: what it was, what it is, and why in five words. */}
        {replacement && exerciseId ? (
          <View style={styles.swapCard}>
            <View style={styles.swapText}>
              <Text style={styles.wasName} numberOfLines={1}>{exerciseDisplayName(exerciseId)}</Text>
              <Text style={styles.nowName} numberOfLines={1}>{exerciseDisplayName(replacement.id)}</Text>
              <Text style={styles.swapWhy} numberOfLines={2}>{t('pain.swapWhy')}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={signal[0]} strokeWidth={2} />
          </View>
        ) : null}

        {/* The load is stated only when we have BOTH ends of it — a "was" with no "now" is a number
            that means nothing, and inventing the now would be this screen deciding a load. */}
        {replacement && was != null ? (
          <View style={styles.figures}>
            <View style={styles.figure}>
              <Legend size={10} track={0.06}>{t('pain.loadLegend')}</Legend>
              <Text style={styles.figureNote} numberOfLines={1}>{t('pain.wasLoad', { value: was, unit: unitLabel(units) })}</Text>
            </View>
          </View>
        ) : null}

        {/* THE REST, named with its own end. "Then they return on their own" is the promise the
            ease keeps by construction — nothing has to run for the muscle to come back. */}
        <View style={styles.easeNote}>
          <Icon name="circle" size={18} color={signal[0]} strokeWidth={1.8} />
          <Text style={styles.easeText}>
            <Text style={styles.easeLead}>{t('pain.easedFor', { muscle: name, days: EASE_DAYS[severity as PainSeverity] })}</Text>
            <Text style={styles.easeTail}>{t('pain.easedTail')}</Text>
          </Text>
        </View>

        <Text style={styles.footnote}>{t('pain.nothingNew')}</Text>
      </View>

      <View style={styles.foot}>
        <Button
          variant="signal"
          size="act"
          block
          label={replacement ? t('pain.continueWith', { exercise: exerciseDisplayName(replacement.id) }) : t('pain.gotIt')}
          onPress={accept}
        />
        {replacement && trainedName ? (
          <Button variant="quiet" block label={t('pain.skipToday', { muscle: trainedName })} onPress={skip} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 22 },
  // The coach speaking, at 30 — an answer, not a headline.
  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 36, color: color.textPrimary, textAlign: 'left' },

  swapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  swapText: { flex: 1, minWidth: 0, gap: 4 },
  // The lift that steps aside is struck through — the one place a line-through means anything.
  wasName: { fontFamily: font.sans, fontSize: 15, color: color.textMuted, textDecorationLine: 'line-through', textAlign: 'left' },
  nowName: { fontFamily: font.serif, fontSize: 18, color: color.textPrimary, textAlign: 'left' },
  swapWhy: { fontFamily: font.sans, fontSize: 15, color: color.textSecondary, textAlign: 'left' },

  figures: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, backgroundColor: color.fillSubtle, borderWidth: 1, borderColor: color.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 3 },
  figureNote: { fontFamily: font.sans, fontSize: 14.5, color: color.textSecondary, textDecorationLine: 'line-through', textAlign: 'left' },

  easeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: color.accentWash,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.2)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  easeText: { flex: 1, fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.textSecondary, textAlign: 'left' },
  easeLead: { fontFamily: font.sansSemibold, color: signal[0] }, // rtl-ok: nested span inside easeText, which sets textAlign
  easeTail: { color: color.textSecondary }, // rtl-ok: nested span inside easeText, which sets textAlign

  footnote: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: color.textMuted, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
