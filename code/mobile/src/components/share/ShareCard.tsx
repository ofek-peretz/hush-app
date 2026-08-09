/**
 * ShareCard (§9) — the poster. A fact, made handsome enough to post: 9:16, the brand
 * carried whole, drawn on the lit dark stage. Two faces, both fed by domain/shareCard:
 *   • record (9.1) — one lift's new best, the step up, how far it has come.
 *   • week   (9.2) — a training week's shape, its tonnage, its cost, its honest change.
 *
 * PURELY PRESENTATIONAL. It renders the numbers it is handed and derives none — the
 * facts were settled in the domain. `forwardRef`s its root View so the share seam
 * (platform/share) can capture it to an image OFF-SCREEN; nothing here knows about
 * capture. Never a leaderboard, never a comparison to another person (founder).
 *
 * VOICE: the big figure and its unit are IBM Plex Mono (figures, the law); every WORD
 * — the eyebrow, the sentence, the footer — is Assistant/Frank Ruhl Libre, because
 * mono carries no words. The handoff draws the eyebrow in mono; the law overrules the
 * mock, so it rides in sans here.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { exerciseDisplayName } from '@/data/exercises';
import type { ShareCard as ShareCardData } from '@/domain/shareCard';
import { stage, signal, font, tracking, trackingPx, line } from '@/design/tokens';

/** 9:16 — the Stories frame. The card is authored at this ratio and scales as one block. */
export const SHARE_ASPECT = 16 / 9;

interface Props {
  card: ShareCardData;
  /** Card width in px; height follows the 9:16 ratio. Default is the capture size. */
  width?: number;
}

/** A poster figure — the one place figures grow huge. Mono, tabular, never a word. */
function Figure({ value, unit, size }: { value: string; unit?: string; size: number }) {
  return (
    <Text style={[styles.figure, { fontSize: size, lineHeight: Math.round(size * 1.02) }]}>
      {value}
      {unit ? <Text style={[styles.figureUnit, { fontSize: Math.round(size * 0.29) }]}> {unit}</Text> : null}
    </Text>
  );
}

export const ShareCard = React.forwardRef<View, Props>(function ShareCard({ card, width = 1080 }, ref) {
  const { t } = useCopy();
  const height = Math.round(width * SHARE_ASPECT);
  // The card is authored at 296pt wide; everything scales from that so one component
  // serves both the on-screen preview and the full-resolution capture.
  const k = width / 296;
  const px = (n: number) => Math.round(n * k);

  const dateOf = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height, padding: px(28), borderRadius: px(28) }]}>
      {/* lit-from-above dark gradient — the stage, poured into a frame */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="shareBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stage.gradient[0]} />
            <Stop offset="0.42" stopColor={stage.gradient[1]} />
            <Stop offset="1" stopColor={stage.gradient[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} rx={px(28)} fill="url(#shareBg)" />
      </Svg>

      {/* wordmark — the brand, carried whole */}
      <View style={styles.head}>
        <Text style={[styles.wordmark, { fontSize: px(19) }]}>hush</Text>
        <View style={[styles.brandDot, { width: px(6), height: px(6), borderRadius: px(3), marginBottom: px(4) }]} />
      </View>

      {card.kind === 'record' ? (
        <RecordBody card={card} t={t} px={px} />
      ) : (
        <WeekBody card={card} t={t} px={px} />
      )}

      <View style={styles.footer}>
        <Text style={[styles.footDate, { fontSize: px(10) }]}>
          {card.kind === 'record' ? dateOf(card.dateMs) : `${dateOf(card.startMs)} – ${dateOf(card.endMs)}`}
        </Text>
        <Legend size={px(10)} tone="faint">{t('share.builtOnFacts')}</Legend>
      </View>
    </View>
  );
});

/** 9.1 — the personal record. */
function RecordBody({
  card,
  t,
  px,
}: {
  card: Extract<ShareCardData, { kind: 'record' }>;
  t: (k: string, p?: Record<string, unknown>) => string;
  px: (n: number) => number;
}) {
  const detail =
    card.delta != null
      ? t('share.recordReps', { reps: card.reps, delta: card.delta })
      : t('share.recordRepsOnly', { reps: card.reps });
  return (
    <View style={styles.body}>
      <Legend size={px(11)} tone="accent" style={{ letterSpacing: trackingPx(px(11), tracking.legend) }}>
        {t('share.recordEyebrow')}
      </Legend>
      <Text style={[styles.recordName, { fontSize: px(30), lineHeight: px(34), marginTop: px(10) }]} numberOfLines={2}>
        {bidi(exerciseDisplayName(card.exerciseId))}
      </Text>
      <View style={{ marginTop: px(12) }}>
        <Figure value={String(card.weight)} unit={card.unit} size={px(96)} />
      </View>
      <Text style={[styles.recordDetail, { fontSize: px(22), lineHeight: px(28), marginTop: px(6) }]}>{detail}</Text>
      {card.firstWeight != null ? (
        <>
          <View style={[styles.hair, { marginVertical: px(18) }]} />
          <Text style={[styles.context, { fontSize: px(14), lineHeight: px(20) }]}>
            {t('share.recordContext', { weight: card.firstWeight, unit: card.unit })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** 9.2 — the week complete. */
function WeekBody({
  card,
  t,
  px,
}: {
  card: Extract<ShareCardData, { kind: 'week' }>;
  t: (k: string, p?: Record<string, unknown>) => string;
  px: (n: number) => number;
}) {
  return (
    <View style={styles.body}>
      <Legend size={px(11)} tone="accent" style={{ letterSpacing: trackingPx(px(11), tracking.legend) }}>
        {card.weekNumber != null ? t('share.weekEyebrow', { n: card.weekNumber }) : t('share.weekEyebrowNoNum')}
      </Legend>
      <Text style={[styles.weekTitle, { fontSize: px(32), lineHeight: px(38), marginTop: px(10) }]}>
        {t('share.weekTitle', { count: card.trainedDays })}
      </Text>

      {/* seven days, moss where trained — the week's shape */}
      <View style={[styles.bars, { height: px(96), marginTop: px(26), gap: px(8) }]}>
        {card.days.map((d, i) => (
          <View key={i} style={styles.barCol}>
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.max(d.trained ? 18 : 8, Math.round(d.height * 100))}%`,
                  backgroundColor: d.trained ? signal[0] : 'rgba(241,238,229,0.14)',
                  borderRadius: px(4),
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* the stat band — three cells between two hairlines */}
      <View style={[styles.hair, { marginTop: px(28) }]} />
      <View style={[styles.band, { paddingVertical: px(16) }]}>
        <StatCell figure={card.moved.toLocaleString()} label={t('share.weekMoved', { unit: card.unit })} px={px} />
        {card.kcal != null ? (
          <StatCell figure={card.kcal.toLocaleString()} label={t('share.weekSpent')} px={px} />
        ) : null}
        {card.deltaPct != null ? (
          <StatCell
            figure={`${card.deltaPct >= 0 ? '+' : ''}${card.deltaPct}%`}
            label={t('share.weekVsLast')}
            px={px}
            accent
          />
        ) : null}
      </View>
      <View style={styles.hair} />
    </View>
  );
}

/** One stat: a mono figure over its sans label ("4,200" / "kg moved"). */
function StatCell({ figure, label, px, accent }: { figure: string; label: string; px: (n: number) => number; accent?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellFigure, accent && styles.cellFigureUp, { fontSize: px(20) }]}>{figure}</Text>
      <Text style={[styles.cellLabel, { fontSize: px(11), marginTop: px(4) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: stage[0], justifyContent: 'space-between' },

  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  wordmark: { fontFamily: font.serif, color: stage.ink0, textAlign: 'left' },
  brandDot: { backgroundColor: signal[0] },

  body: { flex: 1, justifyContent: 'center' },

  // record
  recordName: { fontFamily: font.serif, color: stage.ink0, textAlign: 'left' },
  recordDetail: { fontFamily: font.serif, color: stage.ink1, textAlign: 'left' },
  context: { fontFamily: font.sans, color: stage.ink1, textAlign: 'left' },

  // figures
  figure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], color: stage.ink0, textAlign: 'left' },
  figureUnit: { fontFamily: font.mono, color: stage.ink2, textAlign: 'left' }, // rtl-ok: nested unit inside figure, which sets textAlign

  // week
  weekTitle: { fontFamily: font.serif, color: stage.ink0, textAlign: 'left' },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%' },
  band: { flexDirection: 'row' },
  cell: { flex: 1 },
  cellFigure: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], color: stage.ink0, textAlign: 'left' },
  cellFigureUp: { color: signal[0] }, // rtl-ok: merged onto cellFigure, which sets textAlign
  cellLabel: { fontFamily: font.sans, color: stage.ink1, textAlign: 'left' },

  hair: { height: 1, backgroundColor: line[1] },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The date carries a MONTH NAME (a word) — so it is sans, never mono (the law). Letter-spaced to
  // read as an engraved footer mark rather than body copy.
  footDate: { fontFamily: font.sansMedium, color: stage.ink2, letterSpacing: 1, textAlign: 'left' },
});
