/**
 * Paywall (Launch Roadmap: Subscription + Apple Payments).
 *
 * Surfaced two ways: as the free-trial GATE when the athlete tries to start a
 * session past the free limit (`source: 'gate'`), and from Profile → Membership
 * (`source: 'profile'`). Lets the athlete choose a plan (annual leads as the
 * better value), subscribe through StoreKit (behind the billing seam), or restore
 * a prior purchase. Dismissible — Apple requires a paywall be closeable; on the
 * gate path, closing simply returns Home where Start stays blocked.
 *
 * Prices come from the store (localized), never assembled here. Copy obeys the
 * voice laws (no hedge / exclamation / "Recommended").
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { Button, Legend, Badge } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { BILLING_EVENTS } from '@/platform/events';
import { billing, PRODUCT_IDS, type ProductId, type SubscriptionProduct } from '@/platform/billing';
import { color, space, font, textScale, tracking, trackingPx, radius, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Paywall'>;
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export function Paywall({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const source = route.params?.source ?? 'gate';

  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [selected, setSelected] = useState<ProductId>(PRODUCT_IDS.annual);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void track(BILLING_EVENTS.paywallViewed, { source });
    let active = true;
    void billing.getProducts().then((list) => {
      if (!active) return;
      setProducts(list);
      // Default to annual when present, else the first available product.
      if (list.length > 0 && !list.some((p) => p.id === PRODUCT_IDS.annual)) {
        setSelected(list[0].id);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [source]);

  // An entitlement that turned active (purchase / restore) means we are done here.
  useEffect(() => {
    if (app.entitlement.active) navigation.goBack();
  }, [app.entitlement.active, navigation]);

  function dismiss() {
    void track(BILLING_EVENTS.paywallDismissed, { source });
    navigation.goBack();
  }

  async function onSubscribe() {
    if (busy || products.length === 0) return;
    setBusy(true);
    setFailed(false);
    const result = await app.purchaseSubscription(selected);
    setBusy(false);
    if (result.status === 'failed') setFailed(true);
    // On success the entitlement effect above pops the screen; cancel is a no-op.
  }

  async function onRestore() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await app.restorePurchases();
    setBusy(false);
    if (!(result.status === 'restored' && result.entitlement.active)) setFailed(true);
  }

  const selectedProduct = products.find((p) => p.id === selected) ?? null;
  const selectedName = selectedProduct
    ? selectedProduct.period === 'annual'
      ? t('paywall.annual')
      : t('paywall.monthly')
    : '';

  return (
    <SafeAreaView style={styles.canvas} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={dismiss} hitSlop={HIT} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <HushMark size={30} />
        <Legend style={styles.eyebrow}>{t('paywall.eyebrow')}</Legend>
        <Text style={styles.title}>{t('paywall.title')}</Text>
        <Text style={styles.body}>{t('paywall.body')}</Text>

        <View style={styles.benefits}>
          <Benefit text={t('paywall.benefitProgram')} />
          <Benefit text={t('paywall.benefitAdapts')} />
          <Benefit text={t('paywall.benefitPortrait')} />
        </View>

        {loading ? (
          <ActivityIndicator color={color.accent} style={styles.loader} />
        ) : products.length === 0 ? (
          <Text style={styles.unavailable}>{t('paywall.unavailable')}</Text>
        ) : (
          <View style={styles.plans}>
            {products.map((p) => (
              <PlanCard
                key={p.id}
                product={p}
                selected={selected === p.id}
                isBest={p.period === 'annual'}
                perPeriod={p.period === 'annual' ? t('paywall.perYear') : t('paywall.perMonth')}
                subLabel={
                  p.introTrialLabel
                    ? t('paywall.freeTrial', { period: p.introTrialLabel })
                    : p.period === 'annual'
                      ? t('paywall.billedYearly')
                      : t('paywall.billedMonthly')
                }
                onSelect={() => setSelected(p.id)}
              />
            ))}
          </View>
        )}

        {!loading && products.length > 0 ? (
          <View style={styles.reassure}>
            <Icon name="check" size={14} color={color.accentText} strokeWidth={2.2} />
            <Text style={styles.reassureText}>{t('paywall.onlyBilled')}</Text>
          </View>
        ) : null}

        {failed ? <Text style={styles.error}>{t('paywall.error')}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          block
          label={busy ? t('paywall.working') : selectedProduct ? t('paywall.subscribePlan', { plan: selectedName }) : t('paywall.subscribe')}
          disabled={busy || loading || products.length === 0}
          onPress={onSubscribe}
        />
        <Button variant="quiet" block label={t('paywall.restore')} disabled={busy} onPress={onRestore} />
        <Text style={styles.legal}>
          {selectedProduct
            ? t('paywall.legalDynamic', {
                plan: selectedName,
                price: selectedProduct.priceLabel,
                cadence: selectedProduct.period === 'annual' ? t('paywall.perYear') : t('paywall.perMonth'),
              })
            : t('paywall.legal')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitCheck}>
        <Icon name="check" size={13} color={color.accentText} strokeWidth={2.1} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function PlanCard({
  product,
  selected,
  isBest,
  perPeriod,
  subLabel,
  onSelect,
}: {
  product: SubscriptionProduct;
  selected: boolean;
  isBest: boolean;
  perPeriod: string;
  subLabel: string | null;
  onSelect: () => void;
}) {
  const { t } = useCopy();
  const name = product.period === 'annual' ? t('paywall.annual') : t('paywall.monthly');
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} ${product.priceLabel}`}
      style={[styles.plan, selected && styles.planSelected]}
    >
      <View style={styles.planRadio}>
        <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
          {selected ? <View style={styles.radioInner} /> : null}
        </View>
      </View>
      <View style={styles.planText}>
        <View style={styles.planTopRow}>
          <Text style={styles.planName}>{name}</Text>
          {isBest ? <Badge tone="signal" legend>{t('paywall.bestValue')}</Badge> : null}
        </View>
        {subLabel ? <Text style={styles.planTrial}>{subLabel}</Text> : null}
      </View>
      <View style={styles.planPriceCol}>
        <Text style={styles.planPrice}>{product.priceLabel}</Text>
        <Text style={styles.planPeriod}>{perPeriod}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
  header: { paddingHorizontal: space.gutter, paddingTop: space[2], paddingBottom: space[1], alignItems: 'flex-end' },
  scroll: { paddingHorizontal: space.gutter, paddingBottom: space[6] },

  eyebrow: { marginTop: 14, marginBottom: 8 },
  title: {
    color: color.textPrimary,
    fontFamily: font.sansSemibold,
    fontSize: textScale['3xl'],
    lineHeight: Math.round(textScale['3xl'] * 1.04),
    letterSpacing: trackingPx(textScale['3xl'], tracking.display),
    marginBottom: space[3],
  },
  body: { color: color.textSecondary, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, marginBottom: space[5], maxWidth: 330 },

  benefits: { gap: 9, marginBottom: space[5] },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.fillSubtle, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  benefitText: { flex: 1, color: color.textSecondary, fontFamily: font.sans, fontSize: textScale.base, lineHeight: 21 },

  reassure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  reassureText: { flexShrink: 1, color: color.textMuted, fontFamily: font.sans, fontSize: textScale.sm, textAlign: 'center' },

  loader: { marginVertical: space[8] },
  unavailable: { color: color.textMuted, fontFamily: font.sans, fontSize: textScale.base, textAlign: 'center', marginVertical: space[8] },

  plans: { gap: space[3] },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  planSelected: { borderColor: signal[0], backgroundColor: signal.wash },
  planRadio: { width: 24, alignItems: 'center' },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: color.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: signal[0] },
  radioInner: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: signal[0] },
  planText: { flex: 1, minWidth: 0, gap: 2 },
  planTopRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  planName: { color: color.textPrimary, fontFamily: font.sansSemibold, fontSize: textScale.md },
  planTrial: { color: color.textMuted, fontFamily: font.sans, fontSize: textScale.sm },
  bestValue: { backgroundColor: signal[0], borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: 2 },
  bestValueText: {
    color: color.onAccent,
    fontFamily: font.monoSemibold,
    fontSize: textScale['2xs'],
    letterSpacing: trackingPx(textScale['2xs'], tracking.wide),
    textTransform: 'uppercase',
  },
  planPriceCol: { alignItems: 'flex-end' },
  planPrice: { color: color.textPrimary, fontFamily: font.monoSemibold, fontSize: textScale.lg },
  planPeriod: { color: color.textMuted, fontFamily: font.mono, fontSize: textScale.xs },

  error: { color: color.down, fontFamily: font.sans, fontSize: textScale.sm, textAlign: 'center', marginTop: space[5] },

  footer: { paddingHorizontal: space.gutter, paddingTop: space[3], gap: space[2] },
  legal: {
    color: color.textTertiary,
    fontFamily: font.sans,
    fontSize: textScale.xs,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: space[1],
  },
});
