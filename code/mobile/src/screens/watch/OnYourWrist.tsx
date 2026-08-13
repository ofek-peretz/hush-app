/**
 * ON YOUR WRIST (10.4) — the screen for someone who already owns the thing.
 *
 * Not in the v7 handoff. Agreed by the founder 2026-07-29 and designed IN-HOUSE, modelled on 1.3
 * Connect health: the same card-with-a-glyph, the same mono legend under it, the same law-in-words
 * helper line at the bottom.
 *
 * ════ IT IS A STATEMENT, NOT AN ASK ════
 *
 * 1.3 is a CHOICE, so its card is a switch and the whole screen turns on flipping it. This one has
 * no choice in it at all, and pretending otherwise would be the lie:
 *
 *   · There is no permission to grant. A watch app auto-installs with its companion.
 *   · There is nothing to pair. iOS paired the watch long before this app existed.
 *   · There is nothing to enable in here. The wrist works the moment it is raised.
 *
 * So the card is inert — a fact drawn at the size of a control, because the fact IS the offer —
 * and the one act on the page closes it. `install` is the single case where something remains to
 * be done, and even then it is done in Apple's own Watch app, not here, so the screen states the
 * step instead of drawing a button that cannot perform it.
 *
 * ════ EVERY LINE IS SOMETHING SHE RECEIVES ════
 *
 * The same law 8.2 was corrected under (founder 2026-07-28): a defence answers an objection she
 * has not raised. Three rows, each a thing the wrist DOES — the set, the rest tap, the workout
 * with the phone in the bag — and all three are read off surfaces that exist (`WatchScreens.swift`,
 * `watchHaptics`, `watchPlan`'s standalone snapshot). The helper line is the only sentence that
 * limits rather than offers, and it is there because it is the product's spine: the phone decides
 * every load, and a second opinion on the wrist would be a second engine.
 *
 * ════ WHO THIS IS FOR (founder 2026-07-29, second pass) ════
 *
 * NOT the athlete who already owned a watch — she is told at 1.3 during onboarding, before her
 * first workout, which is the whole point of the second pass. This screen is what remains once 1.3
 * has done its half: **the athlete who acquired a watch since**, and the athlete whose WCSession had
 * not activated in time for 1.3 to say anything. It fires the first open where the answer arrives.
 *
 * WHEN is not this screen's business — `platform/watch/watchPresence` owns the split, holds the one
 * flag both surfaces share, and never lets either speak to a phone with no watch paired to it.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, radius, signal } from '@/design/tokens';
import type { WristOffer } from '@/platform/watch/watchPresence';

export interface OnYourWristViewProps {
  /** `confirm` — it is already on the wrist. `install` — auto-install is off on this iPhone. */
  offer: WristOffer;
  /** The one act: the screen is done, and it never returns. */
  onDone: () => void;
}

export function OnYourWristView({ offer, onDone }: OnYourWristViewProps) {
  const { t } = useCopy();
  const install = offer === 'install';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* The onboarding scaffold's safety net (`components/onboarding/OnboardingScaffold`), for
          the same reason and with the same law attached. This page carries more than 8.2 does — a
          card, three rows AND a helper line — and it measures 774pt on the 393-wide reference
          frame: comfortable inside an 844pt phone, taller than an iPhone SE's 667. A plain View
          would push the one button off the bottom with no way to reach it. `flexGrow: 1` does not
          scroll while the content fits and yields rather than clips when it does not.

          It is a NET, NOT A LICENCE: a screen that actually scrolls on the reference frame is
          still a bug on that screen. */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Legend size={17} track={0.16}>{t('onWrist.legend')}</Legend>

        <Text style={styles.title} accessibilityRole="header">
          {install ? t('onWrist.titleInstall') : t('onWrist.title')}
        </Text>
        <Text style={styles.sub}>{install ? t('onWrist.subInstall') : t('onWrist.sub')}</Text>

        {/* The card 1.3 built, with the switch taken out of it — there is nothing here to flip.
            It carries moss only when the watch already has the app: moss is "a decision made",
            and on the install face no decision has been made yet. */}
        <View style={[styles.card, !install && styles.cardOn]}>
          <View style={styles.iconBox}>
            <Icon name="watch" size={23} color={install ? color.textSecondary : color.accent} strokeWidth={1.8} />
          </View>
          <View style={styles.info}>
            <Text style={styles.cardTitle}>{t('onWrist.cardTitle')}</Text>
            <Legend size={17} track={0} weight="regular" tone="onStage" style={styles.cardSub}>
              {t('onWrist.cardLegend')}
            </Legend>
          </View>
        </View>

        <View style={styles.rows}>
          <Row text={t('onWrist.willSet')} />
          <Row text={t('onWrist.willRest')} />
          <Row text={t('onWrist.willStandalone')} last />
        </View>

        <Text style={styles.helper}>{t('onWrist.helper')}</Text>
      </ScrollView>

      <View style={styles.foot}>
        <Button variant="primary" size="lg" block label={t('onWrist.done')} onPress={onDone} />
      </View>
    </SafeAreaView>
  );
}

/** One thing the wrist does. Same row 8.2 uses, for the same reason: a tick is a promise kept. */
function Row({ text, last }: { text: string; last?: boolean }) {
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
  flex: { flex: 1 },
  // flexGrow (not flex) — the content keeps its natural height and only fills the frame when it
  // is smaller than it, which is what lets the page centre AND yield on a short device.
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 20, gap: 18 },
  // 30 in the coach's serif — the same height 8.2's one question stands at.
  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 35, color: color.textPrimary, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },

  // 1.3's card, one-to-one, minus the control.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    marginTop: 6,
  },
  cardOn: { borderColor: color.up, backgroundColor: color.upWash },
  iconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: color.fillSubtleStrong, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  cardSub: { color: color.textSecondary, marginTop: 3 },

  rows: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 13, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: HAIRLINE },
  rowLast: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  rowText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },

  // The law in words, at the bottom — 1.3's helper line, doing 1.3's job.
  helper: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12 },
});
