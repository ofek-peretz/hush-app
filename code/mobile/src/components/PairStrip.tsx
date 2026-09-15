/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PARTNER, ON THE STAGE — §11.2, drawn. (2026-08-31)
 *
 * The handoff's own words for this row: *"The screen shows whose turn it is and holds each person's
 * own weight — never side-by-side to rank, but stacked to hand off."* Stacked, not side by side, is
 * the design decision this component exists to keep: two columns invite a comparison, and there is
 * no comparison to make — one of them is stronger and both of them already know.
 *
 * ── ⛔ IT SPEAKS ONLY ABOUT THE LIFT SHE IS ACTUALLY STANDING AT ────────────────────────────────
 *
 * `pair.atSameStation` gates every word about a TURN. The moment the two workouts drift — she moved
 * a lift later because the rack was busy, she is on a warm-up bridge of her own, one of them ran
 * ahead — the strip stops talking about turns and says only where her partner is. That single rule
 * covers every way two workouts can come apart, including the ones nobody has thought of yet, and
 * it is why there is no list of drift cases in this file.
 *
 * ── AND IT NEVER PRINTS A NUMBER IT WAS NOT SENT ────────────────────────────────────────────────
 *
 * `partnerBar` is optional at the type level because he can turn it off in one tap
 * (`domain/sharedSession`, on `bar`). With it off this row is a name, a state and a set count —
 * which is still the whole hand-off, because the thing she needs to know is *when*, not *what*.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { usePair } from '@/state/stores/pairStore';
import { useApp } from '@/state/stores/appStore';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, font, stage } from '@/design/tokens';
import type { PairView } from '@/state/stores/pairStore';
import type { SharedPresence } from '@/domain/sharedSession';

const STATE_KEY: Record<SharedPresence, string> = {
  lifting: 'pair.stateLifting',
  resting: 'pair.stateResting',
  paused: 'pair.statePaused',
  done: 'pair.stateDone',
};

export interface PairStripProps {
  /**
   * ⛔ THE HARNESS'S SEAM, AND IT IS AN OVERRIDE RATHER THAN A SECOND COMPONENT.
   *
   * §11.2 cannot be reviewed without a partner, and a partner needs two phones and a gym. The house
   * pattern for that is a props-only `…View` beside a container — and here it would be the wrong
   * shape, because this row is fifteen lines of conditionals and a duplicate of it is a duplicate
   * that drifts. One implementation, and the gallery hands it a `PairView` instead of the context's.
   *
   * Never passed by the app.
   */
  pair?: PairView;
  units?: 'kg' | 'lb';
}

/**
 * The row under her own numbers, on the set stage and on the rest.
 *
 * Renders nothing at all when there is no live pair — which is every solo workout and every build
 * with no wire. A component that drew a frame around emptiness would put a hole in the one screen
 * the product cannot afford one on.
 */
export function PairStrip(props: PairStripProps = {}) {
  const { t } = useCopy();
  const app = useApp();
  const live = usePair();
  const pair = props.pair ?? live;
  const st = pair.standing;

  if (pair.stage !== 'live' || !st || st.turn == null) return null;

  const units = props.units ?? app.profile?.units ?? 'kg';
  const name = pair.partnerName ? bidi(pair.partnerName) : null;
  const state = pair.partnerPresence ? t(STATE_KEY[pair.partnerPresence]) : null;
  /*
   * ⛔ HOW MUCH LONGER, NOT JUST WHERE (founder, 2026-08-31, on the moment she finishes a station
   * first): *"בזמן שמתאמן סיים את התרגיל ועובר כבר לתפוס את התרגיל האחר המתאמן השני עוד מסיים."*
   *
   * The row said where he was, which is information; it did not say whether to wait ten seconds or
   * two minutes, which is the decision she is actually making with it. "last set" is the whole
   * answer, and it is the one fact the count already contains.
   *
   * Only when the bar is HIS — on her own turn the number of sets he has left is not her business.
   */
  const theirLastSet = !st.mine && st.theirsSet.n === st.theirsSet.m;

  /*
   * ⛔ HE HAS GONE QUIET AND IT IS HIS TURN — so there is nobody to hand off to, and the honest
   * thing is to say so and let her train. `stale` is deliberately false while the bar is HERS
   * (`domain/sharedSession`), so this line can never interrupt a set she is standing over.
   */
  if (st.stale) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.gone}>{name ? t('pair.gone', { name }) : t('pair.goneAnon')}</Text>
      </View>
    );
  }

  // The two workouts have drifted apart. Say where he is; say nothing about a turn.
  if (!pair.atSameStation) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.quiet} numberOfLines={1}>
          {[
            name,
            state,
            st.exerciseId ? bidi(exerciseDisplayName(st.exerciseId)) : null,
            theirLastSet ? t('pair.lastSet') : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
    );
  }

  /*
   * ⛔ THE NUMBER IS ONLY DRAWN BESIDE THE LIFT IT NAMES. His frame says what is going on his bar
   * next; if he has moved on to a station she has not reached — or swapped, or is on a bridge — his
   * number belongs to a different lift, and printing it here would put a confident, plausible,
   * wrong weight under this row's heading. No match, no number; the hand-off still reads.
   */
  const bar = pair.partnerBar && pair.partnerBar.exerciseId === st.exerciseId ? pair.partnerBar : null;
  const w = bar ? displayWeight(bar.kg, units) : null;

  /*
   * ⛔ TWO LINES, AND THE SECOND ONE HOLDS EVERYTHING.
   *
   * The stage is a fixed layout with a flexing middle: every pixel this strip takes in the footer
   * is a pixel the athlete figure loses above it. A third line (his load on its own row, as the
   * handoff mock draws it) cost about ninety points of stage on a small phone, for a number that
   * reads perfectly well at the end of the row it belongs to.
   */
  return (
    <View style={styles.wrap}>
      {/* WHOSE TURN IT IS — the one thing this row exists to say, and it is said first. */}
      <Legend tone={st.mine ? 'accent' : 'muted'} style={styles.legend}>
        {st.mine ? t('pair.yourTurn') : name ? t('pair.theirTurn', { name }) : t('pair.theirTurnAnon')}
      </Legend>
      <View style={styles.row}>
        {/*
          ⛔ A TURN IT CANNOT VERIFY IS NOT DRAWN. While the socket is down these counts are the
          last ones that arrived, and the honest thing on a screen she is making decisions from is
          to say so — with the second half of the sentence that matters more: the workout carries
          on. The wire is an accelerator, never a dependency (`platform/sharedClient`).
        */}
        <Text style={styles.who} numberOfLines={1}>
          {pair.link === 'open'
            ? [
                name,
                state,
                theirLastSet ? t('pair.lastSet') : t('pair.setOf', { n: st.theirsSet.n, m: st.theirsSet.m }),
              ].filter(Boolean).join(' · ')
            : t('pair.linkDown')}
        </Text>
        {w != null && bar && pair.link === 'open' ? (
          /* HIS number, sent by his phone, for the plates one of them is about to change. Never
             computed here, and never stored anywhere — see `domain/sharedSession` on `bar`.
             Quieter than her own by a full step: it is here so the bar can be reloaded without
             asking, not so the two numbers can be read against each other. */
          <Text style={styles.bar}>{`${w} ${unitLabel(units)} × ${bar.reps}`}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  legend: { marginBottom: 6, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  who: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink1, textAlign: 'left' },
  bar: { fontFamily: font.mono, fontSize: 17, lineHeight: 21, color: stage.ink2, textAlign: 'right' },
  /* ⛔ A PARTNER WHO WENT QUIET IS A FACT, NOT AN ALARM. It takes the stage's ordinary cream —
     `alert.stage` is clay, and clay in this app means pain and destructive confirms. Somebody
     putting their phone down between sets is neither. */
  gone: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink1, textAlign: 'left' },
  quiet: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textTertiary, textAlign: 'left' },
});
