/**
 * PLAN, RECEIVED (v7 11.5) — "the other side of the link".
 *
 * "You adopt the shape; the engine seeds your weights from your own body and corrects from your
 * first set. Their numbers stay theirs."
 *
 * ════ THE MOSS CARD IS THE WHOLE SCREEN ════
 * Everything above it is a summary of what arrived. The card is the one thing the athlete actually
 * needs to know, and it is the reason the feature is safe to use: the plan she is adopting cannot
 * hand her someone else's weights, because no weight ever travelled (`domain/planShare` is an
 * allow-list, pinned by a test that reads the payload back as text). Her first working set is what
 * sets her loads — the same sentence the cold start has always made.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { planBandSummary, planLiftCount, type SharedPlan } from '@/domain/planShare';
import { bidi } from '@/i18n/bidi';
import { color, font, signal } from '@/design/tokens';

export interface PlanReceivedViewProps {
  plan: SharedPlan;
  /** The split's name as the sender called it, e.g. "Upper / Lower". */
  splitName: string;
  onAdopt: () => void;
  onDecline: () => void;
}

export function PlanReceivedView({ plan, splitName, onAdopt, onDecline }: PlanReceivedViewProps) {
  const { t } = useCopy();
  const from = plan.from?.trim();
  const initial = (from?.[0] ?? '·').toUpperCase();
  const bands = planBandSummary(plan);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        {/* Who sent it. The avatar is the only place a sender's name is ever rendered large. */}
        <View style={styles.sender}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.senderText}>
            <Text style={styles.senderLine} numberOfLines={1}>
              {from ? t('planReceived.sharedBy', { name: bidi(from) }) : t('planReceived.sharedAnon')}
            </Text>
            <Legend size={17} track={0.12}>{t('planReceived.withYou')}</Legend>
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {from ? t('planReceived.title', { name: bidi(from), split: splitName }) : t('planReceived.titleAnon', { split: splitName })}
        </Text>

        {/* What arrived, in three figures. */}
        <View style={styles.facts}>
          <Fact value={String(plan.days.length)} label={t('planReceived.days')} />
          <Fact value={String(planLiftCount(plan))} label={t('planReceived.lifts')} />
          {bands ? <Fact value={bands} label={t('planReceived.bands')} /> : null}
        </View>

        {/* THE PROMISE — the reason this is safe to accept. */}
        <View style={styles.assure}>
          <Icon name="shield" size={20} color={signal[0]} strokeWidth={1.9} />
          <View style={styles.assureText}>
            <Text style={styles.assureLead}>
              {from ? t('planReceived.yoursLead', { name: bidi(from) }) : t('planReceived.yoursLeadAnon')}
            </Text>
            <Text style={styles.assureSub}>{t('planReceived.yoursSub')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.foot}>
        <Button
          variant="signal"
          size="act"
          block
          label={t('planReceived.adopt')}
          leading={<Icon name="check" size={17} color={color.onAccent} strokeWidth={2.2} />}
          onPress={onAdopt}
        />
        <Button variant="quiet" block label={t('planReceived.decline')} onPress={onDecline} />
      </View>
    </SafeAreaView>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 20 },

  sender: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: signal[0], alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.serif, fontSize: 22, color: color.onAccent, textAlign: 'center' },
  senderText: { flex: 1, minWidth: 0, gap: 1 },
  senderLine: { fontFamily: font.serif, fontSize: 19, color: color.textPrimary, textAlign: 'left' },

  title: { fontFamily: font.serif, fontSize: 30, lineHeight: 34, color: color.textPrimary, textAlign: 'left' },

  facts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  fact: { gap: 2 },
  factValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: color.textPrimary, textAlign: 'left' },
  factLabel: { fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'left' },

  assure: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: color.accentWash,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.24)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  assureText: { flex: 1, gap: 4 },
  // The coach's serif — this is Hush speaking, not a legal notice.
  assureLead: { fontFamily: font.serif, fontSize: 17, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  assureSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 18, color: color.textSecondary, textAlign: 'left' },

  foot: { paddingHorizontal: 26, paddingBottom: 12, gap: 4 },
});
