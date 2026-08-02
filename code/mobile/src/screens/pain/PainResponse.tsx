/**
 * THE COACH RESPONDS — "real-time, with the why".
 *
 * ⛔ FOUNDER, ON BUILD 39: *"On the injury screen you told me explicitly that marking an injury
 * routes to an AI screen where it talks, and what actually appears is the screen that was there
 * before."*
 *
 * He was right, and the file's own header said so: it opened with "THE ENGINE RESPONDS", and it
 * picked the replacement lift itself through `bestSwap`. **It was the last live engine call left in
 * any screen in this app** — one line, deciding an exercise, in the one place the ruling is most
 * explicit that the coach decides.
 *
 * It asks now, and shows what comes back. `reportPain` has already told the coach and rebuilt the
 * programme around the rest window; this screen is where she hears it in words, while she is still
 * standing at the rack.
 *
 * ── AND IT NO LONGER PROPOSES A SUBSTITUTE ──────────────────────────────────────────────────────
 * The swap card is gone with `bestSwap`. A replacement the coach did not choose is the engine
 * deciding an exercise and dressing it as advice — and it was doing exactly that, from a pool, with
 * a five-word "why" that was a copy string rather than a reason. What she gets instead is the
 * coach's actual sentence about her actual shoulder.
 *
 * ── WHAT SURVIVES ──────────────────────────────────────────────────────────────────────────────
 * The muscle is resting, with its own end date — `reportPain` wrote the ease and the programme was
 * rebuilt around it. That is a fact, not a decision, and this screen still reads it back.
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
import { askCoachAboutPain } from '@/platform/coach/afterSession';
import { exerciseDisplayName } from '@/data/exercises';
import { EASE_DAYS, type PainSeverity } from '@/domain/painReport';
import { color, font, textScale, space, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PainResponse'>;

export function PainResponse({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { muscle, severity, exerciseId } = route.params;
  const name = t(`muscle.${muscle}`);

  /*
   * WHAT THE COACH SAYS ABOUT IT — asked once, when the screen opens.
   *
   * `null` while the call is out, and `''` when it could not be reached. Both are drawn: a coach
   * that is thinking says so, and a coach that could not be reached must never be silently replaced
   * by the app's own opinion, which is the whole ruling.
   */
  const [coachSay, setCoachSay] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    void askCoachAboutPain(muscle, severity, exerciseId ? exerciseDisplayName(exerciseId) : null)
      .then((say) => alive && setCoachSay(say))
      .catch(() => alive && setCoachSay(''));
    return () => {
      alive = false;
    };
  }, [muscle, severity, exerciseId]);


  function accept() {
    navigation.goBack();
  }


  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <RangeMark width={44} height={18} tone={signal[0]} />
        <Legend size={11}>{t('pain.adjusted', { muscle: name })}</Legend>

        <Text style={styles.title} accessibilityRole="header">
          {t('pain.responseTitleRested', { muscle: name })}
        </Text>

        {/* WHAT THE COACH SAID. A thinking line while the call is out; nothing at all if it could
            not be reached — the app does not get to fill that silence with its own advice. */}
        {coachSay === null ? (
          <Text style={styles.coachSay}>{t('coach.thinking')}</Text>
        ) : coachSay.length > 0 ? (
          <Text style={styles.coachSay}>{coachSay}</Text>
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
        {/* One act. The screen no longer proposes a substitute, so there is nothing to accept OR
            decline — she has read what the coach said and goes back to her session. Swapping a lift
            by hand is a door she already has on the stage itself. */}
        <Button variant="signal" size="act" block label={t('pain.gotIt')} onPress={accept} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 22 },
  // The coach speaking, at 30 — an answer, not a headline.
  coachSay: {
    fontFamily: font.serif,
    fontSize: 19,
    lineHeight: 28,
    color: color.textSecondary,
    textAlign: 'left',
  },
  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 36, color: color.textPrimary, textAlign: 'left' },

  easeNote: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  easeText: { flex: 1, fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.textSecondary, textAlign: 'left' },
  easeLead: { fontFamily: font.sansSemibold, color: signal[0] }, // rtl-ok: nested span inside easeText, which sets textAlign
  easeTail: { color: color.textSecondary }, // rtl-ok: nested span inside easeText, which sets textAlign

  footnote: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: color.textMuted, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
