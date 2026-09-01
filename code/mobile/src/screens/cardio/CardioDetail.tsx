/**
 * CardioDetail — read-only record of one recorded run/walk, opened from the
 * unified History timeline (v7 · 3.3c CARDIO RECORD). A cardio row opens the same
 * way a session does: the distance, its facts, the kilometre splits. Records
 * without interpreting — Hush never grades a run and never attaches a coaching or
 * engine decision to it.
 */

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Arrive, Legend } from '@/components/ds';
import { RouteTrace, MIN_ROUTE_POINTS } from '@/components/RouteTrace';
import { useCopy } from '@/i18n/useCopy';
import { fmtPace } from '@/platform/cardio/cardioTracker';
import { color, space, font, textScale, tracking, trackingPx, press, signal } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';
import type { MainParamList } from '@/app/navigation';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

type Props = NativeStackScreenProps<MainParamList, 'CardioDetail'>;

/*
 * ════ ⛔ THE ROUTE, ON A REAL MAP — the 2026-07-12 ruling, released by its author ════
 *
 * Founder, 2026-08-23: *"חלק מהפסיקות שלי הן ישנות מאוד… אל תיתן לשום פסיקה או חוק כזה להגביל
 * אותך."* The "no map SDK, ever" ruling was made against a tiled map with API keys and foreign
 * branding — and meanwhile every run's GPS trace was being RECORDED and drawn nowhere at all.
 * Apple Maps (react-native-maps' default iOS provider) costs no key and no account, and the
 * world's runners expect their run on a map, because a map answers what a bare polyline cannot:
 * WHERE the shape lives.
 *
 * ⚠️ WHAT SURVIVES OF THE OLD RULING IS ITS TASTE, and it binds the dress: the map is DARK, a
 * PICTURE (every gesture disabled), the route in the product's own moss over it, inside the same
 * rounded frame every card wears. No pins, no labels of ours, no interaction — an engraving that
 * happens to know the streets.
 *
 * ⚠️ GUARDED, NOT ASSUMED: jest and the web gallery have no native map. There the engraved
 * `RouteTrace` — built for exactly this in 2026-07-12 — finally mounts as the fallback, so the
 * route is drawn on every runtime and the map is an upgrade, never a dependency.
 */
// Resolved per platform — see `platform/maps` (web gets null; Metro must never bundle the native
// module for the browser, and a try/catch cannot stop a static resolve).
import { maps } from '@/platform/maps';

function RouteMap({ route }: { route: { lat: number; lon: number }[] }) {
  if (!maps) return <RouteTrace route={route} width={330} height={190} style={styles.mapFrame} />;
  const MapView = maps.default;
  const { Polyline } = maps;
  const lats = route.map((p) => p.lat);
  const lons = route.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return (
    <View style={styles.mapFrame} pointerEvents="none">
      <MapView
        style={styles.map}
        userInterfaceStyle="dark"
        initialRegion={{
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
          // The route plus air on every side; the floor keeps a short loop from becoming a
          // building-level zoom where the line dwarfs its own streets.
          latitudeDelta: Math.max((maxLat - minLat) * 1.45, 0.008),
          longitudeDelta: Math.max((maxLon - minLon) * 1.45, 0.008),
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsPointsOfInterest={false}
        showsCompass={false}
      >
        <Polyline
          coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
          strokeColor="#a9c49f"
          strokeWidth={3.5}
        />
      </MapView>
    </View>
  );
}

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
    d.toLocaleDateString(currentLocale(), { weekday: 'long' }),
    d.toLocaleDateString(currentLocale(), { day: 'numeric' }),
    d.toLocaleDateString(currentLocale(), { month: 'long' }),
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
        {/* ✦ IT ARRIVES (2026-08-27) — see the note at `HomeView`. Two beats: what this record IS,
            then the distance it is about. The splits below land with the hero, because a run's
            record is one table. */}
        {/* title — the serif, marked by the pulse glyph in moss */}
        <Arrive order={0} style={styles.titleRow}>
          <Icon name="activity" size={20} color={signal[0]} strokeWidth={1.8} />
          <Text style={styles.title} accessibilityRole="header">{t('cardio.recordTitle')}</Text>
        </Arrive>

        {/* hero distance — left-aligned, the run's headline fact */}
        <Arrive order={1} style={styles.heroRow}>
          <Text style={styles.heroNum}>{a.distanceKm.toFixed(1)}</Text>
          <Text style={styles.heroUnit}>{t('cardio.km')}</Text>
        </Arrive>

        {/* core facts band */}
        <View style={styles.band}>
          <BandStat value={fmtClock(a.durationSec)} label={t('cardio.timeShort')} />
          {a.calories ? <BandStat value={String(a.calories)} label={t('cardio.kcal')} /> : null}
          {a.avgHr ? <BandStat value={String(a.avgHr)} label={t('cardio.avgHrShort')} /> : null}
        </View>

        {/* the route, finally drawn — see `RouteMap`. Absent (treadmill, no lock) draws nothing. */}
        {a.route && a.route.length >= MIN_ROUTE_POINTS ? <RouteMap route={a.route} /> : null}

        {/* kilometre splits — plain rows, no bars, no grade */}
        {a.splits.length > 0 ? (
          <View style={styles.splitsWrap}>
            <Legend style={styles.splitsLegend}>{t('cardio.kilometres')}</Legend>
            {a.splits.map((s, i) => (
              <View key={s.km} style={[styles.splitRow, i === a.splits.length - 1 && styles.splitRowLast]}>
                {/* ⛔ THE KILOMETRE IS NAMED IN HER LANGUAGE. This was `KM ${s.km}` — an English
                    unit assembled in JSX, on a screen every other line of which goes through the
                    copy file. On a Hebrew phone the saved run's splits read "KM 3" in Latin
                    capitals, while the LIVE stage two screens back said "ק״מ 3" from
                    `cardio.kmOrdinal`. Same fact, same product, two languages. */}
                <Text style={styles.splitKm}>{t('cardio.kmOrdinal', { n: s.km })}</Text>
                {s.kcal != null ? (
                  <View style={styles.splitKcalWrap} accessible accessibilityLabel={`${s.kcal} ${t('cardio.kcal')}`}>
                    <Text style={styles.splitKcal}>{s.kcal}</Text>
                    {/* the WORD rides sans beside the mono figure (monoCarriesNoWords) */}
                    <Text style={styles.splitKcalUnit}>{t('cardio.kcal')}</Text>
                  </View>
                ) : null}
                <Text style={styles.splitPace}>{fmtPace(s.paceSec)}</Text>
                <Text
                  style={[
                    styles.splitTail,
                    { letterSpacing: legendVoice(s.gait === 'walk' ? t('cardio.walkTag') : '', 17, tracking.legend).letterSpacing },
                  ]}
                >
                  {s.gait === 'walk' ? t('cardio.walkTag') : ''}
                </Text>
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

  mapFrame: { marginTop: 22, height: 190, borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(241,238,229,0.04)' },
  map: { flex: 1 },
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
  /* ⚠️ SANS, and it has to be: the label is a WORD with a figure in it now (`cardio.kmOrdinal`),
     and the mono face has no Hebrew glyphs at all — "ק״מ 3" in mono is three tofu boxes and a 3
     (`monoCarriesNoWords`). The uppercase keeps the row looking exactly as it did in English. */
  splitKm: { fontFamily: font.sansMedium, fontVariant: ['tabular-nums'], fontSize: textScale.sm, textTransform: 'uppercase', color: color.textSecondary, textAlign: 'left' },
  splitPace: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  splitKcal: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  splitKcalWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  splitKcalUnit: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  /* The WALK tag at the end of a split row.
     ⚠️ THE TRACKING IS SUPPLIED AT THE CALL SITE, from `legendVoice`. It is an answer about the
     STRING — Latin keeps the instrument's open track, Hebrew never gets it — and a StyleSheet
     cannot see a string. `noTrackedHebrew` holds every slot in this class. */
  splitTail: { minWidth: 44, fontFamily: font.sansMedium, fontSize: 17, textTransform: 'uppercase', color: color.textMuted, textAlign: 'right' },

  footer: { marginTop: 'auto', paddingTop: 32, fontFamily: font.serif, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});
