/**
 * PAYWALL (v7 4.3) — "the trial closes like a milestone".
 *
 * Rebuilt on the stage: the fourteenth session is named as a fact, three quiet promises replace the
 * pitch, and the annual plan is a PAPER card that pops off the dark — the one object on the page you
 * want to pick up. The monthly plan stands beside it in the dark, equally choosable and quieter.
 *
 * Surfaced two ways: as the free-trial GATE when the athlete tries to start a session past the free
 * limit (`source: 'gate'`), and from Profile → Membership (`source: 'profile'`). Dismissible — Apple
 * requires a paywall be closeable; on the gate path, closing simply returns Home where Start stays
 * blocked, which is why "Maybe later" says so in words rather than being only an X in a corner.
 *
 * Prices come from the store (localized), never assembled here. The annual card's per-month figure
 * is the store's own label with its numeral divided (domain/pricing) — the two plans are only
 * comparable in the same unit, and it is absent rather than guessed when the label will not parse.
 *
 * Copy obeys the voice laws (no hedge / exclamation / "Recommended").
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { BILLING_EVENTS } from '@/platform/events';
import { billing, PRODUCT_IDS, type ProductId, type SubscriptionProduct } from '@/platform/billing';
import { annualSavingPct, monthlyEquivalentLabel } from '@/domain/pricing';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { color, space, font, textScale, tracking, trackingPx, radius, signal, paper, ink } from '@/design/tokens';
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
    try {
      const result = await app.purchaseSubscription(selected);
      if (result.status === 'failed') setFailed(true);
      // On success the entitlement effect above pops the screen; cancel is a no-op.
    } catch {
      setFailed(true);
    } finally {
      // ALWAYS: a throw from StoreKit used to leave `busy` true, disabling the Subscribe button
      // for good — on the one screen whose entire job is to take money.
      setBusy(false);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await app.restorePurchases();
      if (!(result.status === 'restored' && result.entitlement.active)) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const selectedProduct = products.find((p) => p.id === selected) ?? null;
  const selectedName = selectedProduct
    ? selectedProduct.period === 'annual'
      ? t('paywall.annual')
      : t('paywall.monthly')
    : '';

  return (
    <SafeAreaView style={styles.canvas} edges={['top', 'bottom']}>
      {/* the way out — Apple requires it, and it is a circle on the stage, not a bare glyph */}
      <View style={styles.header}>
        <Pressable
          onPress={dismiss}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        >
          <Icon name="close" size={15} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* THE TRIAL CLOSES LIKE A MILESTONE — the mark, the fact, the sentence. */}
        <RangeMark width={44} height={18} tone={signal[0]} />
        <Legend tone="accent" track={0.16} style={styles.eyebrow}>
          {t('paywall.trialDone', { n: FREE_SESSION_LIMIT })}
        </Legend>
        <Text style={styles.title} accessibilityRole="header">{t('paywall.title')}</Text>

        {/* THREE QUIET PROMISES, not a pitch. Hairline-ruled, so they read as a list of facts. */}
        <View style={styles.promises}>
          <Promise text={t('paywall.benefitProgram')} />
          <Promise text={t('paywall.benefitAdapts')} />
          <Promise text={t('paywall.benefitPortrait')} />
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
                // The annual saving, as a NUMBER (founder 2026-07-12). "Best value" is a claim the
                // athlete has to verify by doing arithmetic on two prices in different units;
                // "Save 30%" is the arithmetic, done. Computed from the live store prices — never a
                // hardcoded figure that could quietly go wrong when pricing changes, and absent
                // entirely when the two plans don't give us the maths.
                savingPct={p.period === 'annual' ? annualSavingPct(products) : null}
                onSelect={() => setSelected(p.id)}
              />
            ))}
          </View>
        )}

        {failed ? <Text style={styles.error}>{t('paywall.error')}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {/* MOSS, not cream: the annual card above is already paper, and a cream act under a cream
            card is two slabs of the same thing. The handoff draws it in the signal. */}
        <Button
          variant="signal"
          size="act"
          block
          label={busy ? t('paywall.working') : t('paywall.keepTraining')}
          disabled={busy || loading || products.length === 0}
          onPress={onSubscribe}
        />
        <View style={styles.quietRow}>
          <Pressable onPress={onRestore} disabled={busy} hitSlop={HIT} accessibilityRole="button">
            <Text style={styles.quiet}>{t('paywall.restore')}</Text>
          </Pressable>
          {/* The gate is closeable in WORDS as well as by the X — Apple asks for a way out, and a
              way out nobody can find is not one. */}
          <Pressable onPress={dismiss} hitSlop={HIT} accessibilityRole="button">
            <Text style={styles.quiet}>{t('paywall.later')}</Text>
          </Pressable>
        </View>
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

/** One promise: a moss check, a fact, and the hairline that separates it from the next. */
function Promise({ text }: { text: string }) {
  return (
    <View style={styles.promise}>
      <Icon name="check" size={15} color={signal[0]} strokeWidth={2.4} />
      <Text style={styles.promiseText}>{text}</Text>
    </View>
  );
}

/**
 * ONE PLAN.
 *
 * The annual is cut from PAPER — the one object on a dark page you want to pick up — and states its
 * price per MONTH so the two plans stand in the same unit, with the year's real total beneath it.
 * The monthly stands in the dark beside it: quieter, never lesser, and one tap away.
 */
function PlanCard({
  product,
  selected,
  savingPct,
  onSelect,
}: {
  product: SubscriptionProduct;
  selected: boolean;
  savingPct: number | null;
  onSelect: () => void;
}) {
  const { t } = useCopy();
  const annual = product.period === 'annual';
  const name = annual ? t('paywall.annual') : t('paywall.monthly');

  // The annual card leads with its per-month equivalent; if the label will not divide honestly it
  // leads with the price the store gave us instead, and the cadence says which unit that is.
  const perMonth = annual ? monthlyEquivalentLabel(product.priceLabel) : null;
  const figure = perMonth ?? product.priceLabel;
  const cadence = perMonth || !annual ? t('paywall.perMonthShort') : t('paywall.perYearShort');
  const sub = product.introTrialLabel
    ? t('paywall.freeTrial', { period: product.introTrialLabel })
    : annual
      ? t('paywall.billedOnce', { price: product.priceLabel })
      : t('paywall.billedMonthly');

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} ${figure}`}
      style={({ pressed }) => [
        styles.plan,
        annual ? styles.planPaper : styles.planStage,
        selected && !annual && styles.planStageOn,
        pressed && styles.planPressed,
      ]}
    >
      {savingPct != null ? (
        <View style={styles.saveTag}>
          <Text style={styles.saveTagText}>{t('paywall.savePct', { pct: savingPct })}</Text>
        </View>
      ) : null}

      <View style={styles.planLeft}>
        <View style={[styles.radio, annual ? styles.radioPaper : styles.radioStage]}>
          {selected ? <View style={[styles.radioDot, annual ? styles.radioDotPaper : styles.radioDotStage]} /> : null}
        </View>
        <View style={styles.planText}>
          <Text style={[styles.planName, annual && styles.onPaper]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.planSub, annual && styles.onPaperMuted]} numberOfLines={1}>{sub}</Text>
        </View>
      </View>

      <View style={styles.planPriceCol}>
        <Text style={[styles.planPrice, annual && styles.onPaper]} numberOfLines={1}>{figure}</Text>
        <Text style={[styles.cadence, annual && styles.onPaperMuted]} numberOfLines={1}>{cadence}</Text>
      </View>
    </Pressable>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.12)';

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: 26, paddingTop: space[2], paddingBottom: space[1], alignItems: 'flex-end' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(241,238,229,0.08)', alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: color.fillSubtleStrong },
  scroll: { paddingHorizontal: 30, paddingTop: 8, paddingBottom: space[5] },

  eyebrow: { marginTop: 14, marginBottom: 12 },
  // v7 4.3: the close of the trial is the coach speaking — the serif at 36, not UI chrome.
  title: {
    color: color.textPrimary,
    fontFamily: font.serif,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: trackingPx(36, tracking.display),
    textAlign: 'left',
  },

  promises: { marginTop: 16 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: HAIRLINE },
  promiseText: { flex: 1, color: color.textPrimary, fontFamily: font.sans, fontSize: textScale.base, lineHeight: 21, textAlign: 'left' },

  loader: { marginVertical: space[8] },
  unavailable: { color: color.textMuted, fontFamily: font.sans, fontSize: textScale.base, textAlign: 'center', marginVertical: space[8] },

  plans: { gap: 20, marginTop: 30 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 22,
  },
  // THE ANNUAL IS PAPER — the one object on the dark page, and it carries the product's one shadow
  // outside the training stage, because a card you are meant to pick up has to stand off the page.
  planPaper: {
    backgroundColor: paper[0],
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  planStage: { backgroundColor: 'rgba(241,238,229,0.06)', borderWidth: 1, borderColor: 'rgba(241,238,229,0.16)' },
  // Paper is already the loudest thing here, so only the DARK card needs a chosen state to show.
  planStageOn: { borderColor: color.textPrimary },
  planPressed: { opacity: 0.9 },

  planLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, minWidth: 0 },
  planText: { flex: 1, minWidth: 0, gap: 2 },
  planName: { color: color.textPrimary, fontFamily: font.sansSemibold, fontSize: textScale.md, textAlign: 'left' },
  planSub: { color: color.textSecondary, fontFamily: font.sans, fontSize: 15, textAlign: 'left' },
  planPriceCol: { flexShrink: 0, alignItems: 'flex-end' },
  planPrice: { color: color.textSecondary, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 26, textAlign: 'right' },
  cadence: { color: color.textMuted, fontFamily: font.mono, fontSize: 14.5, letterSpacing: trackingPx(11, tracking.tight), textAlign: 'right' },
  // Dark ink, for everything sitting on the paper card.
  onPaper: { color: ink[0] }, // rtl-ok: merged onto a base that sets textAlign
  onPaperMuted: { color: color.onPaperMuted }, // rtl-ok: merged onto a base that sets textAlign

  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioPaper: { borderColor: signal[1] },
  radioStage: { borderColor: 'rgba(241,238,229,0.35)' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  radioDotPaper: { backgroundColor: signal[1] },
  radioDotStage: { backgroundColor: color.textPrimary },

  // The saving tag straddles the paper card's top edge — the one figure allowed to be loud, struck
  // in deep moss on the paper it sits on.
  saveTag: {
    position: 'absolute',
    top: -12,
    start: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: signal[1],
  },
  saveTagText: {
    // Cream ink, asked for BY NAME — the tag's ground is deep moss, so this is the same cream that
    // carries every other word on a dark surface, not "whatever the paper ladder's first rung is".
    color: color.textPrimary,
    fontFamily: font.sansSemibold,
    fontSize: 14,
    letterSpacing: trackingPx(10.5, tracking.wide),
    textTransform: 'uppercase',
    textAlign: 'left',
  },

  error: { color: color.alert, fontFamily: font.sans, fontSize: textScale.sm, textAlign: 'center', marginTop: space[5] },

  footer: { paddingHorizontal: 26, paddingTop: space[3], gap: 12 },
  quietRow: { flexDirection: 'row', justifyContent: 'center', gap: 26 },
  quiet: { color: color.textSecondary, fontFamily: font.sansMedium, fontSize: 13.5, textAlign: 'center' },
  legal: {
    color: color.textMuted,
    fontFamily: font.sans,
    fontSize: 14.5,
    lineHeight: 16,
    textAlign: 'center',
  },
});
