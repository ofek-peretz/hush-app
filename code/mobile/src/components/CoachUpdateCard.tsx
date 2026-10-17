/**
 * ════ THE UPDATE CARD — a coach changed the week (the coach track, law 2 — 2026-09-17) ════
 *
 * *"עדכון מוצג עם ההבדלים ועם היום שבו הוא נכנס לתוקף."* When a new version of her coach's week
 * LANDS (never under a running workout — `landCoachUpdate`), Today opens on this card: who changed
 * it, how many changes, from which day, and the first few of them by lift. One tap puts it away;
 * the week itself is already on the board beneath it.
 *
 * ⚠️ PAPER, NOT A STAGE WASH. It is the one card on Today that is a message from a person, and the
 * design draws it as a note handed over — the paper ground and the ink that reads on it. It is not a
 * warning and carries no clay.
 *
 * ⚠️ NO AGREEMENT WITH THE NAME. A coach may be a man or a woman and the copy cannot know which, so
 * no Hebrew verb here agrees with `{{coach}}` (the lint note on agreement across an interpolation).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bidi, bidiName } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { alert, font, ink, paper, radius } from '@/design/tokens';

export interface CoachUpdateCardProps {
  coachName: string;
  /** Every change, counted (`diffCount`). */
  count: number;
  /** "today" or the weekday's name, already spoken. */
  dayLabel: string;
  /**
   * ⛔ THE CHANGES, UNDER THE DAY EACH ONE HAPPENED ON (2026-09-18).
   *
   * The card used to take a flat list of lift names, because `CoachDiffLift.day` was carried from
   * `diffWeeks` to here and then discarded — so on a four-day week *"− לחיצה צבאית"* named the lift
   * and hid the workout, and she could not place her own change. `updateCardGroups` decides the
   * grouping and the caption (the reasoning lives there); this draws it.
   *
   * `name` is already spoken — a lift's display name, or, on an ORDER line, the whole sentence.
   */
  groups: { day: string; lines: { sign: '+' | '−' | '~' | '⇅'; name: string; detail?: string }[] }[];
  /** Lifts this build does not know, left out of the week. */
  dropped?: number;
  /**
   * ⛔ LAW 7 SAYS THERE IS NO CHAT, SO THE ONE MOVE SHE HAS IS HER OWN PHONE (2026-09-18).
   *
   * A dropped lift can leave a day short — worst case a single lift — and until now the card told
   * her that and stopped, on a track with no reply channel by design. This opens WhatsApp (the
   * invite's own pattern) with a line that names the lift and the day. Nothing reaches our server.
   * Absent when the day is not known (an update stored by an older build).
   */
  onAskCoach?: () => void;
  askLabel?: string;
  onDismiss: () => void;
}

export function CoachUpdateCard(props: CoachUpdateCardProps) {
  const { t } = useCopy();
  const title = t('coachTrack.athlete.updateTitle', { coach: bidiName(props.coachName) });
  /* ⛔ THE CAP AND THE COUNT ARE ONE DERIVATION — see the note on `updateMore` below. Grouping made
     the drawn figure a sum across groups rather than the length of one array; it is counted here so
     the two can never drift apart again. */
  const shown = props.groups.reduce((n, g) => n + g.lines.length, 0);
  return (
    <View style={styles.card} accessible accessibilityRole="summary" accessibilityLabel={title}>
      <Text style={styles.title}>{title}</Text>
      {props.count > 0 ? (
        <Text style={styles.meta}>{t('coachTrack.athlete.updateMeta', { count: props.count, day: props.dayLabel })}</Text>
      ) : null}
      {props.groups.length > 0 ? (
        <View style={styles.lines}>
          {props.groups.map((g) => (
            <View key={g.day} style={styles.group}>
              {/* The day is a CAPTION over its own changes, not a column on every row: it is said
                  once however many lines hang under it, and it is the coach's own word for the day. */}
              <Text style={styles.groupDay} numberOfLines={1}>{bidi(g.day)}</Text>
              {g.lines.map((l, i) => (
                <View key={`${l.sign}${l.name}${i}`}>
                  <View style={styles.line}>
                    <Text style={styles.sign}>{l.sign}</Text>
                    <Text style={styles.lineText}>{bidi(l.name)}</Text>
                  </View>
              {/*
                ⛔ THE FIGURES GET THEIR OWN LINE, AND THE FLOOR IS WHY (2026-09-18).

                They were drawn on the END EDGE of the name's row — which at the type floor (17,
                `typeHasAFloor`) leaves a 12-character measurement holding ~122 of the card's 306
                points, and the LIFT NAME gets whatever is left and ellipsises. That is the row
                breaking its most important element to protect its least, and the elevation pass has
                already settled it once on the pre-workout sheet: when the deficit is structural the
                answer is a SECOND LINE, not a smaller font.

                Indented into the name's column, so it reads as belonging to the lift above it.
                `bidi()`: a run with no strong character resolves LTR inside a First-Strong Isolate,
                which is the one way to be sure `3→4` never renders as `4→3` in Hebrew.
              */}
                  {l.detail ? <Text style={styles.lineDetail}>{bidi(l.detail)}</Text> : null}
                </View>
              ))}
            </View>
          ))}
          {/*
            ⛔ FOUR LINES OUT OF TWELVE IS A LIE UNLESS IT SAYS SO (measured 2026-09-18). The cap and
            the count lived in two places on the card and nothing joined them, so a week with twelve
            changes drew four lines — and because the order is removed-then-added, ALL FOUR were
            removals. The card said "your coach deleted four lifts" about a week he had rebuilt.
          */}
          {props.count > shown ? (
            <Text style={styles.more}>{t('coachTrack.athlete.updateMore', { count: props.count - shown })}</Text>
          ) : null}
        </View>
      ) : null}
      {/* ⛔ A LIFT HER COACH SENT THAT THIS BUILD CANNOT RUN is not a footnote in the same grey as
          the count — it is the one line on the card with something for her to DO, and it says it
          (clay on paper, `alert[0]`; the card is paper, so the stage's lit clay would be wrong). */}
      {props.dropped ? (
        <>
          <Text style={styles.dropped}>
            {`${t('coachTrack.athlete.updateDropped', { count: props.dropped })} ${t('coachTrack.athlete.updateDroppedFix')}`}
          </Text>
          {props.onAskCoach && props.askLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={props.askLabel}
              onPress={props.onAskCoach}
              hitSlop={8}
              style={({ pressed }) => [styles.ask, pressed && styles.dismissPressed]}
            >
              <Text style={styles.askText}>{props.askLabel}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('coachTrack.athlete.updateDismiss')}
        onPress={props.onDismiss}
        hitSlop={8}
        style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
      >
        <Text style={styles.dismissText}>{t('coachTrack.athlete.updateDismiss')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: paper[0], borderRadius: radius.lg, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, marginBottom: 18 },
  title: { fontFamily: font.sansSemibold, fontSize: 19, lineHeight: 24, color: ink[0], textAlign: 'left' },
  meta: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: ink[1], marginTop: 3, textAlign: 'left' },
  lines: { marginTop: 8, gap: 3 },
  group: { gap: 3 },
  /* The day — quieter than the changes it holds, and never competing with a lift name for width. */
  groupDay: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: ink[1], marginTop: 5, textAlign: 'left' },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  /* The sign is a mark, not a word — sans, so a Hebrew line beside it keeps one face. */
  sign: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: ink[0], width: 14, textAlign: 'center' },
  lineText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: ink[0], textAlign: 'left' },
  lineDetail: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, lineHeight: 22, color: ink[1], marginStart: 22, textAlign: 'left' },
  /* ⚠️ IT LEFT THE NAME COLUMN WHEN THE LINES LEARNED THEIR DAYS (2026-09-18). Indented to 22 it
     aligned with the lift names and read as one more lift OF THE LAST DAY. It is a statement about
     the whole card, so it sits on the day headers' own margin, under all of them. */
  more: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: ink[1], marginTop: 8, textAlign: 'left' },
  dropped: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: alert[0], marginTop: 8, textAlign: 'left' },
  /* The one act on this card that is not "put it away" — so it reads as a control, on the paper. */
  ask: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, marginStart: -10, borderRadius: radius.md, marginTop: 2 },
  askText: { fontFamily: font.sansSemibold, fontSize: 17, color: alert[0], textAlign: 'left' },
  dismiss: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.md, marginTop: 2 },
  /* A press is a wash under the words, never a fade of them (A.13). */
  dismissPressed: { backgroundColor: 'rgba(27,25,19,0.06)' },
  dismissText: { fontFamily: font.sansSemibold, fontSize: 17, color: ink[0], textAlign: 'left' },
});
