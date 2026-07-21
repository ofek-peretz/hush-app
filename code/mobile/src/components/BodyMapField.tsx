/**
 * The body map itself — the ten muscles, their stances, and (in the editor) their rep bands.
 *
 * ONE component, two surfaces. The brief requires the Settings editor to REUSE the onboarding map
 * ("the same body map, editable any time"), and it means it: a map that looked one way at signup
 * and another in Settings would be two maps, and she would have to learn it twice. The screens own
 * their chrome (a scaffold and a Continue, vs. a settings header and a save); what the map IS lives
 * here.
 *
 * Controlled — it holds no map state. The stances belong to whichever screen must persist them.
 *
 * ════ THE TONE IS THE STANCE ════
 * off / normal / emphasis are three rungs of the ladder the whole app stands on: off RECEDES to the
 * well, normal sits at the raised surface, emphasis LIFTS to white. Emphasis is distance from the
 * ground, not a colour — so the map reads at a glance with no legend, and turning the legs off
 * literally sinks the bottom of the screen.
 *
 * ════ THE REGIONS ARE THE ENGINE'S ════
 * Upper/lower comes from `regionOf` — the SAME source the assembler uses to decide which days
 * exist. A screen that grouped muscles its own way would show one body and build another.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useCopy } from '@/i18n/useCopy';
import * as haptics from '@/platform/haptics';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';
import { emphasisMuscles, type BodyMap } from '@/engine/v5/bodyMap';
import { musclesOfRegion } from '@/domain/bodyMapNote';
import { REP_BAND_CHOICES } from '@/engine/v5/repBand';
import type { MuscleStance, RepBandChoice } from '@/data/local/models';
import { color, font, textScale, radius, space } from '@/design/tokens';

const STANCES: MuscleStance[] = ['off', 'normal', 'emphasis'];
const REGIONS = ['upper', 'lower'] as const;

interface Props {
  value: BodyMap;
  onChange: (next: BodyMap) => void;
  /** Fired when the emphasis budget refuses a third mark — the screen says so out loud (F-4). */
  onRefused: (refused: boolean) => void;
  /**
   * EDITOR ONLY — the per-muscle rep band (register Part 9), and the muscle currently opened to
   * show it. Absent in onboarding: the band is a set-once preference at a default most athletes
   * never touch, and asking for it at signup is deliberation at the worst possible moment.
   */
  bands?: Record<string, RepBandChoice>;
  onBandChange?: (muscle: string, band: RepBandChoice) => void;
  openMuscle?: string | null;
  onOpenMuscle?: (muscle: string | null) => void;
}

export function BodyMapField({
  value,
  onChange,
  onRefused,
  bands,
  onBandChange,
  openMuscle,
  onOpenMuscle,
}: Props) {
  const { t } = useCopy();
  const editable = bands != null && onBandChange != null;
  const stanceOf = (m: string): MuscleStance => value[m] ?? 'normal';
  const emphasised = emphasisMuscles(value, CANONICAL_MUSCLE_ORDER);

  function setStance(m: string, s: MuscleStance) {
    // The emphasis budget is a hard limit (F-4) — but a refusal she cannot see is a bug, not a
    // limit. The screen names who holds it (the brief: "legible, not a hidden error").
    if (s === 'emphasis' && stanceOf(m) !== 'emphasis' && emphasised.length >= EMPHASIS_BUDGET) {
      haptics.tick();
      onRefused(true);
      return;
    }
    // S-56 — an OFF is obeyed in silence (L8). The one "want it back?" question is asked later, at
    // the Saturday mirror, for a muscle she has actually trained (WeeklyUpdate · askBackMuscle).
    haptics.tick();
    onRefused(false);
    const next = { ...value };
    // Only her decisions are stored — 'normal' is the ABSENCE of one, not one of them.
    if (s === 'normal') delete next[m];
    else next[m] = s;
    onChange(next);
  }

  return (
    <View style={styles.regions}>
      {REGIONS.map((region) => (
        <View key={region} style={styles.region}>
          <Text style={styles.regionLabel}>
            {t(region === 'upper' ? 'ob.regionUpper' : 'ob.regionLower').toUpperCase()}
          </Text>
          {musclesOfRegion(CANONICAL_MUSCLE_ORDER, region).map((m) => {
            const current = stanceOf(m);
            const band = bands?.[m];
            const open = editable && openMuscle === m;
            return (
              <View key={m}>
                <View style={styles.row}>
                  {/* In the editor the name is the door to the band — the one control most athletes
                      never open, so it costs them nothing and stays one tap from the rare one who
                      wants it. An off muscle has no band: it is not trained. */}
                  <Pressable
                    disabled={!editable || current === 'off'}
                    accessibilityRole={editable && current !== 'off' ? 'button' : 'text'}
                    accessibilityLabel={editable && current !== 'off' ? t('ob.mapBandOpen', { muscle: t(`muscle.${m}`) }) : undefined}
                    onPress={() => onOpenMuscle?.(open ? null : m)}
                    style={styles.nameCell}
                  >
                    <Text style={[styles.muscle, current === 'off' && styles.muscleOff]} numberOfLines={1}>
                      {t(`muscle.${m}`)}
                    </Text>
                    {/* Only a band she has actually MOVED is worth printing — the default is the
                        absence of a decision, and stating it on ten rows would be noise. */}
                    {editable && band && current !== 'off' ? <Text style={styles.bandTag}>{band}</Text> : null}
                  </Pressable>
                  <View style={styles.seg}>
                    {STANCES.map((s) => {
                      const active = current === s;
                      return (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${t(`muscle.${m}`)} — ${t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}`}
                          onPress={() => setStance(m, s)}
                          style={[
                            styles.segItem,
                            active && (s === 'emphasis' ? styles.segEmphasis : s === 'off' ? styles.segOff : styles.segNormal),
                          ]}
                        >
                          <Text style={[styles.segText, active && styles.segTextActive]}>
                            {t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* The band, opened. A pick from four named choices — not a number range — so the
                    scroller law does not bind it (the brief says so in as many words). */}
                {open ? (
                  <View style={styles.bandRow}>
                    <Text style={styles.bandLegend}>{t('ob.mapBandLegend').toUpperCase()}</Text>
                    <View style={styles.bandSeg}>
                      {REP_BAND_CHOICES.map((b) => {
                        const on = (band ?? '8-10') === b;
                        return (
                          <Pressable
                            key={b}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`${t(`muscle.${m}`)} — ${b}`}
                            onPress={() => {
                              haptics.tick();
                              onBandChange?.(m, b);
                            }}
                            style={[styles.bandItem, on && styles.bandItemOn]}
                          >
                            <Text style={[styles.bandText, on && styles.bandTextOn]}>{b}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  regions: { gap: space[4] },
  region: { gap: 6 },
  /* The body, at the only resolution that survives a phone — and the assembler's own grouping. */
  regionLabel: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: 1.2,
    color: color.textMuted,
    textAlign: 'left',
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameCell: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  muscle: { fontFamily: font.sansMedium, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  /* An off muscle recedes — the name goes quiet with its row. */
  muscleOff: { color: color.textMuted },
  /* A moved band, stated in the voice that measures. */
  bandTag: { fontFamily: font.mono, fontSize: textScale['2xs'], color: color.textMuted, textAlign: 'left' },
  /* The track is a well; the chosen rung separates from it by TONE, never by a border. */
  seg: { flexDirection: 'row', borderRadius: radius.full, overflow: 'hidden', backgroundColor: color.fillSubtle },
  segItem: { paddingVertical: 7, paddingHorizontal: 12, minWidth: 62, alignItems: 'center' },
  /* The three rungs of the one ladder: off sinks below the track, normal sits at the raised
     surface, emphasis LIFTS to white. Emphasis is not a colour — it is distance from the ground. */
  segOff: { backgroundColor: color.fillSubtleStrong },
  segNormal: { backgroundColor: color.surface },
  segEmphasis: { backgroundColor: color.lift },
  segText: { fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  segTextActive: { color: color.textPrimary },

  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 4 },
  bandLegend: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: 1.1,
    color: color.textMuted,
    textAlign: 'left',
  },
  bandSeg: { flex: 1, flexDirection: 'row', borderRadius: radius.full, overflow: 'hidden', backgroundColor: color.fillSubtle },
  bandItem: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  bandItemOn: { backgroundColor: color.lift },
  bandText: { fontFamily: font.mono, fontSize: textScale['2xs'], color: color.textSecondary, textAlign: 'left' },
  bandTextOn: { color: color.textPrimary },
});
