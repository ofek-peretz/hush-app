/**
 * ONE MUSCLE, OPENED — the sheet a tapped zone raises on the body map (v7 4.1).
 *
 * "A tapped muscle opens stance + its rep band on an engraved ruler."
 *
 * Two controls and one sentence, in that order:
 *   · the STANCE — off / normal / lead, the three rungs the whole app stands on
 *   · the REP BAND — her four choices on a ruled scale, and only when the muscle is trained
 *   · the line — what the map now says about this muscle, in the coach's voice
 *
 * The band is EDITOR-ONLY (`onBandChange` absent → it does not draw). Onboarding never asks for it:
 * it is a set-once preference at a default most athletes never touch, and asking at signup is
 * deliberation at the worst possible moment.
 *
 * An OFF muscle has no band. It is not trained, so there is no range for it to land in — printing a
 * scale there would be the screen offering a setting that decides nothing.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useCopy } from '@/i18n/useCopy';
import * as haptics from '@/platform/haptics';
import { Legend } from '@/components/ds';
import { REP_BAND_CHOICES } from '@/engine/v5/repBand';
import type { MuscleStance, RepBandChoice } from '@/data/local/models';
import { color, font, textScale, radius, signal, press } from '@/design/tokens';

const STANCES: MuscleStance[] = ['off', 'normal', 'emphasis'];
const DEFAULT_BAND: RepBandChoice = '8-10';

interface Props {
  muscle: string;
  stance: MuscleStance;
  onStance: (s: MuscleStance) => void;
  /** EDITOR ONLY — absent in onboarding, and the ruler then does not draw. */
  band?: RepBandChoice;
  onBandChange?: (b: RepBandChoice) => void;
}

/**
 * The muscle's name as a HEADLINE.
 *
 * `muscle.*` is written for the inside of a sentence — English keeps it singular and lowercase
 * ("Every chest lift…"), which is the right word and the wrong case for a title. Capitalising the
 * first character is all a headline needs, and it is a no-op in a script without case (Hebrew), so
 * the vocabulary stays in ONE place instead of being duplicated into a second key per muscle.
 */
const headline = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

export function BodyMapSheet({ muscle, stance, onStance, band, onBandChange }: Props) {
  const { t } = useCopy();
  const name = t(`muscle.${muscle}`);
  const editable = onBandChange != null && stance !== 'off';
  const chosen = band ?? DEFAULT_BAND;

  return (
    <View style={styles.sheet}>
      <View style={styles.grabber} />

      <View style={styles.head}>
        <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>{headline(name)}</Text>
        {/* S-44, stated where the decision is made: turning a muscle off never costs her anything. */}
        <Text style={styles.keep} numberOfLines={1}>{t('ob.mapHistoryKept')}</Text>
      </View>

      {/* THE STANCE — the three rungs. off sinks below the track, normal sits at the raised
          surface, emphasis LIFTS. Distance from the ground, never a colour. */}
      <View style={styles.seg}>
        {STANCES.map((s) => {
          const active = stance === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${name} — ${t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}`}
              onPress={() => onStance(s)}
              style={({ pressed }) => [
                styles.segItem,
                active && styles.segItemOn,
                { opacity: pressed ? press.opacity : 1 },
              ]}
            >
              <Text style={[styles.segText, active && styles.segTextOn]} numberOfLines={1}>
                {t(`ob.stance${s[0].toUpperCase()}${s.slice(1)}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {editable ? (
        <View style={styles.bandGroup}>
          <View style={styles.bandHead}>
            <Legend size={11}>{t('ob.mapBandLegend')}</Legend>
            <Text style={styles.bandNote} numberOfLines={1}>{t('ob.mapBandMine')}</Text>
          </View>

          {/* THE RULER — an engraved scale, not a row of pills. The chosen reading is the big one
              and it is the only thing in moss; the ticks under it say this is a measurement. */}
          <View style={styles.ruler}>
            <View style={styles.rulerRow}>
              {REP_BAND_CHOICES.map((b) => {
                const d = Math.abs(REP_BAND_CHOICES.indexOf(b) - REP_BAND_CHOICES.indexOf(chosen));
                return (
                  <Pressable
                    key={b}
                    accessibilityRole="button"
                    accessibilityState={{ selected: d === 0 }}
                    accessibilityLabel={`${name} — ${b}`}
                    hitSlop={10}
                    style={styles.tickCell}
                  onPress={() => {
                      haptics.tick();
                      onBandChange?.(b);
                    }}
                  >
                    <Text style={[styles.tick, d === 0 ? styles.tickOn : d === 1 ? styles.tickNear : styles.tickFar]}>
                      {b.replace('-', '–')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.strip}>
              {/* The engraving — evenly ruled marks under the scale. */}
              <View style={styles.stripMarks}>
                {Array.from({ length: 17 }).map((_, i) => (
                  <View key={i} style={styles.stripMark} />
                ))}
              </View>
              {/* THE NEEDLE STANDS ON THE READING. Centring it and letting the choice sit wherever
                  it lands would draw an instrument pointing at the wrong number — the one thing a
                  ruler may never do. Each choice owns a quarter of the scale; the needle takes the
                  middle of its own. */}
              <View
                style={[
                  styles.needle,
                  { left: `${((REP_BAND_CHOICES.indexOf(chosen) + 0.5) / REP_BAND_CHOICES.length) * 100}%` },
                ]}
              />
            </View>
          </View>

          {/* Inside a sentence the muscle keeps the case `muscle.*` was written in. */}
          <Text style={styles.line}>{t('ob.mapBandLine', { muscle: name, band: chosen.replace('-', '–') })}</Text>
        </View>
      ) : (
        <Text style={styles.line}>
          {stance === 'off' ? t('ob.mapOffLine', { muscle: name }) : t('ob.mapNormalLine', { muscle: headline(name) })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.fillSubtle,
    borderTopWidth: 1,
    borderTopColor: color.border,
    borderTopStartRadius: 28,
    borderTopEndRadius: 28,
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 34,
    gap: 16,
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(241,238,229,0.18)', alignSelf: 'center', marginTop: -6 },

  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  // The muscle is named in the coach's serif — this sheet is Hush answering a tap.
  name: { flexShrink: 1, fontFamily: font.serif, fontSize: 26, color: color.textPrimary, textAlign: 'left' },
  keep: { flexShrink: 0, fontFamily: font.sans, fontSize: 15, color: color.textMuted, textAlign: 'left' },

  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: color.surface2 },
  segItem: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: color.surface },
  segText: { fontFamily: font.sansMedium, fontSize: 14, color: color.textMuted, textAlign: 'left' },
  segTextOn: { fontFamily: font.sansSemibold, color: color.textPrimary }, // rtl-ok: merged onto segText, which sets textAlign

  bandGroup: { gap: 9 },
  bandHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 },
  bandNote: { flexShrink: 1, fontFamily: font.sans, fontSize: 15, color: color.textMuted, textAlign: 'right' },

  ruler: {
    height: 68,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.14)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  // Each choice owns a QUARTER of the scale, so the needle below can point at one honestly.
  rulerRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'baseline' },
  tickCell: { flex: 1, alignItems: 'center' },
  // A rep band is a MEASUREMENT — mono, and sized by how near it is to the reading.
  tick: { fontFamily: font.mono, fontVariant: ['tabular-nums'], textAlign: 'center' },
  tickOn: { fontFamily: font.monoSemibold, fontSize: 25, color: signal[0] }, // rtl-ok: merged onto tick, which sets textAlign
  tickNear: { fontSize: 16, color: color.textSecondary }, // rtl-ok: merged onto tick, which sets textAlign
  tickFar: { fontSize: 15, color: color.textMuted }, // rtl-ok: merged onto tick, which sets textAlign

  strip: { alignSelf: 'stretch', height: 13 },
  stripMarks: { position: 'absolute', top: 7, start: 0, end: 0, height: 6, flexDirection: 'row', justifyContent: 'space-between' },
  stripMark: { width: 1, height: 6, backgroundColor: 'rgba(241,238,229,0.28)' },
  needle: { position: 'absolute', top: 0, width: 1.5, height: 13, marginStart: -0.75, backgroundColor: signal[0] },

  // What the map now says about this muscle — the coach's serif, one line, never an argument.
  line: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
});
