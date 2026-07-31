/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ITEM STAGE — the three shapes the app could not run, and the line it could not say.
 *
 * The stage has only ever known one kind of work: a weight for a number of reps. That is why "any
 * goal" was a claim rather than a fact — a footballer's session has sprints and jumps and carries,
 * a marathon plan has intervals and long runs, and none of them are reps at a load. `coachPlan`
 * can now WRITE all of it; this is where the athlete meets it.
 *
 *   `time`      — held or worked for a duration.   a 45 s plank, 20 minutes on the bike
 *   `distance`  — covered.                          a 40 m carry, a 30 m sprint, 5 km
 *   `open`      — no number worth stating.          mobility, skill work, a warm-up
 *
 * (`reps` keeps its own stage in `SessionFlow` — the lit load, the rep band, the plate maths. It is
 * the most-used screen in the product and it is already right; this file does not touch it.)
 *
 * ── THE INSTRUCTION IS NOT AN EXPLANATION ───────────────────────────────────────────────────────
 * Every shape carries `say`, and it is the genuinely new element. This app's standing law is that a
 * label explaining a control steals the control's job — *"stop explaining; delete, don't shorten."*
 * `say` is not that, and the difference is worth naming so nobody deletes it on sight:
 *
 *   · "Tap to log this set"                     — explains a control. Banned, correctly.
 *   · "Take this one to a rep short of failure" — cannot be inferred from anything on screen.
 *   · "At a pace where you could hold a conversation."
 *
 * A prescription could always state how MUCH and never how. Two athletes handed "5 km" run two
 * different sessions depending on the sentence next to it, and the sentence is the coaching.
 *
 * ── ONE ACT, STILL ──────────────────────────────────────────────────────────────────────────────
 * Whatever the shape, the bottom of the stage holds exactly one control, because the hand reaching
 * for it may be under a bar or shaking after a sprint. A timed item has a second state (running),
 * never a second button.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { font, space, stage } from '@/design/tokens';
import { heroType } from '@/domain/loadPresentation';
import type { PlannedItem } from '@/domain/coachPlan';

/** mm:ss — the same reading the rest ring gives, so one clock format exists in the workout. */
export function clockOf(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A distance, in the unit the athlete would say out loud.
 *
 * Metres under a kilometre, kilometres above it — "5 km", not "5000 m", and "400 m", not "0.4 km".
 * The record stores metres always (one unit, no conversion drift); this is display only.
 */
export function distanceOf(metres: number): { figure: string; unit: string } {
  if (metres >= 1000) {
    const km = metres / 1000;
    return { figure: Number.isInteger(km) ? String(km) : km.toFixed(1), unit: 'km' };
  }
  return { figure: String(Math.round(metres)), unit: 'm' };
}

/**
 * The coach's instruction, under the figure it is about.
 *
 * In the serif, because this is Hush speaking rather than an instrument reporting — the same voice
 * split the rest of the app uses. Quiet, not a headline: the figure is what she acts on, this is
 * how. Absent when the coach said nothing, and an absent instruction leaves NO empty row.
 */
export function SayLine({ say }: { say?: string }) {
  if (!say) return null;
  return <Text style={styles.say}>{say}</Text>;
}

/** The name of the thing, above the figure. Chrome everywhere else; here it names the subject. */
function ItemName({ name }: { name: string }) {
  return (
    <Legend size={13} track={0.18} align="center" tone="onStage">
      {name}
    </Legend>
  );
}

/* ───────────────────────────────────────────────────────────────────────────────── time */

/**
 * A held or worked duration.
 *
 * It counts DOWN, and it starts on her tap rather than on arrival: a plank timer that begins while
 * she is still walking to the mat has measured the walk. When it reaches zero the stage says so and
 * hands over — there is nothing to decide at the end of a plank, and a button asking her to confirm
 * she finished would only ask her to agree with the clock.
 */
export function TimeStage({
  item,
  name,
  onDone,
}: {
  item: Extract<PlannedItem, { kind: 'time' }>;
  name: string;
  onDone: (actualSeconds: number) => void;
}) {
  const { t } = useCopy();
  const [remaining, setRemaining] = useState(item.seconds);
  const [running, setRunning] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone(item.seconds);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, item.seconds, onDone]);

  // Stopping early is a real answer, not a failure: she held it for as long as she held it, and
  // that number is the measurement. It ends the item with what actually happened.
  const stop = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(item.seconds - remaining);
  }, [item.seconds, remaining, onDone]);

  const figure = clockOf(remaining);
  return (
    <>
      <View style={styles.body}>
        <ItemName name={name} />
        <Text style={[styles.hero, heroType(figure)]} numberOfLines={1} accessibilityLabel={figure}>
          {figure}
        </Text>
        <SayLine say={item.say} />
      </View>
      <View style={styles.footer}>
        <Button
          variant="onstage"
          size="stage"
          block
          label={running ? t('workout.itemStop') : t('workout.itemStart')}
          onPress={running ? stop : () => setRunning(true)}
        />
      </View>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────── distance */

/**
 * A distance to cover, off the phone's own measurement.
 *
 * For a 40 m carry or a 30 m sprint there is nothing to track — she does it and says so. A GPS
 * movement (a run, a ride) is a different screen entirely and does not come here: it has a live
 * map, a pace and splits, and the phone knows when the distance is done without being told.
 */
export function DistanceStage({
  item,
  name,
  onDone,
}: {
  item: Extract<PlannedItem, { kind: 'distance' }>;
  name: string;
  onDone: () => void;
}) {
  const { t } = useCopy();
  const { figure, unit } = distanceOf(item.metres);
  return (
    <>
      <View style={styles.body}>
        <ItemName name={name} />
        <View style={styles.figureRow}>
          <Text style={[styles.hero, heroType(figure)]} numberOfLines={1}>
            {figure}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
        {item.load != null ? (
          <Legend size={13} track={0.14} align="center" tone="onStage">
            {t('workout.itemCarrying', { load: item.load })}
          </Legend>
        ) : null}
        <SayLine say={item.say} />
      </View>
      <View style={styles.footer}>
        <Button variant="onstage" size="stage" block label={t('workout.itemDone')} onPress={onDone} />
      </View>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────── open */

/**
 * No number worth stating — mobility, skill work, a warm-up.
 *
 * The instruction IS the item, so it takes the whole stage instead of sitting under a figure. There
 * is no hero number because inventing one ("5 minutes of mobility") would be the app deciding
 * something the coach deliberately left open.
 */
export function OpenStage({
  item,
  name,
  onDone,
}: {
  item: Extract<PlannedItem, { kind: 'open' }>;
  name: string;
  onDone: () => void;
}) {
  const { t } = useCopy();
  return (
    <>
      <View style={styles.body}>
        <ItemName name={name} />
        <Text style={styles.openHero}>{item.say ?? name}</Text>
      </View>
      <View style={styles.footer}>
        <Button variant="onstage" size="stage" block label={t('workout.itemDone')} onPress={onDone} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 28 },
  // The same lit figure as the load hero — one thing on the stage stands in the light, whatever it
  // is measuring. `heroType` carries the size, leading and tracking together (`noGlyphIsClipped`).
  hero: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    color: '#f6f3ea',
    includeFontPadding: false,
    textAlign: 'center',
    textShadowColor: 'rgba(246,243,234,0.16)',
    textShadowRadius: 50,
    textShadowOffset: { width: 0, height: 0 },
  },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  unit: { fontFamily: font.monoMedium, fontSize: 22, color: stage.ink2, textAlign: 'left' },
  // The instruction: the coach's serif, resting in shadow beneath the fact she acts on.
  say: {
    fontFamily: font.serif,
    fontSize: 17,
    lineHeight: 25,
    color: stage.ink1,
    textAlign: 'center',
    maxWidth: 320,
  },
  // With no figure to sit under, the instruction takes the stage.
  openHero: {
    fontFamily: font.serif,
    fontSize: 26,
    lineHeight: 35,
    color: stage.ink0,
    textAlign: 'center',
    maxWidth: 330,
  },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 34 },
});
