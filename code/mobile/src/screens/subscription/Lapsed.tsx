/**
 * SUBSCRIPTION LAPSED · READ-ONLY (v7 10.2).
 *
 * "No lock-out. The history stays fully readable; only the live coaching is paused. The fact is
 * stated plainly, resubscribe is one tap — and the price never changes as a trick."
 *
 * ════ THE SHAPE IS THE ARGUMENT ════
 * Today's header stays exactly where it always is, and the day is still named. What changed is one
 * card in the middle saying the coaching is on hold — and beneath it, the things that are STILL
 * HERS, listed and openable. A product that greys the whole screen out is telling the athlete her
 * work belonged to the subscription. It never did.
 *
 * ════ THE PRICE IS THE PRICE ════
 * The resume button prints the SAME price she was paying, from the live store product — never a
 * discount to bait a return, and never a higher one to punish the gap. "Same price as before" is
 * printed under it because that is the promise, and a promise nobody can see is not one.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, textScale, press } from '@/design/tokens';

/** One thing the athlete can still open, with the fact that makes it worth opening. */
export interface KeptRow {
  key: string;
  title: string;
  detail: string;
  onOpen?: () => void;
}

export interface LapsedViewProps {
  /** Today's workout name — the day is still named; only the coaching is paused. */
  dayName: string | null;
  /** When the subscription ended, already formatted for the athlete's locale. */
  endedOn: string;
  /** The store's own price label for resuming, e.g. "$59.99/year". Null while the store is silent. */
  priceLabel: string | null;
  kept: KeptRow[];
  onResume: () => void;
}

export function LapsedView({ dayName, endedOn, priceLabel, kept, onResume }: LapsedViewProps) {
  const { t } = useCopy();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Today, still Today. The header does not change because the day did not. */}
      <View style={styles.head}>
        <Legend size={11} track={0.16}>{t('lapsed.todayLegend')}</Legend>
        <Text style={styles.day} accessibilityRole="header">{dayName ?? t('lapsed.noDay')}</Text>
      </View>

      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <View style={styles.lockRow}>
            <Icon name="lock" size={18} color={color.accent} strokeWidth={1.8} />
            <Legend size={11} track={0.12}>{t('lapsed.pausedLegend')}</Legend>
          </View>

          <Text style={styles.cardTitle}>{t('lapsed.title')}</Text>
          <Text style={styles.cardBody}>{t('lapsed.body', { date: endedOn })}</Text>

          <Button
            variant="signal"
            size="card"
            block
            label={priceLabel ? t('lapsed.resumeAt', { price: priceLabel }) : t('lapsed.resume')}
            onPress={onResume}
          />
          {/* The promise, printed where the price is. */}
          <Text style={styles.samePrice}>{t('lapsed.samePrice')}</Text>
        </View>
      </View>

      {/* STILL YOURS. Not a teaser — every row opens. */}
      <ScrollView style={styles.keptScroll} contentContainerStyle={styles.kept} showsVerticalScrollIndicator={false}>
        <Legend size={11} track={0.14} style={styles.keptLegend}>{t('lapsed.stillYours')}</Legend>
        {kept.map((row, i) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={`${row.title} — ${row.detail}`}
            onPress={row.onOpen}
            disabled={!row.onOpen}
            style={({ pressed }) => [
              styles.keptRow,
              i === kept.length - 1 && styles.keptRowLast,
              { opacity: pressed ? press.opacity : 1 },
            ]}
          >
            <View style={styles.keptText}>
              <Text style={styles.keptTitle} numberOfLines={1}>{row.title}</Text>
              <Text style={styles.keptDetail} numberOfLines={1}>{row.detail}</Text>
            </View>
            <Icon name="chevronRight" size={15} color={color.textMuted} strokeWidth={1.8} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.12)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  head: { paddingHorizontal: 30, paddingTop: 18, gap: 4 },
  day: { fontFamily: font.serif, fontSize: 26, color: color.textPrimary, textAlign: 'left' },

  cardWrap: { paddingHorizontal: 22, paddingTop: 16 },
  card: {
    backgroundColor: 'rgba(241,238,229,0.06)',
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 22,
    gap: 16,
  },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontFamily: font.serif, fontSize: 21, lineHeight: 27, color: color.textPrimary, textAlign: 'left' },
  cardBody: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: color.textSecondary, textAlign: 'left' },
  samePrice: { fontFamily: font.sans, fontSize: 15, color: color.textMuted, textAlign: 'center' },

  keptScroll: { flex: 1, marginTop: 20 },
  kept: { paddingHorizontal: 30, paddingBottom: 24 },
  keptLegend: { paddingBottom: 6 },
  // Read-only, never DIMMED to nothing: her work is fully hers, and 0.75 is the handoff's own
  // reading of "quieter than the act above, still plainly legible".
  keptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    opacity: 0.75,
  },
  keptRowLast: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  keptText: { flex: 1, minWidth: 0, gap: 1 },
  keptTitle: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  keptDetail: { fontFamily: font.sans, fontSize: 15, color: color.textSecondary, textAlign: 'left' },
});
