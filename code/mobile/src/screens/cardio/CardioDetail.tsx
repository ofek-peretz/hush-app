/**
 * CardioDetail — read-only record of one recorded run/walk, opened from the
 * unified History timeline (v7 · 3.3c CARDIO RECORD). A cardio row opens the same
 * way a session does: the distance, its facts, the kilometre splits. Records
 * without interpreting — Hush never grades a run and never attaches a coaching or
 * engine decision to it.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { fmtPace } from '@/platform/cardio/cardioTracker';
import { color, space, font, textScale, tracking, trackingPx, press, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'CardioDetail'>;

// A cardio duration reads as a clock (mm:ss) on this record — the handoff's TIME
// stat and split paces are both clocks. This is the run's own wall reading, not a
// planned block, so the strength "minutes, never a clock" rule does not apply.
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function CardioDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const a = route.params.activity;
  const d = new Date(a.startedAt);
  // "FRIDAY 17 JULY" — weekday, day, month, composed to avoid the locale comma.
  const dateLabel = [
    d.toLocaleDateString(undefined, { weekday: 'long' }),
    d.toLocaleDateString(undefined, { day: 'numeric' }),
    d.toLocaleDateString(undefined, { month: 'long' }),
  ].join(' ');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Legend align="center" style={styles.headLegend}>{`${t('cardio.logLabel')} · ${dateLabel}`}</Legend>
        <View style={styles.headSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* title — the serif, marked by the pulse glyph in moss */}
        <View style={styles.titleRow}>
          <Icon name="activity" size={20} color={signal[0]} strokeWidth={1.8} />
          <Text style={styles.title} accessibilityRole="header">{t('cardio.recordTitle')}</Text>
        </View>

        {/* hero distance — left-aligned, the run's headline fact */}
        <View style={styles.heroRow}>
          <Text style={styles.heroNum}>{a.distanceKm.toFixed(1)}</Text>
          <Text style={styles.heroUnit}>{t('cardio.km')}</Text>
        </View>

        {/* core facts band */}
        <View style={styles.band}>
          <BandStat value={fmtClock(a.durationSec)} label={t('cardio.timeShort')} />
          {a.calories ? <BandStat value={String(a.calories)} label={t('cardio.kcal')} /> : null}
          {a.avgHr ? <BandStat value={String(a.avgHr)} label={t('cardio.avgHrShort')} /> : null}
        </View>

        {/* kilometre splits — plain rows, no bars, no grade */}
        {a.splits.length > 0 ? (
          <View style={styles.splitsWrap}>
            <Legend style={styles.splitsLegend}>{t('cardio.kilometres')}</Legend>
            {a.splits.map((s, i) => (
              <View key={s.km} style={[styles.splitRow, i === a.splits.length - 1 && styles.splitRowLast]}>
                <Text style={styles.splitKm}>{`KM ${s.km}`}</Text>
                <Text style={styles.splitPace}>{fmtPace(s.paceSec)}</Text>
                <Text style={styles.splitTail}>{s.gait === 'walk' ? t('cardio.walkTag') : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* honest close — Hush does not grade a run */}
        <Text style={styles.footer}>{t('cardio.recordFooter')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function BandStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.bandStat}>
      <Text style={styles.bandVal}>{value}</Text>
      <Legend size={17} style={styles.bandLabel}>{label}</Legend>
    </View>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.12)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 4,
    paddingTop: 6,
    paddingBottom: 2,
    minHeight: 44,
  },
  back: { width: 22, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headLegend: { flex: 1 },
  headSpacer: { width: 22 },
  // flexGrow so the closing line can be pushed to the FOOT of the page (the handoff's margin-top:auto)
  // on a short record, while a long one still scrolls it into place after the splits.
  scroll: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 44 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // v7 (2026-07-22): the record's title is the serif — one calm word, "Cardio".
  title: { fontFamily: font.serif, fontSize: textScale['2xl'], color: color.textPrimary, textAlign: 'left' },

  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  // lineHeight ≥ fontSize (+ includeFontPadding:false) or RN clips the tall mono digit tops.
  // 64 — the handoff's own size for a RECORD's distance. The 84 of a live stage belongs to a
  // figure that is still moving; this one is finished, and it sits under a serif title.
  heroNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale['5xl'], lineHeight: Math.round(textScale['5xl'] * 1.02), includeFontPadding: false, letterSpacing: -1.92, color: color.textPrimary, textAlign: 'left' },
  // "km" is a translated slot (he: "ק״מ") — sans, never mono (mono has no Hebrew glyphs).
  heroUnit: { fontFamily: font.sansMedium, fontSize: textScale.lg, color: color.textMuted, marginStart: 8, marginBottom: 8, textAlign: 'left' },

  band: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  bandStat: { gap: 2 },
  bandVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  bandLabel: { marginTop: 0 },

  splitsWrap: { marginTop: 22 },
  splitsLegend: { marginBottom: 10 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
  },
  splitRowLast: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  splitKm: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textSecondary, textAlign: 'left' },
  splitPace: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  splitTail: { minWidth: 44, fontFamily: font.sansMedium, fontSize: 17, letterSpacing: trackingPx(9, tracking.legend), textTransform: 'uppercase', color: color.textMuted, textAlign: 'right' },

  footer: { marginTop: 'auto', paddingTop: 32, fontFamily: font.serif, fontStyle: 'italic', fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});
