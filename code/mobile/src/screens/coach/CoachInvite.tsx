/**
 * ════ THE INVITE, AS A SHEET — the coach's one way to add a trainee (the coach track, 2026-09-17) ════
 *
 * The press on the roster already minted the code and opened WhatsApp with the link (the pair's
 * one-tap pattern, `pairStore.inviteWhatsApp`). This sheet is what stays on the glass behind it: the
 * code in figures a trainee can type at install, the link, a way to send it again, and a way to copy
 * the code. It is also where a refusal is SAID — a full roster, too many open invites, no server.
 *
 * ⛔ A FULL ROSTER IS NOT A PAYWALL, AND IT IS NOT A DEAD END EITHER. The free tier is two trainees
 * (ruling 1). The sheet says what is true — the tier, and that removing somebody frees a seat — and
 * then offers the ONE door: `CoachPlans`, which is where a price is a price and where it says in
 * words if the tiers are not on sale yet. The named-but-null `COACH_SEATS_UPGRADE` hook this file
 * carried is gone; a door that opens onto a real screen does not need a placeholder.
 */

//

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, font } from '@/design/tokens';
import { COACH_FREE_SEATS } from '@/platform/billing';
import type { CoachTrackError } from '@/platform/coachTrackClient';

export type CoachInviteState =
  | { kind: 'invite'; code: string; url: string }
  /**
   * ⛔ TWO WAYS TO BE OUT OF SEATS, AND THEY ARE NOT THE SAME NEWS (2026-09-18).
   *
   * `overLimit` is the server's derived `plan.state === 'over_limit'`: his plan lapsed (or he
   * downgraded) while MORE athletes are linked than he now has seats for. The ordinary full roster
   * is "you filled what you have"; this one is "what you have shrank under people who are still
   * here". The one thing it must never read as is a removal — nothing is removed, ever (§6).
   */
  | { kind: 'full'; used: number; seats: number; overLimit?: boolean }
  | { kind: 'error'; error: CoachTrackError };

export function CoachInviteSheet({ state, onWhatsApp, onCopy, copyLabel, onSeats, onClose }: {
  state: CoachInviteState;
  onWhatsApp: () => void;
  onCopy: () => void;
  /** "Copy the code" where the platform can copy; "Send the code" where it can only share. */
  copyLabel: string;
  /** The full-roster door — `CoachPlans`. */
  onSeats: () => void;
  onClose: () => void;
}) {
  const { t } = useCopy();
  return (
    <BottomSheet onClose={onClose}>
      {state.kind === 'invite' ? (
        <>
          <Legend style={styles.legend}>{t('coachTrack.coach.invite.legend')}</Legend>
          <Text style={styles.code} selectable accessibilityLabel={t('coachTrack.coach.invite.codeLabel')}>{state.code}</Text>
          <Text style={styles.url} selectable>{state.url}</Text>
          <Text style={styles.body}>{t('coachTrack.coach.invite.body')}</Text>
          <Button block variant="signal" label={t('coachTrack.coach.invite.whatsAppAgain')} onPress={onWhatsApp} style={styles.act} />
          <Button block variant="ghost" label={copyLabel} onPress={onCopy} />
        </>
      ) : state.kind === 'full' ? (
        <>
          <Legend style={styles.legend}>{t('coachTrack.coach.invite.fullLegend', { used: state.used, seats: state.seats })}</Legend>
          <Text style={styles.title}>
            {t(state.overLimit ? 'coachTrack.coach.invite.overTitle' : 'coachTrack.coach.invite.fullTitle')}
          </Text>
          {/* ⛔ HIS LIMIT IS NOT "THE FREE TIER" (2026-09-18, walked). With `seat_limit` raised, this
              line read *"the free tier is up to 12 athletes"* — naming a number he had paid for as
              the number he gets for nothing. Only a coach actually on the free two is told what the
              free two are; everyone else is told about HIS seats. Same fault, same day, as the one
              on `CoachPlans`' own card — a screen that interpolates a limit must know where it
              came from. */}
          <Text style={styles.body}>
            {state.overLimit
              ? t('coachTrack.coach.invite.overBody', { used: state.used, seats: state.seats })
              : state.seats > COACH_FREE_SEATS
                ? t('coachTrack.coach.invite.fullBodyYours', { seats: state.seats })
                : t('coachTrack.coach.invite.fullBody', { seats: state.seats })}
          </Text>
          <Button block variant="signal" label={t('coachTrack.coach.invite.moreSeats')} onPress={onSeats} style={styles.act} />
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('coachTrack.coach.invite.failTitle')}</Text>
          <Text style={styles.body}>{t(`coachTrack.coach.error.${state.error}`, { defaultValue: t('coachTrack.coach.error.network') })}</Text>
        </>
      )}
      <Button block variant="ghost" label={t('common.close')} onPress={onClose} style={styles.act} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  legend: { marginBottom: 10 },
  code: { fontFamily: font.monoMedium, fontSize: 44, letterSpacing: 6, color: color.textPrimary, textAlign: 'center', marginVertical: 8 }, // latin-ok: the invite code is the pair alphabet, never a word
  url: { fontFamily: font.mono, fontSize: 17, color: color.textSecondary, textAlign: 'center', marginBottom: 12 },
  title: { fontFamily: font.serif, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 8 },
  body: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left', marginBottom: 6 },
  act: { marginTop: 10 },
});
