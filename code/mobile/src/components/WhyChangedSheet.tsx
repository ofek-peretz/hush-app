/**
 * WHY THIS CHANGED (v7 2.1b / 2.1c / 2.1d) — the product's argument, in one screen.
 *
 * The brief calls the engine explaining itself the most distinctive thing Hush does. This is where
 * it does it at full length: tap a lift the engine touched, and it shows the change as ONE MOTION —
 * the old load struck through, the new one standing in moss beside it — and then draws the PROOF
 * underneath, on the athlete's own band, with the two sessions that made the case.
 *
 * ════ ONE SHEET, THREE VERDICTS — AND THE DIRECTION IS THE COLOUR ════
 *
 * The handoff draws it three times and changes almost nothing between them, which is the point: a
 * raise, a hold and an ease are the same argument reaching different conclusions, so they look like
 * the same argument. What they do NOT share is the tone, because the athlete reads the colour before
 * she reads a word (founder 2026-07-28, and again 2026-07-29 when this sheet was found still green
 * on an ease):
 *
 *   RAISED (2.1b) — "Your reps sized this."      old struck · new in MOSS  · a moss `+3.5` pill
 *   HELD   (2.1c) — "Your reps held this."       one load, CREAM           · a neutral `HELD` pill
 *   EASED  (2.1d) — "Your reps asked for less."  old struck · new in BLUE  · a blue `−2.5` pill
 *
 * Blue is not a demotion — it is the colour of care rather than alarm (see `down` in tokens). Clay
 * is reserved for pain and for destructive confirms, and appears nowhere on this sheet.
 *
 * ════ WHAT IS ON THE BAND ════
 *
 * The band is her prescribed range with the two sessions' outcomes ON it — a hollow dot for the
 * session that fell short, a filled one for the session that reached. Nothing here is computed by
 * this component: every figure is handed in, already measured (R7 — Hush never states a reason it
 * did not measure). The closing line is the engine's own sentence, in the coach's italic serif.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Legend, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import { color, font, stage, up, down, hold } from '@/design/tokens';

/**
 * THE VERDICT'S TONE — the one place this sheet decides what colour the argument is.
 *
 * `fg` is the lit figure, `wash` the band's filled span, `glow` the halo under the big number. The
 * washes are the token hues at the span's own alpha (RN needs a literal rgba, and the band is
 * heavier than a token `wash`, which is tuned for a chip behind text).
 */
const VERDICT = {
  up: { fg: up.stage, wash: 'rgba(169,196,159,0.30)', glow: 'rgba(169,196,159,0.22)' },
  down: { fg: down.stage, wash: 'rgba(126,178,214,0.30)', glow: 'rgba(126,178,214,0.22)' },
  // A hold did not move, so it does not glow: it stands in the cream the stage speaks in.
  hold: { fg: hold.stage, wash: 'rgba(241,238,229,0.22)', glow: 'transparent' },
} as const;

/** One session's evidence on this lift: the day it happened, the load, the reps of each set. */
export interface WhySession {
  /** "15 July · last session" — already formatted by the caller, which owns the locale. */
  label: string;
  /** "44 × 9·9·8" — the load and the set-by-set reps, as one mono figure. */
  figure: string;
  /** Did this session reach the top of the band? Drives the filled vs hollow mark. */
  reached: boolean;
}

export interface WhyChangedProps {
  /** The lift, and the day the decision was stamped — "BARBELL ROW · 18 JUL". */
  liftName: string;
  dateLabel: string;
  /** Which way it went. `hold` draws one load and no arrow. */
  verdict: 'up' | 'down' | 'hold';
  /** The load it came from, formatted. Null on a hold — there is nothing to strike. */
  loadFrom: string | null;
  loadTo: string;
  unit: string;
  /** "+3.5" / "−2.5" — the pill's figure. Null on a hold, which wears the word instead. */
  delta: string | null;
  /** Her band, and where the two sessions landed in it (0–1 along the band). */
  band: [number, number];
  /** The engine's own headline for what her reps did — one short serif line, may wrap. */
  title: string;
  /** The band's caption: "EVERY REP LANDED INSIDE YOUR BAND". */
  bandNote: string;
  /** The two sessions that made the case, oldest first. */
  sessions: WhySession[];
  /** The engine's closing sentence, in its own voice. */
  line: string;
  onClose: () => void;
}

/** Where a session's mark sits along the band, as a percentage of the drawn span. */
const MARK_LEFT = ['50%', '76%'] as const;

export function WhyChangedSheet(props: WhyChangedProps) {
  const { t } = useCopy();
  const held = props.verdict === 'hold';
  const tone = VERDICT[props.verdict];

  return (
    <View style={styles.root}>
      {/* The glow that opens the sheet: light spilling in from above the frame, so the screen reads
          as the engine speaking rather than a form appearing — and it is the VERDICT'S light. The
          handoff tints the whole sheet by verdict (2.1d is sand end to end); with the founder's law
          the hue is blue instead, but the structure is the handoff's: one sheet, one colour. */}
      {/* absoluteFill on the WRAPPER, percentages inside (the `components/ds/Stage` pattern).
          Both on the <Svg> gives it two ways to be sized and they disagree on the first native
          frame — the defect the founder photographed on the first-four card (build 36). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="whyGlow" cx="50%" cy="-12%" rx="120%" ry="78%">
              <Stop offset="0" stopColor={tone.fg} stopOpacity="0.12" />
              <Stop offset="0.58" stopColor={tone.fg} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#whyGlow)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <View style={[styles.dot, { backgroundColor: tone.fg }]} />
            <Legend track={0.2} tone="accent" style={{ color: tone.fg }}>
              {t(held ? 'why.legendHeld' : props.verdict === 'up' ? 'why.legendChanged' : 'why.legendEased')}
            </Legend>
            <View style={styles.flex} />
            <Legend track={0} weight="regular">{`${props.liftName} · ${props.dateLabel}`}</Legend>
          </View>

          <Text style={styles.title} accessibilityRole="header">{props.title}</Text>

          {/* THE CHANGE, AS ONE MOTION — struck, then standing. */}
          <View style={styles.change}>
            {props.loadFrom != null ? <Text style={styles.from}>{props.loadFrom}</Text> : null}
            <Text style={[styles.to, { color: tone.fg, textShadowColor: tone.glow }]}>{props.loadTo}</Text>
            <Text style={styles.unit}>{props.unit}</Text>
            <View style={[styles.pill, { backgroundColor: tone.fg }, held && styles.pillHeld]}>
              <Legend size={17} track={0.06} style={held ? styles.pillTextHeld : styles.pillText}>
                {props.delta ?? t('why.held')}
              </Legend>
            </View>
          </View>

          {/* THE PROOF. */}
          <View style={styles.proof}>
            {/* 12, not 11 — this labels the figure directly under it and was sitting at the legend
                floor for no reason but habit. */}
            <Legend size={17}>{props.bandNote}</Legend>

            <View style={styles.band}>
              <View style={styles.bandRule} />
              <View style={[styles.bandSpan, { backgroundColor: tone.wash }]} />
              <View style={[styles.bandTick, styles.bandTickLo, { backgroundColor: tone.fg }]} />
              <View style={[styles.bandTick, styles.bandTickHi, { backgroundColor: tone.fg }]} />
              <Text style={[styles.bandNum, styles.bandNumLo, { color: tone.fg }]}>{props.band[0]}</Text>
              <Text style={[styles.bandNum, styles.bandNumHi, { color: tone.fg }]}>{props.band[1]}</Text>
              {props.sessions.map((s, i) => (
                <View
                  key={s.label}
                  style={[
                    styles.mark,
                    s.reached ? { backgroundColor: tone.fg } : { backgroundColor: stage[1], borderWidth: 2.5, borderColor: tone.fg },
                    { left: MARK_LEFT[i] ?? '50%' },
                  ]}
                />
              ))}
            </View>

            <View>
              {props.sessions.map((s, i) => (
                <View key={s.label} style={[styles.row, i === props.sessions.length - 1 && styles.rowLast]}>
                  <Text style={styles.rowLabel} numberOfLines={1}>{s.label}</Text>
                  <Text style={styles.rowFigure}>{s.figure}</Text>
                </View>
              ))}
            </View>
          </View>

          {/*
            The coach's closing sentence — absent when it decided without writing one. An empty
            string here used to draw an empty italic block with its own top padding, which reads as
            a sentence that failed to load rather than as a decision that needed no words.
          */}
          {props.line ? <Text style={styles.line}>{props.line}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          {/* The provenance, stated. Nothing on this screen came from anywhere else. */}
          <Legend size={17} track={0.14} align="center">{t('why.decidedFrom')}</Legend>
          <Button variant="primary" size="whySheet" block label={t('whyLoad.got')} onPress={props.onClose} />
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * A measured case → what the sheet draws.
 *
 * The only work here is LANGUAGE: the dates and the band's caption are chosen from facts already
 * established, never re-derived. It lives beside the sheet rather than inside a screen because BOTH
 * doors into the argument — a changed lift on Today, and a WHY pill on the Saturday letter — must
 * produce the same words from the same case. Two presenters would be two voices.
 */
export function whyProps(
  c: ChangedLiftCase,
  t: (k: string, o?: Record<string, unknown>) => string,
  locale: string,
): Omit<WhyChangedProps, 'onClose'> {
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  const short = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const last = c.sessions[c.sessions.length - 1];
  // The band's caption states WHICH of the three cases this is — and it is decided by the marks
  // already on the band, so the words and the drawing can never disagree.
  const bandNote =
    c.verdict === 'up' ? t('why.bandInside') : c.verdict === 'down' ? t('why.bandBelow') : t('why.bandShort');
  return {
    liftName: exerciseDisplayName(c.exerciseId),
    dateLabel: last ? short(last.at) : '',
    verdict: c.verdict,
    loadFrom: c.from,
    loadTo: c.to,
    unit: c.unit,
    delta: c.delta,
    band: c.band,
    title: t(c.verdict === 'up' ? 'why.titleUp' : c.verdict === 'down' ? 'why.titleDown' : 'why.titleHold'),
    bandNote,
    sessions: c.sessions.map((s, i) => ({
      label: `${day(s.at)} · ${t(i === c.sessions.length - 1 ? 'why.today' : 'why.lastSession')}`,
      figure: s.figure,
      reached: s.reached,
    })),
    // The engine's reason was an i18n key the app expanded; the coach's is already a sentence.
    line: 'text' in c.line ? c.line.text : c.line.key ? t(c.line.key, c.line.params) : '',
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 24 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },

  // 39px, line-height 1.0 — the headline is two short lines, tight, like a struck statement.
  title: { fontFamily: font.serif, fontSize: 39, lineHeight: 39, color: stage.ink0, marginTop: 16, textAlign: 'left' },

  change: { flexDirection: 'row', alignItems: 'baseline', gap: 14, marginTop: 22 },
  // The load it CAME from: struck through, in the deep ink of something no longer true.
  from: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 32,
    lineHeight: 32,
    color: '#57534a',
    textDecorationLine: 'line-through',
    textAlign: 'left',
  },
  // …and the load it moved TO: 70px in the VERDICT's own tone, with a wide soft glow. The one lit
  // thing here — colour and glow both come from `VERDICT` at the call site.
  to: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 70,
    lineHeight: 70,
    letterSpacing: -2.8,
    textAlign: 'left',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },
  unit: { fontFamily: font.mono, fontSize: 17, color: stage.ink2, textAlign: 'left' },

  pill: { alignSelf: 'center', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 100 },
  pillText: { color: stage[0] },
  // HELD wears the word on a hairline instead of a filled mark — nothing was spent.
  pillHeld: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(241,238,229,0.24)' },
  pillTextHeld: { color: stage.ink1 },

  /*
   * ════ ⛔ THE PROOF WAS THE SMALLEST THING ON THE SHEET, UNDER A 188-PIXEL HOLE ════
   *
   * FOUNDER, 2026-08-12: *"ניראה נהדר אבל למה שלא תנצל את החלל הריק שיש באמצע? ולמה שלא תגדיל את
   * המלל הקטן הזה שבקושי רואים ותיתן יותר אוויר וגודל למלל."*
   *
   * Measured in the harness before touching anything: the argument ended at y=432 and the closing
   * sentence began at y=620. **One hundred and eighty-eight empty pixels through the middle of the
   * screen** — `line` carries `marginTop: 'auto'`, which is a good rule (a conclusion sits at the
   * foot of its argument) applied to a block that had not been given enough to say.
   *
   * ⚠️ AND WHAT SAT ABOVE THE HOLE WAS THE EVIDENCE ITSELF — `44 × 9·9·8` against `44 × 10·10·10`,
   * her own reps, **the two lines the entire verdict is derived from**, set at 13px: the smallest
   * type on a sheet whose headline number is 70. The load got the glow and the reason that earned
   * it got the footnote treatment. That is the wrong way round on the one screen in this product
   * whose whole job is showing its working.
   *
   * So the space goes to the proof rather than to padding: the band is a real figure (62px, not
   * 34), and the two sessions are ROWS — 18px tabular figures, 15.5px labels, room to breathe. The
   * conclusion still anchors low; there is simply much less nothing above it.
   */
  proof: { marginTop: 32, paddingTop: 22, borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.12)', gap: 20 },

  // The band: her range, drawn, with the two sessions landed on it. Every offset below is measured
  // from the rule at top:27 — the ticks, the span and the marks are all centred on it.
  band: { width: '100%', height: 62 },
  bandRule: { position: 'absolute', left: 0, right: 0, top: 27, height: 1, backgroundColor: 'rgba(241,238,229,0.16)' },
  bandSpan: { position: 'absolute', left: '24%', width: '52%', top: 24.5, height: 6, borderRadius: 3 },
  bandTick: { position: 'absolute', top: 17, width: 2, height: 21 },
  bandTickLo: { left: '24%' },
  bandTickHi: { left: '76%' },
  // rtl-ok — absolutely positioned onto a DRAWN band whose ticks are at fixed percentages; the
  // two variants below (always applied with it) carry the alignment that pins each number to its
  // tick. The band is a figure, not text flow, so it must not mirror away from what it labels.
  bandNum: { position: 'absolute', top: 42, fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 17 }, // rtl-ok — the variants below pin each number to its drawn tick
  bandNumLo: { left: '24%', marginStart: -7, textAlign: 'left' },
  bandNumHi: { left: '76%', marginStart: -9, textAlign: 'left' },
  // A session that REACHED the top is filled; one that fell short is a ring — the difference the
  // whole argument turns on, drawn rather than described. Both take the verdict's tone at the call
  // site, so the marks can never be a different colour from the number they explain.
  mark: { position: 'absolute', top: 19.5, width: 16, height: 16, borderRadius: 8, marginStart: -8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.08)',
  },
  rowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.08)' },
  rowLabel: { flexShrink: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: '#c9c4b4', textAlign: 'left' },
  // ⚠️ 18, AND IT IS THE SECOND-LARGEST FIGURE ON THE SHEET BY INTENT. This is what she did; the
  // 70px number is only what the engine did about it.
  rowFigure: { flexShrink: 0, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 18, lineHeight: 22, color: stage.ink0, textAlign: 'right' },

  // The engine's closing sentence, in its own voice, at the foot of the argument.
  line: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 21, lineHeight: 30, color: stage.ink0, marginTop: 'auto', paddingTop: 26, paddingBottom: 4, textAlign: 'left' },

  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 30, gap: 11 },
});
