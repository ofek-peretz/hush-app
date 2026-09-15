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

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { exerciseDisplayName } from '@/data/exercises';
import type { ShareCard as ShareCardData } from '@/domain/shareCard';
import { MiniBody } from '@/components/MiniBody';
import { monoCanDraw } from '@/design/monoVoice';
import { fmtClock, fmtPace } from '@/platform/cardio/cardioMath';
import { stage, signal, font, tracking, trackingPx, line } from '@/design/tokens';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

/** 9:16 — the Stories frame. The card is authored at this ratio and scales as one block. */
export const SHARE_ASPECT = 16 / 9;

interface Props {
  card: ShareCardData;
  /** Card width in px; height follows the 9:16 ratio. Default is the capture size. */
  width?: number;
}

/**
 * A poster figure — the one place figures grow huge. Mono, tabular, never a word.
 *
 * ⛔ THE UNIT WAS BEING LEFT BEHIND ON A LINE OF ITS OWN (seen on the running card, 2026-08-19).
 *
 * `47.5 kg` at 96 points is wider than the card, so the unit wrapped — and with the parent's leading
 * at 1.02 of a 96-point figure it landed a full line-box below, stranded, with a hundred points of
 * black between a number and the unit that gives it meaning. On the one surface she posts in public.
 *
 * ⚠️ `domain/loadPresentation.heroFontSize` is the app's rule for a figure that has grown too wide,
 * and it could not have saved this: **it counts the glyphs of the FIGURE and the layout renders the
 * figure PLUS its unit.** "47.5" is four glyphs and passes; "47.5 kg" is what actually has to fit.
 * The same miscount is why a 3-character load was fine here and a 4-character one was not.
 *
 * So the width that matters is measured, and the whole group shrinks together — the unit keeps its
 * 0.29 ratio, so it never grows relative to the number it belongs to.
 */
/* ⚠️ The unit slot hands over to sans when the locale spells it in a script the mono has no
   glyphs for (ק״מ on the cardio card) — the same per-string switch every unit slot in the app
   makes (`monoCarriesNoWords`). Latin units (kg, lb) keep the mono, as the law allows. */
function Figure({ value, unit, size }: { value: string; unit?: string; size: number }) {
  /*
   * ⚠️ AND NO `numberOfLines={1}` — THE FIRST ATTEMPT AT THIS PUT ONE THERE AND IT WAS WORSE.
   * The shrink below was too shy, so instead of wrapping, "47.5 kg" came out as "47 . …": a record
   * weight, truncated, on the card she posts. A wrap is ugly; a clipped number is wrong. The text
   * may still wrap in some future case, and that is the safe failure — the shrink exists to make it
   * rare, never to license a cut.
   */
  // Tabular figures: every glyph occupies one cell; the unit rides at 0.29 of the size, plus a space.
  const cells = value.length + (unit ? unit.length * 0.29 + 0.4 : 0);
  const scale = cells <= 4 ? 1 : cells <= 5.5 ? 0.78 : 0.66;
  const fontSize = Math.round(size * scale);
  return (
    /*
      ✦ SET AS A HEADLINE (2026-08-27). This is the biggest number the product ever puts in front of
      someone who is not the athlete — it leaves the app. Untracked monospace at this size gives a
      decimal point half an em of air on each side, and the card read `4 7 . 5` where it meant 47.5.
      See `tracking.figure`. The em is size-relative, so it survives `px()`'s export scaling.
     */
    <Text style={[styles.figure, { fontSize, lineHeight: Math.round(fontSize * 1.02), letterSpacing: trackingPx(fontSize, tracking.figure) }]}>
      {value}
      {unit ? <Text style={[styles.figureUnit, !monoCanDraw(unit) && styles.figureUnitWord, { fontSize: Math.round(fontSize * 0.29) }]}> {unit}</Text> : null}
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
    new Date(ms).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  /*
   * ⛔ THE RANGE SAID THE MONTH AND THE YEAR TWICE (2026-08-27).
   *
   * A week card is by definition seven days, so both ends almost always share a month and always a
   * year — and it printed `${dateOf(start)} – ${dateOf(end)}`, which on `9.2` came out
   * `22 באוגוסט 2026 – 28 באוגוסט 2026`. Two thirds of that line is the same words repeated, on the
   * ONE surface in this product that leaves it: the card she posts.
   *
   * A range says what differs and states what is shared once — `22–28 באוגוסט 2026`. The two cases a
   * week really can straddle are handled: across a month the months are both named and the year is
   * said once; across a new year both ends are said in full, because then nothing is shared.
   */
  const rangeOf = (fromMs: number, toMs: number) => {
    const a = new Date(fromMs);
    const b = new Date(toMs);
    const day = (d: Date) => d.toLocaleDateString(currentLocale(), { day: 'numeric' });
    const dayMonth = (d: Date) => d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long' });
    if (a.getFullYear() !== b.getFullYear()) return `${dateOf(fromMs)} – ${dateOf(toMs)}`;
    const year = b.toLocaleDateString(currentLocale(), { year: 'numeric' });
    const head = a.getMonth() === b.getMonth() ? `${day(a)}–${dayMonth(b)}` : `${dayMonth(a)} – ${dayMonth(b)}`;
    return `${head} ${year}`.toUpperCase();
  };

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
      ) : card.kind === 'session' ? (
        <SessionBody card={card} t={t} px={px} />
      ) : card.kind === 'cardio' ? (
        <CardioBody card={card} t={t} px={px} />
      ) : (
        <WeekBody card={card} t={t} px={px} />
      )}

      <View style={styles.footer}>
        <Text style={[styles.footDate, { fontSize: px(10) }]}>
          {card.kind === 'week' ? rangeOf(card.startMs, card.endMs) : dateOf(card.dateMs)}
        </Text>
        {/*
          THE WAY BACK (audit lever 2). This poster is the product's only artifact that travels —
          and until today a stranger who saw it on a story had literally no way to find the app:
          a wordmark, a moss dot, and no destination. Strava puts a findable name on every export
          for exactly this reason. One faint line, same register as the fact beside it — a signpost,
          not an ad. (A real domain on the card is the founder's upgrade; "App Store" works today.)
        */}
        <View style={styles.footRight}>
          <Legend size={px(10)} tone="faint">{t('share.builtOnFacts')}</Legend>
          <Legend size={px(10)} tone="faint">{t('share.findLine')}</Legend>
        </View>
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
      <Legend size={px(11)} tone="accent">
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

/**
 * 9.3 — the session story (founder 2026-08-23): the workout she just did, as the thing she posts.
 *
 * The centrepiece is HER BODY wearing the work — the muscles this session's sets touched, lit moss
 * on the sexless canonical mirror (`MiniBody`, the same drawing Home's living half uses). No other
 * finish screen looks like this, which is the whole viral argument: a bystander sees a story that
 * could only have come from Hush. Under it, the session's three honest figures.
 */
function SessionBody({
  card,
  t,
  px,
}: {
  card: Extract<ShareCardData, { kind: 'session' }>;
  t: (k: string, p?: Record<string, unknown>) => string;
  px: (n: number) => number;
}) {
  return (
    <View style={styles.body}>
      <Legend size={px(11)} tone="accent">
        {t('share.sessionEyebrow')}
      </Legend>
      <Text style={[styles.weekTitle, { fontSize: px(32), lineHeight: px(38), marginTop: px(10) }]} numberOfLines={1}>
        {bidi(card.dayName)}
      </Text>

      {/* Trained together (2026-08-23) — the names, in the serif, right under the workout's own.
          The most shareable sentence on the card: the friend she posts it FOR is on it. */}
      {card.partners && card.partners.length > 0 ? (
        <Text style={[styles.togetherLine, { fontSize: px(15), lineHeight: px(20), marginTop: px(4) }]} numberOfLines={1}>
          {t('share.together', { names: card.partners.join(' · ') })}
        </Text>
      ) : null}

      {/* her week's body, worn — front and back, the session's muscles in moss */}
      <View style={[styles.sessionFigures, { marginTop: px(20), gap: px(10) }]}>
        <MiniBody face="front" sex={card.sex} lit={card.muscles} height={px(148)} />
        <MiniBody face="back" sex={card.sex} lit={card.muscles} height={px(148)} />
      </View>

      <View style={[styles.hair, { marginTop: px(24) }]} />
      <View style={[styles.band, { paddingVertical: px(16) }]}>
        <StatCell figure={card.moved.toLocaleString()} label={t('share.weekMoved', { unit: card.unit })} px={px} />
        {card.kcal != null ? <StatCell figure={card.kcal.toLocaleString()} label={t('share.weekSpent')} px={px} /> : null}
        {card.durationMin != null ? (
          <StatCell figure={String(card.durationMin)} label={t('share.sessionMinutes')} px={px} />
        ) : null}
      </View>
      <View style={styles.hair} />

      {/* ⛔ A record set INSIDE this workout is a line on its story — never a rival card (see the
          field's note in domain/shareCard). Moss, under the band: the workout stays the headline. */}
      {card.record ? (
        <View style={[styles.recordLine, { gap: px(8), marginTop: px(14) }]}>
          <Legend size={px(10)} tone="accent">
            {t('share.recordEyebrow')}
          </Legend>
          <Text style={[styles.recordLineText, { fontSize: px(14), lineHeight: px(18) }]} numberOfLines={1}>
            {bidi(exerciseDisplayName(card.record.exerciseId))}
            {'  '}
            <Text style={styles.recordLineFigure}>{card.record.weight} {card.record.unit}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 9.4 — the run's story (founder 2026-08-23: the cardio finish is a pride she posts).
 *
 * The distance is the headline — it is the figure the finish poster leads with, and the two must
 * agree. Under it the whole-run pace, then the run's SHAPE: one bar per finished kilometre, height
 * by that kilometre's own time — the same instrument the poster draws, so the card a stranger sees
 * is the screen she saw. No route (the founder's 2026-08-04 ruling: a bare polyline is legible to
 * exactly one person, and she already knows).
 */
function CardioBody({
  card,
  t,
  px,
}: {
  card: Extract<ShareCardData, { kind: 'cardio' }>;
  t: (k: string, p?: Record<string, unknown>) => string;
  px: (n: number) => number;
}) {
  const perKm = t('cardio.perKm');
  return (
    <View style={styles.body}>
      {/* Two spacers, not one — the poster's composition exactly. With only the lower one the
          subject was shoved against the wordmark and all the air fell into a single hole above the
          band; a pair puts the distance and the pace in the MIDDLE and the facts at the foot. */}
      <View style={styles.grow} />
      <Legend size={px(11)} tone="accent">
        {card.longest ? t('share.cardioLongest') : t('share.cardioEyebrow')}
      </Legend>
      <View style={{ marginTop: px(14) }}>
        <Figure value={card.distanceKm.toFixed(1)} unit={t('cardio.km')} size={px(96)} />
      </View>
      {card.avgPaceSec != null ? (
        <View style={[styles.cardioPace, { gap: px(6), marginTop: px(4) }]}>
          <Text style={[styles.cardioPaceNum, { fontSize: px(24), letterSpacing: trackingPx(px(24), tracking.figure) }]}>{fmtPace(card.avgPaceSec)}</Text>
          <Text style={[styles.cardioPaceUnit, !monoCanDraw(perKm) && styles.figureUnitWord, { fontSize: px(13) }]}>{perKm}</Text>
        </View>
      ) : null}

      {/* ⛔ NO CHART HERE EITHER (founder, 2026-08-28) — see the long note on the DONE poster in
          `screens/cardio/Cardio`. The card says the run in figures, which is what a stranger
          scrolling past actually reads. */}

      {/*
        ⚠️ AND THE FACTS DROP TO THE FOOT, for the reason the poster's do — *"למה אתה לא מתפרש
        על המסך?"*. `body` centres its whole stack, so with the chart gone the card held 253 points
        of content in a 440-point well with ninety on each side of it, floating. The two surfaces show
        the SAME run and now compose the same way: wordmark at the head, the distance and the pace
        taking the middle, the band ruled off at the foot.
      */}
      <View style={styles.grow} />

      <View style={styles.hair} />
      <View style={[styles.band, { paddingVertical: px(16) }]}>
        <StatCell figure={fmtClock(card.durationSec)} label={t('cardio.timeShort')} px={px} />
        {card.kcal != null ? <StatCell figure={String(Math.round(card.kcal))} label={t('share.weekSpent')} px={px} /> : null}
      </View>
      <View style={styles.hair} />
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
      <Legend size={px(11)} tone="accent">
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
      <Text style={[styles.cellFigure, accent && styles.cellFigureUp, { fontSize: px(20), letterSpacing: trackingPx(px(20), tracking.figure) }]}>{figure}</Text>
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
  /* Pushes what follows it to the foot of the card — see the note in `CardioBody`. */
  grow: { flex: 1 },

  // record
  recordName: { fontFamily: font.serif, color: stage.ink0, textAlign: 'left' },
  recordDetail: { fontFamily: font.serif, color: stage.ink1, textAlign: 'left' },
  context: { fontFamily: font.sans, color: stage.ink1, textAlign: 'left' },

  // figures
  figure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], color: stage.ink0, textAlign: 'left' },
  figureUnit: { fontFamily: font.mono, color: stage.ink2, textAlign: 'left' }, // rtl-ok: nested unit inside figure, which sets textAlign
  figureUnitWord: { fontFamily: font.sans }, // rtl-ok: merged onto figureUnit — the sans handover for units the mono cannot draw

  // cardio (9.4)
  cardioPace: { flexDirection: 'row', alignItems: 'baseline' },
  cardioPaceNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], color: signal[0], textAlign: 'left' },
  cardioPaceUnit: { fontFamily: font.mono, color: stage.ink2, textAlign: 'left' },

  // week
  weekTitle: { fontFamily: font.serif, color: stage.ink0, textAlign: 'left' },
  togetherLine: { fontFamily: font.serif, color: stage.ink1, textAlign: 'left' },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  sessionFigures: { flexDirection: 'row', justifyContent: 'center' },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%' },
  band: { flexDirection: 'row' },
  cell: { flex: 1 },
  cellFigure: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], color: stage.ink0, textAlign: 'left' },
  cellFigureUp: { color: signal[0] }, // rtl-ok: merged onto cellFigure, which sets textAlign
  cellLabel: { fontFamily: font.sans, color: stage.ink1, textAlign: 'left' },

  hair: { height: 1, backgroundColor: line[1] },

  // the session card's record line (moss eyebrow + one ruled sentence)
  recordLine: { alignItems: 'flex-start' },
  recordLineText: { fontFamily: font.sans, color: stage.ink1, textAlign: 'left' },
  recordLineFigure: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], color: stage.ink0 }, // rtl-ok: nested inside recordLineText, which sets textAlign


  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The two faint legends stack on the trailing edge, both reading toward the same corner.
  footRight: { alignItems: 'flex-end', gap: 2 },
  // The date carries a MONTH NAME (a word) — so it is sans, never mono (the law). Letter-spaced to
  // read as an engraved footer mark rather than body copy.
  /* ⚠️ NO TRACKING. This is a DATE, and a Hebrew locale spells its months in Hebrew — so the one
     line on a card she posts publicly was the one most able to look broken (`noTrackedHebrew`). */
  footDate: { fontFamily: font.sansMedium, color: stage.ink2, textAlign: 'left' },
});
