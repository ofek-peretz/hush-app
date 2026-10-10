/**
 * ════ THE COACH'S LINE ABOUT A LIFT — attributed, lit, small (the coach track, law 7 — 2026-09-17) ════
 *
 * *"ההערה שלו יושבת מתחת לתרגיל שלה."* A linked coach may send one note of at most 140 characters
 * per lift and nothing else — no chat. It is drawn where it is read: under its lift on the
 * pre-workout card, and on the set stage while she stands in front of the bar.
 *
 * ⚠️ ATTRIBUTED, ALWAYS. The app's own AI voice also writes a line on the stage (`SayLine`); a
 * sentence from a PERSON must never be mistaken for the app's, so it carries the coach's name and
 * takes the moss that marks a decision made — not the cream the app speaks in.
 *
 * ⚠️ SANS, never mono: it is words, in whichever language the coach wrote (`monoCarriesNoWords`).
 */

import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { bidi, bidiName } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { font, signal } from '@/design/tokens';

export function CoachNoteLine({
  note,
  coachName,
  lines,
  style,
}: {
  note?: string | null;
  coachName?: string | null;
  /** Cap the lines on a crowded surface (the set stage); uncapped on the card. */
  lines?: number;
  style?: TextStyle;
}) {
  const { t } = useCopy();
  const said = note?.trim();
  if (!said) return null;
  const who = coachName?.trim();
  /*
   * ⛔ THE CAP MAY NOT EAT THE ATTRIBUTION (2026-09-18, measured at the 140-character bound).
   *
   * The whole line — `"note" · Coach` — was one Text, and the set stage caps it at two. A note near
   * its limit fills both lines by itself, so `numberOfLines` truncated the NAME away and left a
   * stranger's instruction on the stage in the same lit moss the app's own voice uses. The header
   * above says it: *a sentence from a PERSON must never be mistaken for the app's* — and the one
   * surface where she reads it with a bar in her hands was the surface that dropped it.
   *
   * So on a capped surface the note takes the cap and the attribution is its own, uncapped line.
   * Uncapped surfaces keep the single run, where the name sits inline and costs nothing.
   */
  if (lines && who) {
    return (
      <>
        <Text style={[styles.note, style]} numberOfLines={lines}>
          {t('coachTrack.athlete.noteQuote', { note: bidi(said) })}
        </Text>
        <Text style={[styles.note, styles.by, style]} numberOfLines={1}>
          {bidiName(who)}
        </Text>
      </>
    );
  }
  const text = who ? t('coachTrack.athlete.noteLine', { note: bidi(said), coach: bidiName(who) }) : bidi(said);
  return (
    <Text style={[styles.note, style]} {...(lines ? { numberOfLines: lines } : {})}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  /* 17 — the type floor; lit moss on the stage (`signal[0]`, the stage variant). */
  note: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: signal[0], textAlign: 'left' },
  /* The signature under a capped note — the same voice, a degree quieter, because the words are the
     point and the name is who owns them. `marginTop: 0` on purpose: it is one block, not two. */
  by: { opacity: 0.8 },
});
