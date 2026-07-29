/**
 * PERMISSION · THE HONEST ASK (v7 8.2).
 *
 * "We earn the prompt: state exactly what we'll send and how often, before the system dialog. No
 * dark pattern, no pre-checked traps. Shown once, right after your first session (2.5) — never at
 * onboarding, before value is felt."
 *
 * ════ THE LIST IS THE PROMISE, SO IT NAMES WHAT WE ACTUALLY SEND ════
 * This screen's whole claim is "exactly what we'll send". A row here that named a notification the
 * app does not schedule would be the one lie the screen exists to prevent — so the rows are read
 * off the real behaviour in `platform/notifications.ts`: the Saturday letter (the one recurring
 * push this product sends) and the rest-ending tap inside a workout. The third row is what Hush
 * will NEVER send, struck rather than ticked, because that promise is worth as much as the two
 * above it.
 *
 * ════ ASKING IS NOT REQUESTING ════
 * "Allow" opens the SYSTEM dialog; it does not grant anything. "Not now" leaves the permission
 * untouched and never asks again from here — iOS gives one prompt, and spending it on someone who
 * just said no is how an app loses it for good.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { useCopy } from '@/i18n/useCopy';
import { color, font, signal } from '@/design/tokens';

export interface NotificationAskProps {
  /** Opens the system dialog. What iOS answers is not this screen's business — it made the ask. */
  onAllow: () => Promise<unknown> | void;
  /** Dismiss without spending the one prompt iOS gives us. */
  onDecline: () => void;
}

export function NotificationAsk({ onAllow, onDecline }: NotificationAskProps) {
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);

  async function allow() {
    if (busy) return;
    setBusy(true);
    try {
      await onAllow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        {/* The brand's mark in CREAM here — this screen carries no signal, it makes a promise. */}
        <RangeMark width={44} height={18} />

        <Text style={styles.title} accessibilityRole="header">{t('notifAsk.title')}</Text>

        {/* ════ THE SCREEN HAS TO EARN THE YES (founder 2026-07-28) ════
            It spent two of its four lines on what Hush will NOT do — "never a nudge for missing a
            day, never guilt", "at most one a week" — and both are true and neither is a reason to
            say yes. A defence answers an objection she has not raised yet; it does not tell her
            what she gets. Every line here is now something she RECEIVES, and the promise those two
            lines were making is kept by the product itself: there is no reminder in the catalogue
            at all, so there is no nudge to promise the absence of.

            THE THIRD LINE CHANGED (founder 2026-07-29). It promised a QUARTERLY report, which is
            no longer a notification — the Saturday letter already does that job every week, and a
            screen that promises something the product does not send is the worst thing this screen
            could contain. It now names the kilometre, which is the third thing that really fires.
            The four that may ever fire: rest about to end · rest over · Saturday 20:30 · each
            kilometre. Two of them are one promise here, because "a tap when your rest ends" is how
            the athlete experiences both. */}
        <View style={styles.rows}>
          <Row kind="will" text={t('notifAsk.willWeekly')} />
          <Row kind="will" text={t('notifAsk.willRest')} />
          <Row kind="will" text={t('notifAsk.willReport')} last />
        </View>
      </View>

      <View style={styles.foot}>
        <Button variant="primary" size="lg" block label={t('notifAsk.allow')} disabled={busy} onPress={allow} />
        <Button variant="quiet" block label={t('notifAsk.notNow')} onPress={onDecline} />
      </View>
    </SafeAreaView>
  );
}

/** One thing she receives. There is no second kind any more — see the block above. */
function Row({ kind, text, last }: { kind: 'will'; text: string; last?: boolean }) {
  void kind; // the row's shape is the promise; the prop survives only as the call site's label
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Icon name="check" size={18} color={signal[0]} strokeWidth={2.2} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.12)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 34, gap: 26 },
  // The ask is the coach speaking, at 30 — a question, and the only question this screen asks.
  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 35, color: color.textPrimary, textAlign: 'left' },

  rows: {},
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 14, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: HAIRLINE },
  rowLast: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  rowText: { flex: 1, fontFamily: font.sans, fontSize: 15, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
