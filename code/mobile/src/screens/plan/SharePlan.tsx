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
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { planLiftCount, type SharedPlan } from '@/domain/planShare';
import { color, font, radius, signal } from '@/design/tokens';

export interface SharePlanViewProps {
  plan: SharedPlan;
  /** The split's own name, e.g. "Upper / Lower". */
  splitName: string;
  onSend: () => void;
  /** Opens the poster preview (§9). Absent → the second act does not draw. */
  onPreview?: () => void;
}

export function SharePlanView({ plan, splitName, onSend, onPreview }: SharePlanViewProps) {
  const { t } = useCopy();
  // Hoisted out of the row: the mono law scans a mono-styled <Text> for any `t()` inside it, and
  // the word beside the count is sans anyway — resolving it here keeps both facts obvious.
  const liftsWord = t('planShare.liftsWord');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.eyebrow}>
          <View style={styles.dot} />
          <Legend size={11} track={0.2} tone="accent">{t('planShare.legend')}</Legend>
        </View>

        <Text style={styles.title} accessibilityRole="header">{t('planShare.title')}</Text>

        {/* THE PAYLOAD, RENDERED — what she is about to send, and nothing she cannot see here. */}
        <View style={styles.card}>
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
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24, gap: 22 },

  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: signal[0] },

  title: { fontFamily: font.serif, fontSize: 31, lineHeight: 35, color: color.textPrimary, textAlign: 'left' },

  card: {
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 13,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  splitName: { flexShrink: 1, fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  daysTag: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: signal[0] },
  daysTagText: { fontFamily: font.sansSemibold, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', color: color.onAccent, textAlign: 'left' },

  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: HAIRLINE },
  dayText: { flex: 1, minWidth: 0, gap: 1 },
  dayName: { fontFamily: font.sansSemibold, fontSize: 14, color: color.textPrimary, textAlign: 'left' },
  dayMuscles: { fontFamily: font.sans, fontSize: 14.5, color: color.textMuted, textAlign: 'left' },
  // A lift COUNT is a measured quantity — mono, like every other figure.
  dayLifts: { flexShrink: 0, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 14.5, color: color.textSecondary, textAlign: 'right' },
  dayLiftsWord: { fontFamily: font.sansMedium }, // rtl-ok: nested span inside dayLifts, which sets textAlign

  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 12 },
  privacyText: { flex: 1, fontFamily: font.sans, fontSize: 15, lineHeight: 18, color: color.textSecondary, textAlign: 'left' },
  privacyLead: { fontFamily: font.sansSemibold, color: color.textPrimary }, // rtl-ok: nested span inside privacyText, which sets textAlign
  privacyTail: { color: color.textSecondary }, // rtl-ok: nested span inside privacyText, which sets textAlign

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
