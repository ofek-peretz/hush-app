/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HIS STATION IS TAKEN — AND HE IS ASKING (founder ruling 1, 2026-08-31).
 *
 * *"מציע לשני, הזוג נשאר."* One sentence, two answers, and no third state: whichever she presses,
 * both of them are still training together thirty seconds later. That is the whole reason this
 * sheet exists instead of the swap simply happening — a pair that broke because somebody found a
 * free machine would be a pair that breaks most workouts.
 *
 * ── ⚠️ IT ARRIVES UNINVITED, SO IT SAYS WHO AND WHY IN ITS FIRST LINE ───────────────────────────
 *
 * Every other sheet on this stage is something she opened. This one lands on her mid-workout
 * because somebody two metres away pressed a button, and a sheet like that has to answer "what is
 * this" before it asks anything. So the head is the proposal in full — his name, the lift going,
 * the lift coming — and the two buttons are both plain verbs. Neither of them is "Accept"; the copy
 * law forbids that word, and it is right to: she is not approving a request, she is deciding what
 * to lift next.
 *
 * ⚠️ AND THE "NO" IS NOT A CANCEL. It names the lift she is keeping, so the quiet answer is as
 * legible as the loud one — she is not dismissing a dialog, she is staying on the bench press.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React from 'react';
import { Text, StyleSheet } from 'react-native';

import { BottomSheet, SHEET_SETTLE } from '@/components/BottomSheet';
import { Arrive, Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { exerciseDisplayName } from '@/data/exercises';
import { font, stage } from '@/design/tokens';

export interface PairSwapSheetProps {
  /** The lift he wants to leave. */
  from: string;
  /** The lift he wants instead. */
  to: string;
  /** His first name, already bidi-wrapped, or null when he has not sent one. */
  partner: string | null;
  onYes: () => void;
  onNo: () => void;
}

export function PairSwapSheet({ from, to, partner, onYes, onNo }: PairSwapSheetProps) {
  const { t } = useCopy();
  const fromName = bidi(exerciseDisplayName(from));
  const toName = bidi(exerciseDisplayName(to));

  return (
    /* ⛔ NO SCRIM DISMISS AND NO CLOSE BUTTON — the two answers are the only ways out, because
       there is a person on the other end of this waiting for one of them. `onClose` therefore
       answers NO rather than vanishing: a sheet swiped away is a decline, said out loud. */
    <BottomSheet onClose={onNo}>
      <Arrive order={0} after={SHEET_SETTLE}>
        <Legend style={styles.legend}>{t('pair.title')}</Legend>
        <Text style={styles.head}>
          {partner
            ? t('pair.swapAsk', { name: partner, from: fromName, to: toName })
            : t('pair.swapAsk', { name: '', from: fromName, to: toName }).replace(/^[\s:·—-]+/, '')}
        </Text>
      </Arrive>
      <Button variant="primary" size="lg" block label={t('pair.swapYes')} onPress={onYes} style={styles.yes} />
      <Button variant="ghost" block label={t('pair.swapNo', { from: fromName })} onPress={onNo} style={styles.no} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  legend: { marginBottom: 10, textAlign: 'left' },
  head: { fontFamily: font.serif, fontSize: 27, lineHeight: 32, color: stage.ink0, textAlign: 'left' },
  yes: { marginTop: 24 },
  no: { marginTop: 10 },
});
