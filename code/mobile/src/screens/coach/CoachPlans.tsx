/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH PLANS — what a seat costs, and what the coach's trainees get for it. (the coach track)
 *
 * ⛔ RULING 1 (founder, 2026-09-17): *the coach pays.* Free up to two linked trainees, then one of
 * three monthly tiers. This is the only screen in the product that sells anything to anyone other
 * than the athlete, and it is built on the SAME argument-shaped order the Paywall uses, because the
 * order IS the argument:
 *
 *   0 · where he actually is        — his own seats, as the roster prints them
 *   1 · what he is buying           — the sentence that sells it: his trainees get Pro, free
 *   2 · what a seat IS              — one quiet line, so the figure below it means something
 *   3 · only then, the prices
 *
 * ── ⛔ NEVER A DEAD BUTTON AND NEVER A FAKE PRICE ────────────────────────────────────────────────
 * The three products do not exist in App Store Connect yet (a founder op — `platform/billing/
 * products.ts`), so `billing.getCoachPlans()` answers `[]` everywhere, including the stub. When it
 * does, this screen says so in one sentence and names the three SIZES — a seat count is ours to
 * state, a price is Apple's — and draws no purchase control at all. Every price printed here is the
 * store's own localized label, exactly as on the Paywall.
 *
 * ── ⛔ THE CLIENT NEVER RAISES ITS OWN SEAT LIMIT ────────────────────────────────────────────────
 * A purchase is followed by `coachClaimPlan` (the wire) and then `refreshMe` — the worker is the
 * only thing that may move `coaches.seat_limit`, and the number this screen prints afterwards is
 * the number the worker answered with. If the claim does not land, the screen says the purchase
 * stands and the seats have not opened yet, and offers to ask again. See the TODO on the wire.
 *
 * ── WHO ARRIVES HERE ─────────────────────────────────────────────────────────────────────────────
 *   · the roster, with every seat taken (`Athletes` → the full sheet's door)
 *   · You → coach account → this
 *   · the athlete Paywall's one quiet line at the foot ("a coach?") — so a reader who is NOT a coach
 *     lands here too, and for him the act is not a purchase, it is `CoachEnroll`. Seats belong to a
 *     coach row; there is nothing to buy before there is one.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainParamList } from '@/app/navigation';
import { Arrive, Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { alert, color, font, radius, tracking, trackingPx } from '@/design/tokens';
import { track } from '@/platform/telemetry';
import {
  billing,
  COACH_FREE_SEATS,
  COACH_PRODUCT_ORDER,
  type CoachPlanProduct,
  type CoachProductId,
} from '@/platform/billing';
import { coachClaimPlan, type CoachPlanState } from '@/platform/coachTrackClient';
import { CoachTrackContext } from '@/state/stores/coachStore';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

/** What went wrong, in the one word the screen has a sentence for. */
export type CoachPlansFault = 'purchase' | 'pending' | 'claim';

/* ─────────────────────────────────────────────────────────────── one tier */

/**
 * ONE TIER — the card the coach has already used four times (the onboarding sex control, the
 * Paywall's two plans, Profile's units and language): equal fields, a hairline that LIGHTS to cream
 * on the answer, a wash on press, never a fade. The seat count leads because it is what he is
 * choosing between; the price follows on the end edge, where the three form a column.
 */
function TierCard({
  product,
  selected,
  current,
  onSelect,
}: {
  product: CoachPlanProduct;
  selected: boolean;
  /** This is the tier he is already on — stated, and never sold to him again. */
  current: boolean;
  onSelect: () => void;
}) {
  const { t } = useCopy();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: current }}
      accessibilityLabel={`${t('coachTrack.coach.plans.tierName', { seats: product.seats })} ${product.priceLabel}`}
      style={({ pressed }) => [styles.tier, selected && styles.tierOn, pressed && styles.tierPressed]}
    >
      <View style={styles.tierText}>
        <Text style={[styles.tierName, selected && styles.onChosen]} numberOfLines={1}>
          {t('coachTrack.coach.plans.tierName', { seats: product.seats })}
        </Text>
        <Text style={styles.tierSub} numberOfLines={2}>
          {current ? t('coachTrack.coach.plans.tierCurrent') : t('coachTrack.coach.plans.tierSub', { seats: product.seats })}
        </Text>
      </View>
      <View style={styles.tierPriceCol}>
        {/* A localized price may be long; it shrinks rather than truncates — a price with a missing
            digit is the one thing this card cannot do (the Paywall's own rule). */}
        <Text
          style={[styles.tierPrice, selected && styles.onChosen]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {product.priceLabel}
        </Text>
        <Text style={styles.cadence} numberOfLines={1}>{t('coachTrack.coach.plans.perMonth')}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────────────────── the pure view */

export interface CoachPlansViewProps {
  /** Null while the store read is out. `[]` = the products are not configured (today). */
  plans: CoachPlanProduct[] | null;
  /** His seats as the WORKER last answered. Null when he has no coach account yet. */
  seats: { used: number; seats: number } | null;
  /**
   * ⛔ WHY THE SEATS ARE THAT NUMBER (`/coach/me` → `plan`, 2026-09-18). Null = he never bought a
   * tier. The two states this screen has to SAY:
   *
   *   · `over_limit` — the plan lapsed (or he downgraded) with more athletes linked than seats. He
   *     keeps every one of them and every week he wrote; only a new invite is closed. It is said
   *     first, above the argument, because it is the reason he is on this screen.
   *   · `grace` — Apple is still collecting. The seats STAY, and a coach who is told nothing here
   *     reads the retry as a cancellation.
   */
  plan: CoachPlanState | null;
  /** The tier already active on this Apple ID, when there is one. */
  activeId: CoachProductId | null;
  selected: CoachProductId | null;
  onSelect: (id: CoachProductId) => void;
  busy: boolean;
  fault?: CoachPlansFault | null;
  /** Not a coach yet — the act enrols instead of buying. */
  needsAccount: boolean;
  onAct: () => void;
  onRetryClaim: () => void;
  onBack: () => void;
}

export function CoachPlansView(p: CoachPlansViewProps) {
  const { t } = useCopy();
  const unavailable = !!p.plans && p.plans.length === 0;
  const over = p.plan?.state === 'over_limit';
  const chosen = p.plans?.find((x) => x.id === p.selected) ?? null;
  const actDisabled = p.busy || (!p.needsAccount && (!chosen || chosen.id === p.activeId));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={p.onBack}
          hitSlop={HIT}
          style={styles.back}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.wrap, unavailable && !over && styles.wrapCentred]} showsVerticalScrollIndicator={false}>
        {/* 0 · where he is. His own number, in the instrument face the roster prints it in. */}
        <Arrive order={0}>
          {/* ⚠️ MOSS IS THE WRONG TONE FOR `22 / 10` (2026-09-18). The accent is the product's YES;
              over the limit the same figure is the problem he came here about, and it reads clay —
              the same colour the roster's own seats figure goes when it is spent. */}
          <Legend tone={over ? 'muted' : 'accent'} track={tracking.legend} style={over ? [styles.eyebrow, styles.eyebrowOver] : styles.eyebrow}>
            {p.seats
              ? t('coachTrack.coach.plans.eyebrowSeats', { used: p.seats.used, seats: p.seats.seats })
              : t('coachTrack.coach.plans.eyebrow')}
          </Legend>
        </Arrive>

        {/* 0b · and, when it is true, why he is here at all. Before the pitch: a coach whose plan
               lapsed is not shopping, he is asking what happened to his roster. */}
        {over && p.seats ? (
          <Arrive order={0} style={styles.overCard}>
            <Text style={styles.notYetTitle}>{t('coachTrack.coach.plans.overTitle')}</Text>
            <Text style={styles.notYetLine}>
              {t('coachTrack.coach.plans.overBody', { used: p.seats.used, seats: p.seats.seats })}
            </Text>
          </Arrive>
        ) : null}
        {p.plan?.state === 'grace' ? (
          <Arrive order={0}>
            <Text style={styles.graceLine}>{t('coachTrack.coach.plans.graceLine')}</Text>
          </Arrive>
        ) : null}

        {/* 1 · what he is buying — the one sentence that sells it, in the coach's serif. */}
        <Arrive order={1}>
          <Text style={styles.title} accessibilityRole="header">{t('coachTrack.coach.plans.title')}</Text>
          <Text style={styles.case}>{t('coachTrack.coach.plans.proForThem')}</Text>
          {/* 2 · what a seat IS, so the figures below it mean something. */}
          <Text style={styles.seatLine}>{t('coachTrack.coach.plans.whatIsASeat')}</Text>
        </Arrive>

        {/*
          3 · the prices.

          ⛔ AND WHEN THERE ARE NONE, THE PAGE STILL COMPOSES (2026-09-18, measured).

          In the state that actually SHIPS — `getCoachPlans()` answers `[]`, because the three
          products do not exist in App Store Connect yet — the whole screen is an eyebrow, four
          lines and one card, about 400 points of it, inside a scroll view whose content container
          is `flexGrow: 1`. On a 6.7-inch phone that left the card sitting under the title with some
          seven hundred points of empty stage below it and a lone `Back` at the bottom of it: the
          shape of a screen still loading, on a screen that has finished and is not going to change.

          The whole argument — eyebrow, title, the sentence that sells it, what a seat is, the card —
          is centred as ONE optical block, so the air above it and the air below it are a deliberate
          measure rather than a margin and a void. (Centring only the CARD was tried first and read
          worse: it makes two gaps out of one, and the card floats away from the sentence it
          answers.) Nothing is added to fill the space — an invented row on a page about plans that
          are not for sale would be filler, and this screen's rule is that it never says more than
          it has. At a height where the content no longer fits, `flexGrow` does nothing and the page
          scrolls exactly as it did.
        */}
        <Arrive order={2} style={styles.tiersWrap}>
          {p.plans === null ? (
            <ActivityIndicator color={color.accent} style={styles.loader} />
          ) : unavailable ? (
            /* ⛔ NOT AN APOLOGY — what is true, what he has meanwhile, and what is coming. The seat
               counts are ours to name; the prices are Apple's, so they are not named. */
            <View style={styles.notYet}>
              <Text style={styles.notYetTitle}>{t('coachTrack.coach.plans.notYetTitle')}</Text>
              {/*
                ⛔ IT SAYS WHERE **HE** IS, NOT WHERE THE PRODUCT IS (2026-09-18, walked on glass).
                *
                * The card told a coach with thirty seats that "the free tier stands: up to 2
                * athletes" — directly under an eyebrow reading `12 / 30`. Two numbers about the
                * same thing, on the same screen, contradicting each other. A coach whose limit has
                * already been raised is told HIS number; only a coach actually on the free tier is
                * told what the free tier is.
              */}
              <Text style={styles.notYetLine}>
                {p.seats && p.seats.seats > COACH_FREE_SEATS
                  ? t('coachTrack.coach.plans.notYetYours', { seats: p.seats.seats })
                  : t('coachTrack.coach.plans.notYetFree', { seats: COACH_FREE_SEATS })}
              </Text>
              {/* What he can do about a full roster TODAY, which is the question he arrived with. */}
              <Text style={styles.notYetLine}>{t('coachTrack.coach.plans.notYetFree2')}</Text>
              <Text style={styles.notYetLine}>{t('coachTrack.coach.plans.notYetComing')}</Text>
            </View>
          ) : (
            <View style={styles.tiers}>
              {p.plans.map((x) => (
                <TierCard
                  key={x.id}
                  product={x}
                  selected={p.selected === x.id}
                  current={p.activeId === x.id}
                  onSelect={() => p.onSelect(x.id)}
                />
              ))}
            </View>
          )}

          {p.fault ? (
            <View style={p.fault === 'purchase' ? styles.faultPlain : styles.faultCard}>
              <Text style={p.fault === 'purchase' ? styles.error : styles.faultText}>
                {t(`coachTrack.coach.plans.fault.${p.fault}`)}
              </Text>
              {p.fault === 'claim' ? (
                <Button
                  variant="ghost"
                  size="card"
                  block
                  label={t('coachTrack.coach.plans.claimRetry')}
                  onPress={p.onRetryClaim}
                  disabled={p.busy}
                  style={styles.claimAct}
                />
              ) : null}
            </View>
          ) : null}
        </Arrive>
      </ScrollView>

      <View style={styles.footer}>
        {/* ⛔ NO CONTROL AT ALL WHILE THERE IS NOTHING TO BUY. A greyed "Subscribe" under a sentence
            that says the plans are not open is the dead button this screen was written against. */}
        {p.needsAccount || !unavailable ? (
          <Button
            variant="primary"
            size="act"
            block
            label={
              p.busy
                ? t('coachTrack.coach.plans.working')
                : p.needsAccount
                  ? t('coachTrack.coach.plans.enrollFirst')
                  : p.activeId
                    ? t('coachTrack.coach.plans.switch')
                    : t('coachTrack.coach.plans.subscribe')
            }
            disabled={actDisabled}
            onPress={p.onAct}
          />
        ) : (
          <Button variant="ghost" size="act" block label={t('common.back')} onPress={p.onBack} />
        )}
        {/*
          ⛔ THE LEGAL LINE CARRIES NO NAME AND NO PRICE (2026-09-18, walked on glass).
          *
          * It was the Paywall's `legalDynamic`, and it read `Coach 100 · <price> לחודש. …החיוב דרך
          * חשבון Apple שלך…` — three Latin runs inside one centred Hebrew paragraph. Wrapped over
          * two lines the runs landed on the wrong margins and `Apple` was split from the words that
          * govern it: the exact shape of the Why-sheet header fault ([[the-elevation-pass]]) and of
          * [[the-LTR-island-lesson]]. A sentence whose integrity depends on where it happens to
          * wrap is fragile by construction.
          *
          * The plan and the price are on the CARD, in 24pt, one gesture above this. All this line
          * has to carry is the renewal term Apple requires it to carry — so it does, in one
          * language, with nothing in it that can be reordered.
        */}
        {!unavailable && !p.needsAccount ? <Text style={styles.legal}>{t('coachTrack.coach.plans.legal')}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────── the container */

type Props = NativeStackScreenProps<MainParamList, 'CoachPlans'>;

export function CoachPlans({ navigation }: Props) {
  const coachTrack = useContext(CoachTrackContext);
  const coach = coachTrack?.coach ?? null;
  const [plans, setPlans] = useState<CoachPlanProduct[] | null>(null);
  const [activeId, setActiveId] = useState<CoachProductId | null>(null);
  const [selected, setSelected] = useState<CoachProductId | null>(COACH_PRODUCT_ORDER[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<CoachPlansFault | null>(null);
  /** The purchase whose seats have not landed — kept so "ask again" has something to ask about. */
  const [unclaimed, setUnclaimed] = useState<{ productId: string; transactionId?: string } | null>(null);

  useEffect(() => {
    void track('coach_plans_viewed', {});
    let alive = true;
    void Promise.all([billing.getCoachPlans(), billing.getCoachPlan()]).then(([list, plan]) => {
      if (!alive) return;
      setPlans(list);
      const current = plan.active && plan.productId ? (plan.productId as CoachProductId) : null;
      setActiveId(current);
      // Open on the smallest tier he is not already on — the answer he most likely came for.
      const first = list.find((x) => x.id !== current) ?? list[0];
      if (first) setSelected(first.id);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Tell the worker; it verifies with Apple and moves `seat_limit`. Never writes seats locally. */
  const claim = async (body: { productId: string; transactionId?: string }) => {
    const r = await coachClaimPlan(body);
    if (!r.ok) {
      setUnclaimed(body);
      setFault('claim');
      return;
    }
    setUnclaimed(null);
    setFault(null);
    await coachTrack?.refreshMe().catch(() => null);
  };

  const onAct = async () => {
    if (busy) return;
    if (!coach) {
      navigation.navigate('CoachEnroll');
      return;
    }
    if (!selected) return;
    setBusy(true);
    setFault(null);
    try {
      const r = await billing.purchaseCoachPlan(selected);
      if (r.status === 'pending') {
        setFault('pending');
        return;
      }
      if (r.status !== 'purchased') {
        // A cancel is an answer, not a failure — the screen simply stays where it is.
        if (r.status !== 'cancelled') setFault('purchase');
        return;
      }
      setActiveId(r.plan.productId ? (r.plan.productId as CoachProductId) : selected);
      void track('coach_plan_purchased', { productId: selected });
      await claim({ productId: selected, ...(r.transactionId ? { transactionId: r.transactionId } : {}) });
    } catch {
      setFault('purchase');
    } finally {
      setBusy(false);
    }
  };

  const onRetryClaim = async () => {
    if (busy || !unclaimed) return;
    setBusy(true);
    try {
      await claim(unclaimed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoachPlansView
      plans={plans}
      seats={coach ? { used: coach.used, seats: coach.seats } : null}
      plan={coachTrack?.plan ?? null}
      activeId={activeId}
      selected={selected}
      onSelect={setSelected}
      busy={busy}
      fault={fault}
      needsAccount={!coach}
      onAct={() => void onAct()}
      onRetryClaim={() => void onRetryClaim()}
      onBack={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 2 },
  back: { alignSelf: 'flex-start' },
  wrap: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 28 },
  /* The whole argument as ONE optical block, centred in the room it has — see the note at the
     tiers. Equal air above and below beats a title pinned to the top of an empty stage. */
  wrapCentred: { justifyContent: 'center', paddingBottom: 48 },
  eyebrow: { marginTop: 8, marginBottom: 12 },
  eyebrowOver: { color: alert.stage },
  title: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, color: color.textPrimary, textAlign: 'left', letterSpacing: trackingPx(32, tracking.display) },
  /* The one sentence that sells it — serif, because it is the coach being spoken to as a coach. */
  case: { fontFamily: font.serif, fontSize: 20, lineHeight: 29, color: color.accentText, textAlign: 'left', marginTop: 12 },
  seatLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textMuted, textAlign: 'left', marginTop: 10 },
  tiersWrap: { marginTop: 22 },
  tiers: { gap: 10 },
  loader: { marginTop: 28 },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  /* The answer LIGHTS the edge — it never fills (the Paywall's ruling, kept). */
  tierOn: { borderColor: color.textPrimary },
  tierPressed: { backgroundColor: color.fillSubtle },
  tierText: { flex: 1, gap: 3 },
  tierName: { fontFamily: font.sansSemibold, fontSize: 19, color: color.textSecondary, textAlign: 'left' },
  tierSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
  tierPriceCol: { alignItems: 'flex-end', gap: 1 },
  tierPrice: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 24, color: color.textSecondary, textAlign: 'right', letterSpacing: trackingPx(24, tracking.figure) },
  cadence: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'right' },
  onChosen: { color: color.textPrimary },
  /* The lapsed plan, in clay on its own card: the news he arrived with, above the argument. */
  overCard: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: alert.wash, padding: 18, gap: 8, marginBottom: 20 },
  graceLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left', marginBottom: 14 },
  /* Not open yet — a card, because it is the answer to the question the screen was opened with. */
  notYet: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: 18, gap: 8 },
  notYetTitle: { fontFamily: font.serif, fontSize: 24, lineHeight: 31, color: color.textPrimary, textAlign: 'left', marginBottom: 2 },
  notYetLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },
  faultPlain: { marginTop: 16 },
  faultCard: { marginTop: 16, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: 14 },
  error: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.alert, textAlign: 'left' },
  faultText: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  claimAct: { marginTop: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, gap: 10 },
  legal: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'center' },
});
