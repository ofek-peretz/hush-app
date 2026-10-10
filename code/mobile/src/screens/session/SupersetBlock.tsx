/**
 * ════ A SUPERSET, SAID OUT LOUD ════
 *
 * Founder, 2026-10-11, after a live walk: *"לגבי סופרסט — שזה יהיה מוצג אחרת לגמרי כי כרגע זה לא
 * ברור בכלל. אולי צריך מסך שכתוב סופרסט עם התראה וסרטון של שני התרגילים שצריך לבצע."*
 *
 * What stood before: the single word "סופרסט" over the first lift, and the second lift's name set
 * in the same 36 points beneath it — two names of equal weight, neither marked as the one she is
 * doing. The second lift's own screen said nothing at all, the rest between rounds introduced the
 * first lift again as "a new exercise", and the count over the name flipped between "exercise 4 of
 * 6" and "exercise 5 of 6" on every set.
 *
 * Three pieces, one statement each:
 *
 *   · BEFORE A ROUND (the rest card): the word, the round, BOTH lifts performed side by side, each
 *     with the load to set up — and, before the first round only, one sentence that says what a
 *     superset asks of her. This is his screen: the announcement, and the two films.
 *   · ON A SET: a row of steps that marks which of the lifts she is on, and under the name the one
 *     thing that differs from an ordinary set — what follows the moment she racks it.
 *   · THE COUNT above (`LiftRail`): "superset · round 2 of 3", which does not flip.
 *
 * Read from `SessionSuperset` (`domain/supersetView` through the store), so a pair and a three-lift
 * circuit are drawn by the same code.
 */

//

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { Legend, opticalFigure } from '@/components/ds';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { STAGE_FRAME_ASPECT } from '@/motion/frame';
import { exerciseMotion } from '@/motion/registry';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { noLoadIsBand } from '@/domain/loadPresentation';
import { font, signal, stage, textScale } from '@/design/tokens';
import { useApp } from '@/state/stores/appStore';
import type { SessionSuperset } from '@/state/stores/sessionStore';

type Units = Parameters<typeof displayWeight>[1];

/** Which of the round's lifts she is on: done · now · still to come. A row, so it turns with the
 *  language — step one stands where a Hebrew reader starts. */
export function SupersetSteps({ count, position }: { count: number; position: number }) {
  const { t } = useCopy();
  return (
    <View
      style={styles.steps}
      accessibilityRole="text"
      accessibilityLabel={`${t('workout.superset')} · ${t('workout.supersetStep', { n: position, m: count })}`}
    >
      {Array.from({ length: count }, (_, i) => {
        const at = i + 1;
        return (
          <React.Fragment key={at}>
            {i > 0 ? <View style={[styles.stepLink, at <= position && styles.stepLinkDone]} /> : null}
            <View style={[styles.stepNode, at < position && styles.stepDone, at === position && styles.stepNow]}>
              <Text style={[styles.stepFigure, at === position && styles.stepFigureNow, at < position && styles.stepFigureDone]}>{at}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Under the lift's name: what happens the moment this set is racked. */
export function SupersetAfter({ superset }: { superset: SessionSuperset }) {
  const { t } = useCopy();
  const count = superset.exerciseIds.length;
  if (superset.position < count) {
    const nextId = superset.exerciseIds[superset.position];
    return (
      <View style={styles.after}>
        <Text style={styles.afterLabel}>{t('workout.supersetThenNow')}</Text>
        <Text style={styles.afterName} numberOfLines={2}>{exerciseDisplayName(nextId)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.after}>
      <Text style={styles.afterLabel}>
        {superset.round < superset.rounds ? t('workout.supersetThenRest', { n: superset.round + 1 }) : t('workout.supersetLast')}
      </Text>
    </View>
  );
}

/** Both lifts of the round, performed side by side — the announcement's two films. */
export function SupersetFigures({ superset, fps }: { superset: SessionSuperset; fps: number }) {
  const app = useApp();
  const figure = app.profile?.sex === 'female' ? 'female' : 'male';
  // Two films read at this size; a three-lift circuit would be three postage stamps, so it shows
  // the lift she walks to first — the crossing's own rule.
  const ids = superset.exerciseIds.length === 2 ? superset.exerciseIds : superset.exerciseIds.slice(0, 1);
  return (
    <View style={styles.figures} pointerEvents="none">
      {ids.map((id, i) => {
        const rig = exerciseMotion(id);
        return (
          <View key={`${id}-${i}`} style={styles.figureCell}>
            {rig ? <MotionFigure rig={rig} tone="stage" fps={fps} fit figure={figure} style={styles.figure} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** The rest card before a round: the word, the round, each lift with the load to set up. */
export function SupersetCard({ superset, units }: { superset: SessionSuperset; units: Units }) {
  const { t } = useCopy();
  const count = superset.exerciseIds.length;
  return (
    <View style={styles.card}>
      {/* The word alone: the round is counted on the rail above this card, once. */}
      <Legend size={17} track={0.18} tone="onStage" style={styles.cardLegend}>
        {t('workout.superset')}
      </Legend>
      <View style={styles.rows}>
        {superset.lifts.map((lift, i) => {
          const weight = displayWeight(lift.weightKg, units);
          return (
            <View key={`${lift.exerciseId}-${i}`} style={styles.row}>
              <View style={styles.rowNode}>
                <Text style={styles.rowFigure}>{i + 1}</Text>
              </View>
              <Text style={styles.rowName} numberOfLines={2}>{bidi(exerciseDisplayName(lift.exerciseId))}</Text>
              <Text style={[styles.rowWeight, weight == null && styles.rowWeightWord]}>
                {weight != null ? opticalFigure(weight) : t(noLoadIsBand(lift.exerciseId) ? 'workout.bandWord' : 'workout.bodyweight')}
                {weight != null ? <Text style={styles.rowUnit}> {unitLabel(units)}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
      {/* Said once, before the first round — by the second she has done it. */}
      {superset.round === 1 ? (
        <Text style={styles.how}>{count === 2 ? t('workout.supersetHowTwo') : t('workout.supersetHowMany', { n: count })}</Text>
      ) : null}
    </View>
  );
}

// The phone's type floor is 17 (`typeHasAFloor`), so the figure in a node is 17 and the node is cut to hold it.
const NODE = 30;

const styles = StyleSheet.create({
  // ── the steps over the name ──
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepLink: { width: 26, height: 2, borderRadius: 1, backgroundColor: 'rgba(241,238,229,0.22)' },
  stepLinkDone: { backgroundColor: signal[0] },
  stepNode: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(241,238,229,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNow: { backgroundColor: stage.ink0, borderColor: stage.ink0 },
  stepDone: { backgroundColor: 'transparent', borderColor: signal[0] },
  stepFigure: { fontFamily: font.monoSemibold, fontSize: textScale.sm, lineHeight: 21, color: stage.ink2, textAlign: 'center' },
  stepFigureNow: { color: stage[0] },
  stepFigureDone: { color: signal[0] },

  // ── under the name ──
  after: { alignItems: 'center', marginTop: 10, gap: 3, maxWidth: 330 },
  afterLabel: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 22, color: stage.ink2, textAlign: 'center' },
  afterName: { fontFamily: font.sansSemibold, fontSize: textScale.lg, lineHeight: 25, color: stage.ink1, textAlign: 'center' },

  // ── the two films ──
  figures: { flexGrow: 1, flexShrink: 1, minHeight: 0, maxHeight: 250, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  figureCell: { flex: 1, minWidth: 0, maxHeight: '100%', alignItems: 'center', justifyContent: 'center' },
  figure: { width: '100%', aspectRatio: STAGE_FRAME_ASPECT, maxHeight: '100%' },

  // ── the card ──
  card: {
    backgroundColor: 'rgba(241,238,229,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 14,
    // Clear of the button under it — the single-lift card is shorter and never reached it.
    marginBottom: 14,
  },
  cardLegend: { color: signal[0] },
  rows: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowNode: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(241,238,229,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFigure: { fontFamily: font.monoSemibold, fontSize: textScale.sm, lineHeight: 21, color: stage.ink1, textAlign: 'center' },
  rowName: { flex: 1, minWidth: 0, fontFamily: font.sansSemibold, fontSize: 19, lineHeight: 24, color: stage.ink0, textAlign: 'left' },
  rowWeight: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 22, lineHeight: 27, color: stage.ink0, textAlign: 'left' },
  rowWeightWord: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: stage.ink1, textAlign: 'left' },
  rowUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  how: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 23, color: stage.ink1, textAlign: 'left' },
});
