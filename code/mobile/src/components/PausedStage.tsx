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

// 

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
  /**
   * ⛔ THE COACH, HERE AND NOWHERE ELSE IN A WORKOUT (founder 2026-08-05): *"take the AI screen off
   * the workout — leave it only for the case of an injury. Remove the button from every workout
   * state except the injury state."*
   *
   * It was a disc on every live set. What it added over the pain door beside it was a place to have
   * a conversation while standing at a loaded bar; what it cost was a second thing to look at on
   * the one screen that is supposed to hold a single number. Both doors are here now, at the foot
   * of a session that is standing still — which is when talking is a reasonable thing to be doing.
   */
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

          {/* 12.5, not 11 (founder B.7). His complaint was about the run, but this stage is
              reached FROM the run and carries the same kind of word — and the reason 11 read as
              deliberate in the design file is that the file was drawn in English, where this slot
              holds LATIN CAPITALS at heavy tracking. Hebrew has no uppercase, so "מושהה · ריצה"
              got the small size and none of what makes it legible. The lifting session raises the
              same stage, so it moves with it: one pause screen for the whole product (its own
              header says so) cannot be legible on one surface and not the other. */}
          <Legend size={17} track={0.16} align="center">
            {subject ? `${t('pauseSheet.legend')} · ${subject}` : t('pauseSheet.legend')}
          </Legend>

          <Text style={styles.title} accessibilityRole="header">{t('pauseSheet.title')}</Text>

          {children}

          <View style={styles.acts}>
            {/* ⛔ CREAM, NOT MOSS (design review 2026-09-01). `tokens.ts` rules that "the PRIMARY
                BUTTON ground is CREAM now" — this was the one primary act in the product still
                painted moss, and moss is reserved for "a decision made", not for a button's
                ground. `onstage` is the same cream act every other stage screen uses. */}
            <Button variant="onstage" size="crossing" block label={t('pauseSheet.resume')} onPress={onResume} />
            {/* ⛔ A BARE ACT, NOT A TWIN (design review 2026-09-01). Outlined at the same height,
                12 points under Resume, the two read as one shape — and this screen is used bent
                over a phone on the floor. Ending is quieter than resuming BY FORM, not only by
                fill: a ghost act cannot be mistaken for the cream one above it. Never clay:
                ending a session is a decision, not a danger. */}
            <Button variant="onstageGhost" size="crossing" block label={endLabel} onPress={onEnd} />
          </View>
        </View>

        {/* THE DOOR. Set apart at the foot of the page, in the tone the whole of §13 is written in.
            It is not a third act — pain is not a peer of resume and end. It is a door, and one you
            only find if you are looking for it. */}
        {/* ⛔ THE COACH'S DOOR IS DELETED (founder, 2026-08-12). It opened a sheet whose three
            actions he closed in one sentence — swap already has its own control on the first set
            and on every transition rest, and a lift she wants skipped is a lift she wants replaced.
            Pain keeps its door; it is the only one left, which is the tone §13 always wanted. */}
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

  acts: { alignSelf: 'stretch', gap: 20, marginTop: 6 },

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
  doorText: { fontFamily: font.sansMedium, fontSize: 17, color: color.alert, textAlign: 'left' },
});
