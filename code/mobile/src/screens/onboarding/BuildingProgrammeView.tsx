/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROGRAMME BEING BUILT — a simulation, not a spinner.
 *
 * ⛔ FOUNDER, 2026-08-05: *"the loading screen READING WHAT YOU TOLD ME is not good enough and needs
 * redesigning. Maybe actually show a simulation of the building process… be as creative as you
 * possibly can here, because this is the part where the user sees the programme they are getting
 * for the first time, and right now it is very banal."* Then, on the draft:
 *
 *   > *"I want it as a simulation — every ruler starting from zero and travelling to the number
 *   > that was set. And the second screen with the exercise and the weight is a bit odd, because
 *   > you only see a name and a weight — what about the sets and the reps? Show the muscle name and
 *   > then all the exercises chosen for that muscle, with the weight, reps and sets."*
 *
 * ── THREE MOVEMENTS ─────────────────────────────────────────────────────────────────────────────
 *   1. HER OWN NUMBERS arrive where she left them. Each ruler fills from zero and the figure counts
 *      with it. The last thing she touched is the first thing she sees, so the screen is obviously
 *      about her rather than about us.
 *   2. THE MUSCLES fill in, one at a time, each with the lifts chosen for it — load, sets and band.
 *      A name and a weight is a shopping list; three numbers is a prescription.
 *   3. THE PROGRAMME IS NAMED. `CoachPlan` has carried a name since it was designed and nothing has
 *      ever shown it at full size. It is the beat that turns a loading screen into a delivery.
 *
 * ── ⚠️ IT NEVER DRAWS A LIFT THAT HAS NOT ARRIVED ───────────────────────────────────────────────
 * The muscles are real — they come from the catalogue, which the app knows without asking anyone —
 * and each one's rows stand as DASHES until the coach's answer lands. Then they fill fast and the
 * name follows. Inventing plausible-looking lifts to animate over would be the app performing work
 * it had not done, on the one screen whose entire job is showing her what it did.
 *
 * ⚠️ AND IT MUST NOT DRAG AFTER THE PLAN LANDS (his own instruction). The fill is 90 ms a row once
 * the answer is in hand, whatever is left; nothing waits for an animation that has stopped being
 * about anything.
 *
 * Pure — every phase is reachable from props, which is the only way anyone sees the middle two.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import { Legend, Stage } from '@/components/ds';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, space, stage } from '@/design/tokens';

/** One lift, as the simulation prints it — the three numbers a prescription needs. */
export interface BuildLift {
  name: string;
  /** Already written ("100 kg"), or absent while this row is still a dash. */
  load?: string | null;
  /** "4 × 8–10", or absent. */
  scheme?: string | null;
}

/** One muscle and the lifts chosen for it. */
export interface BuildMuscle {
  muscle: string;
  lifts: BuildLift[];
}

export interface BuildingProgrammeViewProps {
  /** Her three answers, for the rulers. */
  days: number;
  weight: number;
  age: number;
  unit: string;
  /** How far through movement one — 0 to 1. The rulers fill and the figures count with it. */
  fill: number;
  /** The muscles considered, in order. Drawn as they arrive. */
  muscles: BuildMuscle[];
  /** The programme's name, when the coach has given one — movement three. */
  programmeName?: string | null;
  /** "7 muscles · 22 lifts", under the name. */
  summary?: string | null;
}

export function BuildingProgrammeView(props: BuildingProgrammeViewProps) {
  const { t } = useCopy();
  const named = !!props.programmeName;

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Legend size={11} track={0.2}>
            {named ? t('ob.buildYourProgramme') : props.muscles.length ? t('ob.buildChoosing') : t('ob.buildReading')}
          </Legend>
        </View>

        {named ? (
          /* ── MOVEMENT THREE — it has a name, so it is a thing she was given. ── */
          <View style={styles.namedBody}>
            <View style={styles.namedRule} />
            <Text style={styles.programmeName} numberOfLines={4}>{bidi(props.programmeName!)}</Text>
            {props.summary ? <Text style={styles.summary}>{props.summary}</Text> : null}
          </View>
        ) : props.muscles.length === 0 ? (
          /* ── MOVEMENT ONE — her own three numbers, arriving where she left them. ── */
          <View style={styles.rulers}>
            <Ruler label={t('ob.daysLabel')} value={props.days} to={props.days / 7} fill={props.fill} />
            <Ruler
              label={t('ob.weightLabel')}
              value={props.weight}
              unit={props.unit}
              to={Math.min(1, props.weight / 140)}
              fill={props.fill}
            />
            <Ruler label={t('ob.ageLabel')} value={props.age} to={Math.min(1, props.age / 80)} fill={props.fill} />
          </View>
        ) : (
          /* ── MOVEMENT TWO — a muscle at a time, three numbers a lift. ── */
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {props.muscles.map((m) => (
              <View key={m.muscle} style={styles.group}>
                <Text style={styles.muscle}>{t(`muscle.${m.muscle}`).toUpperCase()}</Text>
                {m.lifts.map((l, i) => {
                  const waiting = !l.load && !l.scheme;
                  return (
                    <View key={`${m.muscle}_${i}`} style={styles.liftRow}>
                      <Text style={[styles.liftName, waiting && styles.waiting]} numberOfLines={1}>
                        {waiting ? '·········' : bidi(l.name)}
                      </Text>
                      {/* ⚠️ A DASH, NEVER A ZERO. A row the coach has not answered for yet has no
                          load; printing "0 kg" would be the app inventing a prescription. */}
                      <Text style={[styles.liftLoad, waiting && styles.waiting]}>{l.load ?? '— —'}</Text>
                      <Text style={[styles.liftScheme, waiting && styles.waiting]}>{l.scheme ?? '— × —'}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

/**
 * One ruler, filling from zero.
 *
 * ⚠️ THE FIGURE COUNTS WITH THE TRACK. A bar that grows while its number sits already-correct
 * beside it is an animation pretending to be a measurement — and this screen's whole claim is that
 * the measuring is real. Under reduced motion both simply arrive, which is the same fact without
 * the travel.
 */
function Ruler({
  label,
  value,
  unit,
  to,
  fill,
}: {
  label: string;
  value: number;
  unit?: string;
  to: number;
  fill: number;
}) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    grow.value = reduced ? 1 : withTiming(fill, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [fill, grow, reduced]);

  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, grow.value * to)) * 100}%` }));
  const shown = reduced ? value : Math.round(value * Math.max(0, Math.min(1, fill)));

  return (
    <View style={styles.ruler}>
      <Legend size={11} track={0.14}>{label}</Legend>
      <View style={styles.figureRow}>
        <Text style={styles.figure}>{shown}</Text>
        {unit ? <Text style={styles.figureUnit}>{unit}</Text> : null}
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, bar]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  head: { paddingHorizontal: space.gutter, paddingTop: 22 },

  /* ── movement one ── */
  rulers: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, gap: 34 },
  ruler: { gap: 6 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  figure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 40, color: stage.ink0, textAlign: 'left' },
  figureUnit: { fontFamily: font.sans, fontSize: 15, color: stage.ink2, textAlign: 'left' },
  track: { height: 3, borderRadius: 3, backgroundColor: 'rgba(241,238,229,0.11)', overflow: 'hidden' },
  trackFill: { height: 3, borderRadius: 3, backgroundColor: stage.ink1 },

  /* ── movement two ── */
  list: { paddingHorizontal: space.gutter, paddingTop: 18, paddingBottom: 28 },
  group: { marginBottom: 14 },
  /*
   * ⚠️ NOT OCHRE, though it was the obvious choice for a section head. The palette's law is that
   * **ochre is the MARK and nothing else** (founder, ratified 2026-07-13) — spending it on seven
   * headers here would make the wordmark one decoration among many on the first screen that has to
   * establish it. Cream at the muted step, uppercase and tracked, does the same job of separating a
   * group from its rows.
   */
  muscle: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    letterSpacing: 1.6,
    color: stage.ink2,
    marginBottom: 4,
    textAlign: 'left',
  },
  liftRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 5 },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: 14, color: stage.ink1, textAlign: 'left' },
  liftLoad: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 14, color: stage.ink0, minWidth: 62, textAlign: 'right' },
  liftScheme: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 13, color: stage.ink2, minWidth: 66, textAlign: 'right' },
  waiting: { color: '#57534a' },

  /* ── movement three ── */
  namedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter },
  namedRule: { height: 1, backgroundColor: 'rgba(241,238,229,0.14)', marginBottom: 20 },
  // The largest type in onboarding. A playlist without a name is a list of songs.
  programmeName: { fontFamily: font.serif, fontSize: 38, lineHeight: 42, color: stage.ink0, textAlign: 'left' },
  summary: { marginTop: 16, fontFamily: font.mono, fontSize: 13, color: stage.ink2, textAlign: 'left' },
});
