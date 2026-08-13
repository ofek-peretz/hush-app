/**
 * SHARE YOUR PLAN (v7 11.4) — "send someone the shape of your week".
 *
 * "The split, the lifts, the rep bands. Your weights and your body data never travel with it."
 *
 * The card in the middle IS the payload, rendered. That is deliberate: the athlete can read exactly
 * what she is about to send before she sends it, and there is nothing on the screen she cannot see
 * in the preview. The privacy line at the foot of the card is not a disclaimer — it is the one fact
 * that makes the gesture safe, so it sits inside the thing it describes.
 *
 * `domain/planShare` builds the payload as an ALLOW-LIST, and a test reads the encoded token back
 * as text to prove no load ever appears in it.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { planLiftCount, type SharedPlan } from '@/domain/planShare';
import { color, font, radius, signal, stage, press } from '@/design/tokens';

export interface SharePlanViewProps {
  plan: SharedPlan;
  /** The split's own name, e.g. "Upper / Lower". */
  splitName: string;
  onSend: () => void;
  /** Opens the poster preview (§9). Absent → the second act does not draw. */
  onPreview?: () => void;
  /** Back to Today. Absent → the control does not draw (the gallery mounts it with no navigator). */
  onBack?: () => void;
}

export function SharePlanView({ plan, splitName, onSend, onPreview, onBack }: SharePlanViewProps) {
  const { t } = useCopy();
  // Hoisted out of the row: the mono law scans a mono-styled <Text> for any `t()` inside it, and
  // the word beside the count is sans anyway — resolving it here keeps both facts obvious.
  const liftsWord = t('planShare.liftsWord');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* ════ THE WAY BACK IS NAMED (founder A.4) ════
          "No way back to Today — no back control." The route is pushed with `headerShown: false`,
          so the only exit was the edge swipe — a gesture that exists and that nothing on the glass
          admits to. And a bare chevron would only have said "back", which on a screen opened from
          a door on Today is a guess. It says the DESTINATION, in the word the tab bar itself uses
          (`nav.today`), so the control and the place it lands agree. */}
      {onBack ? (
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nav.today')}
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Icon name="chevronLeft" size={20} color={color.textSecondary} strokeWidth={1.9} />
            <Text style={styles.backText}>{t('nav.today')}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.eyebrow}>
          <View style={styles.dot} />
          <Legend size={17} track={0.2} tone="accent">{t('planShare.legend')}</Legend>
        </View>

        <Text style={styles.title} accessibilityRole="header">{t('planShare.title')}</Text>

        {/* ════ THE PAYLOAD, RENDERED — AND DRESSED AS THE POSTER IT IS (founder A.4) ════
            "Restyle it in the manner of the personal-record share card."

            It was a flat 5%-cream wash inside a hairline — a form field, not a thing anyone would
            be pleased to send. The record card (`components/share/ShareCard`) is the manner: the
            lit stage GRADIENT poured into a frame, the wordmark carried whole at its head, and the
            moss spent on one small mark rather than on a filled tag. This is the same object — a
            card another person is about to look at — so it is built the same way. */}
        <View style={styles.card}>
          {/* The WRAPPER positions and the percentages fill it — one answer to "how big is this".
              `<Svg style={absoluteFill} width="100%">` gives the element two, and on the first
              native frame they disagree; that is the offset gradient the founder photographed on
              the first-four card (C.4). `svgBackgroundsAreSizedOneWay` caught this one before it
              ever reached a device, which is exactly what that law is for. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="planShareBg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stage.gradient[0]} />
                  <Stop offset="0.42" stopColor={stage.gradient[1]} />
                  <Stop offset="1" stopColor={stage.gradient[2]} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#planShareBg)" />
            </Svg>
          </View>

          {/* the brand, carried whole — exactly as the record poster carries it */}
          <View style={styles.brand}>
            <Text style={styles.wordmark}>hush</Text>
            <View style={styles.brandDot} />
          </View>

          <View style={styles.cardHead}>
            <Text style={styles.splitName} numberOfLines={1}>{splitName}</Text>
            <View style={styles.daysTag}>
              <Text style={styles.daysTagText}>{t('planShare.daysTag', { count: plan.days.length })}</Text>
            </View>
          </View>

          <View>
            {plan.days.map((d) => (
              <View key={d.name} style={styles.dayRow}>
                <View style={styles.dayText}>
                  <Text style={styles.dayName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.dayMuscles} numberOfLines={1}>{d.muscleGroups.join(' · ')}</Text>
                </View>
                {/* The COUNT is mono; the word beside it is sans — mono draws no Hebrew (the law). */}
                <Text style={styles.dayLifts}>
                  {d.exerciseIds.length}
                  <Text style={styles.dayLiftsWord}> {liftsWord}</Text>
                </Text>
              </View>
            ))}
          </View>

          {/* The promise, inside the thing it is about. */}
          <View style={styles.privacy}>
            <Icon name="eyeOff" size={15} color={color.textMuted} strokeWidth={2} />
            <Text style={styles.privacyText}>
              <Text style={styles.privacyLead}>{t('planShare.structureOnly')}</Text>
              <Text style={styles.privacyTail}>{t('planShare.structureTail')}</Text>
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.foot}>
        <Button
          variant="primary"
          size="act"
          block
          label={t('planShare.send')}
          leading={<Icon name="share" size={17} color={color.onAccent} strokeWidth={1.9} />}
          onPress={onSend}
        />
        {onPreview ? <Button variant="quiet" block label={t('planShare.preview')} onPress={onPreview} /> : null}
      </View>
    </SafeAreaView>
  );
}

/** The lift total, for a caller that wants it beside the title. */
export const sharePlanLiftCount = planLiftCount;

const HAIRLINE = 'rgba(241,238,229,0.1)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  // A.4 — the way back, named. A row of its own so the body below keeps its centred composition.
  head: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 },
  backText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textSecondary, textAlign: 'left' },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 16, gap: 22 },

  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: signal[0] },

  title: { fontFamily: font.serif, fontSize: 31, lineHeight: 35, color: color.textPrimary, textAlign: 'left' },

  // The poster's frame — the gradient rides an absolute SVG behind it (see the render).
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
    borderRadius: 24,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  // the brand, at the head of the card — the record poster's own arrangement
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, direction: 'ltr' },
  wordmark: { fontFamily: font.serif, fontSize: 18, color: stage.ink0, textAlign: 'left' },
  brandDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 5, backgroundColor: signal[0] },

  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // The split is the card's SUBJECT, so it is set in the coach's serif — the record poster names
  // its lift the same way. It was a 17 pt sans label, which is how a form names a field.
  splitName: { flexShrink: 1, fontFamily: font.serif, fontSize: 25, lineHeight: 29, color: stage.ink0, textAlign: 'left' },
  // A quiet moss pill, not a filled one: on the record poster the moss is spent on a single small
  // mark, and a solid tag here was the loudest thing on a card that is mostly a list.
  daysTag: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: 'rgba(169,196,159,0.16)', borderWidth: 1, borderColor: 'rgba(169,196,159,0.4)' },
  daysTagText: { fontFamily: font.sansSemibold, fontSize: 17, letterSpacing: 0.8, textTransform: 'uppercase', color: signal[0], textAlign: 'left' },

  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: HAIRLINE },
  dayText: { flex: 1, minWidth: 0, gap: 1 },
  dayName: { fontFamily: font.sansSemibold, fontSize: 17, color: stage.ink0, textAlign: 'left' },
  dayMuscles: { fontFamily: font.sans, fontSize: 17, color: stage.ink2, textAlign: 'left' },
  // A lift COUNT is a measured quantity — mono, like every other figure.
  dayLifts: { flexShrink: 0, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: stage.ink1, textAlign: 'right' },
  dayLiftsWord: { fontFamily: font.sansMedium }, // rtl-ok: nested span inside dayLifts, which sets textAlign

  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.14)', paddingTop: 12 },
  privacyText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 19, color: stage.ink1, textAlign: 'left' },
  privacyLead: { fontFamily: font.sansSemibold, color: stage.ink0 }, // rtl-ok: nested span inside privacyText, which sets textAlign
  privacyTail: { color: stage.ink1 }, // rtl-ok: nested span inside privacyText, which sets textAlign

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
