/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRE-WORKOUT SCREEN — what she reads with her bag on her shoulder.
 *
 * ⛔ FOUNDER, 2026-08-05, correcting the week board I had drawn:
 *
 *   > *"Why not make it so that pressing a day with a workout opens a full-screen card with the
 *   > workout's content and the AI's requirements for each exercise — not technique, but the
 *   > professional requirements: the reps, the weights, or updates where it raised or lowered the
 *   > weight on a particular exercise. And below it the exercise list with the option to watch the
 *   > video exactly as today, and then pressing that starts the workout."*
 *
 * This is better than what I proposed, and it resolves something I had left unsolved: **where the
 * lift list goes when it leaves Today.** It goes here — and it arrives with the thing it was always
 * missing. The coach's reasoning existed only on Saturday, in the Mirror, days after it could have
 * been useful. Here it is in her hand while she is deciding whether to go.
 *
 * ── WHAT HE THEN TOOK OFF IT ────────────────────────────────────────────────────────────────────
 *   > *"Remove the explanation of why on each exercise — pressing that exercise opens the WHY
 *   > screen. And the sentence at the top, I suggest removing it: nobody reads that before a
 *   > workout."*
 *
 * Both right, and the second is his own law returning to me: a label that explains a control steals
 * the control's job. The paragraph was me explaining the list underneath it. The list can speak.
 *
 * The delta chip stays. `↑` is a fact she reads in half a second and is the reason to look at the
 * row at all; the sentence behind it is what the row opens.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Legend, Stage } from '@/components/ds';
import { PlanLifts, type PlanLift } from '@/components/PlanLifts';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { color, font, space, stage, signal } from '@/design/tokens';

export interface PreWorkoutProps {
  /** The workout's own name — the coach's, in her language. */
  name: string;
  /** The weekday it sits on, already spoken ("Monday"), or absent on a week with no days yet. */
  dayLabel?: string | null;
  /** "6 lifts · ~50 min", assembled by the caller exactly as Today used to. */
  shape?: string | null;
  lifts: PlanLift[];
  units: 'kg' | 'lb';
  /**
   * ⛔ HOW MANY OF *THESE* LIFTS MOVED — and it is a FACT, not a door (audit, 2026-08-05).
   *
   * The first cut made it a button into the Mirror, which re-opened the bug I had spent the morning
   * fixing on the other two screens: the pill would say "2 changes" about this workout and land her
   * on a letter saying "5 changes" about the week. **Two screens, two answers, one word.**
   *
   * The ROWS are the doors — each changed lift opens its own reason — so the pill has nothing to
   * hide behind it and no reason to be pressable. It states what the list beneath it shows.
   */
  changes?: number | null;
  onForm: (exerciseId: string) => void;
  onWhy?: (exerciseId: string) => void;
  onStart: () => void;
  onClose: () => void;
  /**
   * ⚠️ ALREADY TRAINED — a record, not an offer (founder 2026-07-11). She may open a finished
   * session to re-read it; she may not start it again, and the button is what says so.
   */
  done?: boolean;
  /** Gated by the trial: the plan is still hers to read, the act is not. */
  locked?: boolean;
}

export function PreWorkoutView(props: PreWorkoutProps) {
  const { t } = useCopy();
  const changed = props.changes != null && props.changes > 0;

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          {props.dayLabel ? <Legend size={11} track={0.2}>{props.dayLabel}</Legend> : <View />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={props.onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.dim]}
          >
            <Icon name="close" size={18} color={stage.ink0} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* The name is the screen. It is the coach's word for the day, so it takes the serif. */}
          <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
            {bidi(props.name)}
          </Text>

          <View style={styles.metaRow}>
            {props.shape ? <Legend size={11} track={0.18}>{props.shape}</Legend> : null}
            {changed ? (
              <View style={styles.pill}>
                <Legend size={11} track={0.08} weight="semibold" tone="accent">
                  {t('home.briefChangesShort', { count: props.changes! })}
                </Legend>
              </View>
            ) : null}
          </View>

          {/*
            ⛔ NO PARAGRAPH HERE (founder 2026-08-05). A block of the coach's prose stood above this
            list for one draft. *"Nobody reads that before a workout"* — and it was me explaining the
            table underneath, which is the thing his copy law is about.
          */}
          <PlanLifts lifts={props.lifts} units={props.units} onForm={props.onForm} onWhy={props.onWhy} />
        </ScrollView>

        <View style={styles.footer}>
          {props.done ? (
            /* A record wears no offer's clothes — the same refusal the week column makes. */
            <View style={styles.doneNote}>
              <Icon name="check" size={17} color={signal[0]} strokeWidth={2.6} />
              <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
            </View>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!!props.locked}
              label={t('home.begin', { name: props.name })}
              onPress={props.onStart}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 14,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(241,238,229,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 24 },
  // 31 — the largest thing on the screen, because it is what tells her what today IS.
  title: { fontFamily: font.serif, fontSize: 31, lineHeight: 35, color: stage.ink0, textAlign: 'left' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9, marginBottom: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: 'rgba(169,196,159,0.12)' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 26, paddingTop: 10 },
  doneNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 14 },
  doneText: { fontFamily: font.sansMedium, fontSize: 15, color: stage.ink1, textAlign: 'left' },
  dim: { opacity: 0.6 },
});
