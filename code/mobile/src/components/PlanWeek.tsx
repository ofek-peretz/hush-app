/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK THE COACH WROTE, SHOWN.
 *
 * ⛔ FOUNDER, ON THE DEVICE, 2026-08-02:
 *
 *   > *"He says 'here is your plan' — but there's no screen at all that presents the plan nicely,
 *   > no confirmation that the exercises are even understood or right for me. He gave me the
 *   > feeling of yet another banal, un-personalised programme."*
 *
 * He was right, and the reason is worse than an omission. The screen after the intake was still the
 * DETERMINISTIC ERA'S loading theatre — 2.8 seconds of ticks reading "Designing your split" and
 * "Distributing weekly volume", for a generator that has been deleted. It animated work that no
 * longer happens and showed nothing of the work that did.
 *
 * ── WHY THE COACH'S OWN WORDS ARE ON EVERY ROW ──────────────────────────────────────────────────
 * `say` — the instruction in its own voice, "a rep short of failure", "at a pace where you could
 * hold a conversation" — is the whole difference between a programme and a table of numbers, and
 * it is the one field the old engine could never fill. A screen that showed the sets and dropped
 * the sentence would be the banal version of exactly this.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────────────────────────
 * It states, it does not explain. No legend telling her what a row means, no "here's how to read
 * this" — the founder's law, and it applies hardest on a screen whose whole job is to be read.
 *
 * Every number here comes from `coachWeek`, which is the same source Today and the session runner
 * read. This screen cannot show her a week she will not train.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Legend, Body, Caption } from '@/components/ds';
import { coachWeek, coachRows, coachPlanRows } from '@/domain/coachWeek';
import { color, font, s, radius } from '@/design/tokens';
import { useCopy } from '@/i18n/useCopy';
import type { CoachPlan } from '@/domain/coachPlan';

export function PlanWeek({ plan, units }: { plan: CoachPlan | null; units: 'kg' | 'lb' }) {
  const { t } = useCopy();
  const week = React.useMemo(() => coachWeek(plan), [plan]);
  /*
   * ⛔ THE COACH'S REASON FOR THIS LIFT BEING HERE (founder's plan, move 4): *"the thing that makes
   * us different has to land in the first 60 seconds."*
   *
   * The four-week simulation produced this on the FIRST programme, before she had trained once:
   *
   *   > *"landmine_press → Replaces barbell overhead press to allow overhead pushing without
   *   > shoulder clicking."*
   *
   * That is the entire wedge — it decides, and it says why — and **she never saw it.** `notes` went
   * to the coach log, which surfaces in the Why sheet and the Saturday letter. Both are days away
   * from the screen where she meets her programme, and one is behind a tap.
   *
   * ⚠️ NOT THE SAME AS `say`, and the row shows both. `say` is HOW to do the lift ("a rep short of
   * failure"); a note is WHY the lift is there at all. Every other app can write the first. Only
   * one that decided the programme can write the second.
   */
  const reasons = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const n of plan?.notes ?? []) if (n.ex && !m.has(n.ex)) m.set(n.ex, n.say);
    return m;
  }, [plan]);
  if (!plan || week.length === 0) return null;

  return (
    <View style={styles.week}>
      {week.map((w, i) => {
        /*
         * `coachRows` carries the coach's sentence; `coachPlanRows` carries the formatted ask. They
         * are the same list in the same order — paired by index rather than re-formatted here,
         * because a second copy of "how a distance is written" is a second answer to it.
         */
        const rows = coachRows(plan, w.id) ?? [];
        const shown = coachPlanRows(rows, units) ?? [];
        return (
          <View key={w.id} style={styles.session}>
            {/*
              ⛔ NO CARD (founder 2026-08-04, reviewing the screens against Today).

              Every session sat in a `color.surface` box, which is the one thing v7 removed from the
              whole product: *"nothing is a card on the stage now — the stage itself is lit, and
              emphasis is standing in that light versus resting in shadow."* Three framed boxes on a
              dark page is the form the app abandoned, still drawn on the two screens where she meets
              her programme.

              ⚠️ WHAT DID NOT CHANGE IS THE STRUCTURE, and that was the question worth asking. Today's
              column opens ONE session and reduces the rest to a line, because it answers *what am I
              doing today*. These two screens answer *what is this whole programme* — so every session
              stays expanded. Same grammar, different job; making them identical would have made both
              worse.
            */}
            <View style={styles.sessionHead}>
              {w.day ? (
                <Text style={styles.day}>{t(`weekday.${w.day}`).toUpperCase()}</Text>
              ) : (
                <Text style={styles.day}>{String(i + 1).padStart(2, '0')}</Text>
              )}
              <Text style={styles.sessionName} numberOfLines={2}>{w.name}</Text>
            </View>
            {shown.map((r, i) => (
              <View key={`${r.exerciseId}-${i}`} style={styles.row}>
                <View style={styles.rowLine}>
                  <Body style={styles.name}>{r.name}</Body>
                  <Caption tone="muted">{ask(r)}</Caption>
                </View>
                {/* ⚠️ 15, not the 13 a Caption gives. *"Certainly not small type"* — and the coach's
                    instruction is the whole reason this screen is not a table of numbers. */}
                {rows[i]?.say ? <Text style={styles.say}>{rows[i].say}</Text> : null}
                {/* The coach's own italic — the same voice its notes wear everywhere else. */}
                {reasons.get(r.exerciseId) ? (
                  <Text style={styles.reason}>{reasons.get(r.exerciseId)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * What the row asks for, in one string.
 *
 * `detail` is already written for the shapes that have one (a time, a distance). Reps are assembled
 * here because they are the only shape with two numbers — a count and a load — and a bodyweight
 * lift has no load at all, which must read as absence rather than as zero.
 */
function ask(r: { sets: number; band: [number, number]; load: number | null; detail?: string }): string {
  if (r.detail !== undefined) return r.detail;
  const reps = r.band[0] === r.band[1] ? `${r.band[0]}` : `${r.band[0]}–${r.band[1]}`;
  const count = `${r.sets}×${reps}`;
  return r.load == null ? count : `${count} · ${r.load}`;
}

const styles = StyleSheet.create({
  week: { gap: s(26) },
  session: { gap: s(10) },
  sessionHead: { flexDirection: 'row', alignItems: 'baseline', gap: s(12) },
  /* The same gutter the week column uses, so a session reads the same on both surfaces. */
  /* ⚠️ SANS. The weekday is a translated WORD ("א׳"), and mono cannot draw Hebrew — the same split
     the whole app makes between a measurement and a word. `monoCarriesNoWords` caught this one. */
  day: {
    width: s(40),
    fontFamily: font.sansMedium,
    fontSize: s(13),
    letterSpacing: 1.6,
    color: color.textMuted,
    textAlign: 'left',
  },
  sessionName: { flex: 1, fontFamily: font.serif, fontSize: s(21), lineHeight: s(25), color: color.textPrimary, textAlign: 'left' },
  /* Ruled rather than boxed — the same table Today draws its lifts in. */
  row: { gap: s(3), paddingVertical: s(9), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, marginStart: s(52) },
  rowLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: s(10) },
  // The name yields the row's width to the figure beside it, never the other way round: a long
  // exercise name may wrap, but "3×8–10 · 40" may not.
  name: { flexShrink: 1 },
  say: { fontFamily: font.sans, fontSize: s(15), lineHeight: s(21), color: color.textSecondary, textAlign: 'left' },
  // A REASON is the coach speaking, so it wears the coach's face — the serif italic its notes carry
  // on the Why sheet and in the Saturday letter. Set apart from `say` above, which is an instruction.
  reason: { fontFamily: font.serif, fontStyle: 'italic', fontSize: s(15), lineHeight: s(21), color: color.textSecondary, marginTop: s(3), textAlign: 'left' },
});
