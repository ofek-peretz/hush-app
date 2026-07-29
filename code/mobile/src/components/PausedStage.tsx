/**
 * PAUSED (v7 13.1) — the stage a workout rests on.
 *
 * "The pause screen holds the usual controls — and, set lower and calmer, one honest line:
 * something doesn't feel right. Present, never pushy."
 *
 * A FULL STAGE, not a sheet. That distinction is the screen: a sheet is something that has come up
 * OVER what you were doing and is waiting to be dismissed, which is a small hurry. A pause is not a
 * hurry — it is the session standing still, so the whole page stands still with it and says "take
 * the time you need". Nothing is dimmed underneath, because there is nothing to get back to yet.
 *
 * ONE component, both stages. The gym session and a live run pause the same way — same mark, same
 * two acts, same door — because they are the same act, and an athlete should not have to learn a
 * second pause screen for the second half of the product.
 *
 * The composition, top to bottom:
 *   · the pause mark — two bars, drawn rather than iconographic; this is the one place it appears
 *   · what is paused, as a legend ("PAUSED · BENCH PRESS")
 *   · the sentence, in the coach's serif
 *   · the two acts: resume (moss), and end (outlined — an end is never the loud one)
 *   · at the very bottom, the pain door (§13) — set apart so it is present without being offered
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, press } from '@/design/tokens';

interface Props {
  /** What is paused — the lift, or the kind of run. Rides the legend beside the word PAUSED. */
  subject?: string | null;
  /** Anything the stage should state above the acts — a run's clock and distance. */
  children?: React.ReactNode;
  onResume: () => void;
  /** Label for the ending act; the two stages end different things ("session" / "run"). */
  endLabel: string;
  onEnd: () => void;
  /**
   * §13 — opens the pain report. Absent on a stage where it has nothing to act on (a run trains no
   * muscle Hush prescribes), and the door then simply does not draw.
   */
  onPain?: () => void;
}

export function PausedStage({ subject, children, onResume, endLabel, onEnd, onPain }: Props) {
  const { t } = useCopy();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.body}>
          {/* The pause mark — two bars. Drawn, not an icon: at this size it is the subject of the
              screen rather than a control's glyph. */}
          <View style={styles.mark}>
            <View style={styles.markBar} />
            <View style={styles.markBar} />
          </View>

          <Legend size={11} track={0.16} align="center">
            {subject ? `${t('pauseSheet.legend')} · ${subject}` : t('pauseSheet.legend')}
          </Legend>

          <Text style={styles.title} accessibilityRole="header">{t('pauseSheet.title')}</Text>

          {children}

          <View style={styles.acts}>
            {/* MOSS, and the only lit thing on the page — resuming is what this screen is for. */}
            <Button variant="signal" size="crossing" block label={t('pauseSheet.resume')} onPress={onResume} />
            {/* Outlined, never clay: ending a session is a decision, not a danger. */}
            <Button variant="secondary" size="crossing" block label={endLabel} onPress={onEnd} />
          </View>
        </View>

        {/* THE DOOR. Set apart at the foot of the page, in the tone the whole of §13 is written in.
            It is not a third act — pain is not a peer of resume and end. It is a door, and one you
            only find if you are looking for it. */}
        {onPain ? (
          <View style={styles.doorRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pain.affordance')}
              onPress={onPain}
              style={({ pressed }) => [styles.door, { opacity: pressed ? press.opacity : 1 }]}
            >
              <Icon name="alert" size={16} color={color.alert} strokeWidth={1.9} />
              <Text style={styles.doorText}>{t('pain.affordance')}</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: color.bg },
  safe: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 40 },

  mark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  markBar: { width: 5, height: 26, borderRadius: 2, backgroundColor: color.textPrimary },

  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 36, color: color.textPrimary, textAlign: 'center' },

  acts: { alignSelf: 'stretch', gap: 12, marginTop: 6 },

  doorRow: { alignItems: 'center', paddingHorizontal: 40, paddingBottom: 40 },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(197,106,78,0.3)',
    backgroundColor: 'rgba(197,106,78,0.1)',
  },
  doorText: { fontFamily: font.sansMedium, fontSize: 14, color: color.alert, textAlign: 'left' },
});
