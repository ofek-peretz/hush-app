/**
 * PAYWALL (v7 4.3) — "the trial closes like a milestone".
 *
 * ⛔ FOUNDER, 2026-08-13: *"אני חושב שצריך לשנות אותו ולהסיר את כל המלל הזה… ופשוט להגדיל את שני
 * הכרטיסים ולשים אותם במרכז ותעצב אותם כמו שעשית לשאר הכרטיסים באפליקציה. גם למה הלבן הזה בתוך
 * הכרטיס — מאיפה הוא הגיע בכלל?"*
 *
 * ── WHAT WENT, AND WHY IT WAS NEVER EARNING ITS PLACE ───────────────────────────────────────────
 * Three ruled "promises" and a sentence about renewal stood between the headline and the prices.
 * **Every one of them was a claim she had already spent fourteen sessions verifying.** A person who
 * has trained with the app for two weeks does not need to be told the coach decides her weights;
 * she needs to know what it costs. The renewal terms were the same sentence the legal line at the
 * foot already carries, said twice.
 *
 * ⚠️ AND THE WHITE CARD IS GONE. It was a deliberate "paper" slab — the annual plan cut from cream
 * so it would pop off the dark — and it is the only object in the product that used that trick.
 * That is precisely what made it look imported: an app whose entire card vocabulary is *a dark
 * field with a hairline border that lights up when chosen* had one screen shouting in a different
 * language, on the screen where trust matters most. Both plans now stand in the shape she has
 * already used to pick her sex, her units and her language.
 *
 * The two cards are TALL, EQUAL and CENTRED in the space the copy vacated — the only thing on the
 * page once the headline has spoken.
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

// 

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { Arrive, Button, Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { BILLING_EVENTS } from '@/platform/events';
import { billing, PRODUCT_IDS, type ProductId, type SubscriptionProduct } from '@/platform/billing';
import { annualSavingPct, monthlyEquivalentLabel } from '@/domain/pricing';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { paywallCase, type PaywallCase } from '@/domain/paywallCase';
import { athleteFile } from '@/domain/athleteFile';
import { engineReceipt, type EngineReceipt } from '@/domain/engineReceipt';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { db } from '@/data/local/db';
import { bidi } from '@/i18n/bidi';
import { exerciseDisplayName } from '@/data/exercises';
import { color, space, font, textScale, ramp, tracking, trackingPx, radius, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Paywall'>;
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
/** Below this, the file line draws nothing — a count that small proves nothing (see the render note). */
const FILE_FACTS_FLOOR = 5;

export function Paywall({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  /*
   * How much of the trial she has actually used. Clamped to the limit so a session logged past the
   * gate (the watch reconciling offline work, say) cannot print "session 15 of 14".
   */
  const sessionsDone = Math.min(app.modeState.completedSessions, FREE_SESSION_LIMIT);
  const trialSpent = sessionsDone >= FREE_SESSION_LIMIT;
  const source = route.params?.source ?? 'gate';

  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  /*
   * ════ ⛔ THE ARGUMENT IS HER OWN NUMBERS (founder, 2026-08-23) ════
   *
   * One measured sentence under the headline — "your deadlift rose 12.5 kg since you started" —
   * read from her log by `domain/paywallCase`. This is NOT the copy his 2026-08-13 ruling removed:
   * that was generic promises; this is her own measurement, the one close no competitor can print.
   * Null (nothing rose / young history) draws nothing — a paywall never fishes.
   */
  const [personalCase, setPersonalCase] = useState<PaywallCase | null>(null);
  /** The engine's stocktake of her — the fallback close when no lift rose. See the render note. */
  const [fileFacts, setFileFacts] = useState(0);
  /** The fixed-plan counterfactual (audit M2) — the middle close. See `domain/engineReceipt`. */
  const [receipt, setReceipt] = useState<EngineReceipt['counterfactual']>(null);
  useEffect(() => {
    let alive = true;
    void db
      .loadHistory()
      .then((h) => {
        if (!alive) return;
        setPersonalCase(paywallCase(h, app.profile?.units ?? 'kg'));
        setFileFacts(athleteFile(h).totalFacts);
        setReceipt(engineReceipt(h).counterfactual);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState<ProductId>(PRODUCT_IDS.annual);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<null | 'purchase' | 'restore' | 'pending'>(null);

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
    setFailed(null);
    try {
      const result = await app.purchaseSubscription(selected);
      if (result.status === 'failed') setFailed('purchase');
      /*
       * ASK-TO-BUY IS AN ANSWER, NOT SILENCE (2026-09-01, audit finding 5). `pending` means a
       * parent got the request — before this line the sheet closed and NOTHING said why the app
       * was still locked. When the approval lands, the persistent StoreKit listener re-reads the
       * entitlement and the effect above pops this screen on its own.
       */
      if (result.status === 'pending') setFailed('pending');
      // On success the entitlement effect above pops the screen; cancel is a no-op.
    } catch {
      setFailed('purchase');
    } finally {
      // ALWAYS: a throw from StoreKit used to leave `busy` true, disabling the Subscribe button
      // for good — on the one screen whose entire job is to take money.
      setBusy(false);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const result = await app.restorePurchases();
      /*
       * A FAILED RESTORE IS ITS OWN SENTENCE (2026-09-01, audit finding 5). It used to share the
       * purchase error — "Your card was not charged" — which, to someone whose real problem is the
       * wrong Apple ID, is a non-sequitur and a support ticket. The honest sentence names the
       * actual fact: no membership on THIS Apple ID.
       */
      if (!(result.status === 'restored' && result.entitlement.active)) setFailed('restore');
    } catch {
      setFailed('restore');
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
        {/*
          * ⚠️ IT SAYS WHERE SHE ACTUALLY IS (founder A.14).
          *
          * The eyebrow read "Session 14 · your trial is complete" whatever her number was — so
          * tapping "Hush Pro" in the You tab at session three showed a spent trial that had not
          * been spent. A screen asking her to pay is the worst place in the product to be wrong
          * about how much she has already had.
          *
          * The renewal terms that used to sit under this headline are gone: the legal line at the
          * foot of the screen says the same thing, and it is the line Apple requires anyway.
          */}
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12).

          Three beats, and the order is the argument this screen makes: what she has spent of the
          trial, the sentence that thanks her for it, and only THEN the prices. A paywall that puts
          its numbers on the glass at the same instant as its thank-you has not made an argument, it
          has made an ask. The prices are the last thing to land because they are the last thing
          said.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        <Arrive order={0}>
          <RangeMark width={44} height={18} tone={signal[0]} />
        </Arrive>
        <Arrive order={0}>
        <Legend tone="accent" track={0.16} style={styles.eyebrow}>
          {trialSpent
            ? t('paywall.trialDone', { n: FREE_SESSION_LIMIT })
            : t('paywall.trialLeft', { done: sessionsDone, n: FREE_SESSION_LIMIT })}
        </Legend>
        </Arrive>
        <Arrive order={1}>
          <Text style={styles.title} accessibilityRole="header">{t('paywall.title')}</Text>
        </Arrive>

        {/* the measured close — see `personalCase` above. The serif, because the coach is speaking. */}
        {personalCase ? (
          <Text style={styles.case}>
        {/*
          ⛔ THE HEBREW VERB COULD NOT AGREE WITH THE LIFT (2026-08-28).

          It read `ה{{lift}} שלך עלה ב־{{delta}}` — `עלה` fixed masculine, against a lift name the
          template does not contain. **Seventy-six of the app's 136 exercise names are feminine** —
          every `לחיצת`, `חתירה`, `כפיפת`, `פשיטת`, `משיכה`, `הרמת` — so the sentence was wrong for
          fifty-six per cent of athletes, on the screen that asks them to pay.

          ⚠️ INVISIBLE IN ENGLISH, which is why it lasted: "your {{lift}} rose" is correct for all
          136. Hebrew is the primary locale and the only one that could have shown it.

          The verb is gone rather than duplicated. `ה{{lift}} שלך — {{delta}} {{unit}} יותר` states
          the same fact with nothing left to agree, and the em-dash is already this app's own
          construction (`לחיצת חזה במוט — סיימנו.`). Same treatment as the three pain and whyHere
          templates on 2026-08-28; the shape is described in `lint-copy`'s note on agreement.

          ⛔ AND THE ARTICLE WAS THE SECOND HALF OF IT. Rendering the fixed sentence across real
          names showed `הלחיצת חזה במוט` — `ה` on the FIRST word of a construct phrase, which Hebrew
          does not permit; the article belongs to the last word or to nowhere. `דחיפה אופקית` fails
          differently (noun + adjective needs the article on both), and `דדליפט` and `חתירה במוט`
          happen to survive. So `ה{{…}}` is only ever safe for a name whose shape you already know,
          and these placeholders take 136 of them.

          The article is gone with the verb. `לחיצת חזה במוט — 11 ק"ג יותר מאז שהתחלנו.` is right for
          every shape, and `מאז שהתחלנו` already says whose lift it is.

          ⚠️ THE VERB FIX ALONE WOULD HAVE SHIPPED THIS. It only appeared because the string was
          rendered out against real values instead of read in the file — which is the same lesson as
          `2.2g`: a thing not looked at is a thing not designed.
        */}
            {t('paywall.case', {
              lift: bidi(exerciseDisplayName(personalCase.exerciseId)),
              delta: personalCase.delta,
              unit: personalCase.unit,
            })}
            {personalCase.othersUp > 0 ? ` ${t('paywall.caseOthers', { count: personalCase.othersUp })}` : ''}
          </Text>
        ) : receipt ? (
          /*
           * ════ THE COUNTERFACTUAL (2026-09-01, audit M2) — the middle close. ════
           *
           * Two prescriptions on one lift, and the reader draws the conclusion. Every number is
           * either logged (the engine's figure is her latest `recommendedWeight`) or the NAMED
           * rule's own arithmetic ("one step every session", from her own first prescription) —
           * which is what keeps a comparison inside the voice law. `engineReceipt` stays silent
           * under four occurrences or two grains of difference; when it speaks, it has a story.
           * The templates carry no verb and no article agreeing with the lift name — the
           * `paywall.case` lesson of 2026-08-28, kept.
           */
          <Text style={styles.case}>
            {t(receipt.engineKg > receipt.fixedKg ? 'paywall.receiptAhead' : 'paywall.receiptBehind', {
              lift: bidi(exerciseDisplayName(receipt.exerciseId)),
              fixed: displayWeight(receipt.fixedKg, app.profile?.units ?? 'kg'),
              engine: displayWeight(receipt.engineKg, app.profile?.units ?? 'kg'),
              unit: unitLabel(app.profile?.units ?? 'kg'),
            })}
          </Text>
        ) : fileFacts >= FILE_FACTS_FLOOR ? (
          /*
           * ════ THE FILE (2026-09-01, audit M5) — the fallback close, when no lift rose. ════
           *
           * `athleteFile` counts what the engine's own evidence gates have EARNED about her — the
           * learned rests, the fitted slopes, the grids, the ceilings. It is the honest form of
           * "what would I lose by leaving": not a promise, a stocktake. Shown only when the
           * stronger close (a lift that rose) is absent — one measured sentence, never two, on the
           * screen the founder stripped of claims. Below the floor it draws nothing: "3 measured
           * facts" is the app reading its database back to her, which is the failure the whole
           * whatIKnow module is written against.
           */
          <Text style={styles.case}>{t('paywall.file', { count: fileFacts })}</Text>
        ) : null}

        {/* ⛔ THE PRICES ARE THE SCREEN. With the pitch gone they take the whole middle of the page
            rather than trailing a list of claims. */}
        <Arrive order={2} style={styles.plansWrap}>
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

          {failed ? (
            <Text style={failed === 'pending' ? styles.pendingNote : styles.error}>
              {failed === 'restore'
                ? t('paywall.restoreNone')
                : failed === 'pending'
                  ? t('paywall.pendingNote')
                  : t('paywall.error')}
            </Text>
          ) : null}
        </Arrive>
      </ScrollView>

      <View style={styles.footer}>
        {/*
          CREAM, LIKE EVERY OTHER ACT IN HUSH (design audit, 2026-08-24).

          This button was moss, and the reason written here was sound when it was written: *"the
          annual card above is already paper, and a cream act under a cream card is two slabs of the
          same thing."* The cards stopped being paper. `plan` below carries no `backgroundColor` at
          all now — it is a 1px lit edge on the dark canvas, and `planOn` answers a choice by
          brightening that edge rather than filling it. There is no cream above this button to
          collide with, so the only thing the moss still did was make the one commercial act in the
          product look unlike every other act in it.

          And the audit's second reason is the one that decides it: a green BUY under a dark sheet is
          the house style of conversion optimisation, which is the thing this product sells against.
          Hush's act is cream on the stage, in the gym and at the till alike. If a paper surface ever
          returns behind this footer, the answer is to change THAT surface — not to give commerce its
          own colour.
        */}
        <Button
          variant="primary"
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
        {/*
          ⛔ HER RECORD IS NEVER HELD HOSTAGE (founder, 2026-08-23: the Spotify mandate — trust is
          what converts). The gate blocks STARTING new engine sessions and nothing else — History,
          Progress, the body map and the record export all stay open — and the one screen where
          she decides whether to trust us says so in words.
        */}
        <Text style={styles.recordYours}>{t('paywall.recordYours')}</Text>
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

/**
 * ONE PLAN.
 *
 * ⛔ THE CARD SHE ALREADY KNOWS — the onboarding sex control's geometry, the same one Profile's
 * units and language and Progress's Lifts/Log now wear: equal fields, a hairline that LIGHTS to
 * cream on the answer, a wash on press and never a fade (A.13). Two cards teaching one gesture.
 *
 * Both plans state their price per MONTH — the two are only comparable in the same unit — with the
 * year's real total beneath the annual, so the divided figure never has to be taken on trust.
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
      style={({ pressed }) => [styles.plan, selected && styles.planOn, pressed && styles.planPressed]}
    >
      {savingPct != null ? (
        <View style={styles.saveTag}>
          <Legend size={ramp.body} weight="semibold" track={tracking.wide} style={styles.saveTagText}>
            {t('paywall.savePct', { pct: savingPct })}
          </Legend>
        </View>
      ) : null}

      <View style={styles.planText}>
        <Text style={[styles.planName, selected && styles.onChosen]} numberOfLines={1}>{name}</Text>
        {/*
          TWO LINES, BECAUSE THIS LINE CARRIES THE AMOUNT SHE IS ACTUALLY CHARGED (audit 2026-08-24).

          At one line it read "$59.99 billed once a ye…" / "‎$59.99 בחיוב אחד ל…" — the price column
          beside it is wide (a hero figure plus its cadence), so the sub had nothing left. Every
          other truncation in this app costs a word; this one truncates the single fact that makes
          the annual plan honest — the yearly charge, next to the monthly figure the card leads with.
          A paywall that shows "$5.00 / month" in hero type and clips the "$59.99 billed once a year"
          under it is doing the thing this product refuses to do.
        */}
        <Text style={styles.planSub} numberOfLines={2}>{sub}</Text>
      </View>

      <View style={styles.planPriceCol}>
        {/* The figure may be a long localized price; it shrinks rather than wraps or truncates,
            because a price with a missing digit is the one thing this card cannot do. */}
        <Text
          style={[styles.planPrice, selected && styles.onChosen]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {figure}
        </Text>
        <Text style={styles.cadence} numberOfLines={1}>{cadence}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: 26, paddingTop: space[2], paddingBottom: space[1], alignItems: 'flex-end' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(241,238,229,0.08)', alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: color.fillSubtleStrong },
  // `flexGrow` so the plans can take the space the copy left rather than stacking under the title.
  scroll: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 8, paddingBottom: space[4] },
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

  /* The coach's one measured sentence — serif, quiet, under the headline. */
  case: {
    color: color.textSecondary,
    fontFamily: font.serif,
   
    fontSize: 20,
    lineHeight: 27,
    marginTop: 12,
    textAlign: 'left',
  },
  recordYours: { color: color.textMuted, fontFamily: font.sans, fontSize: 17, lineHeight: 22, textAlign: 'center' },
  loader: { marginVertical: space[8] },
  unavailable: { color: color.textMuted, fontFamily: font.sans, fontSize: textScale.base, textAlign: 'center', marginVertical: space[8] },

  /* ⛔ CENTRED IN WHAT THE COPY LEFT — the prices are the only object between the headline and the
     act, so they sit in the middle of the page rather than at the top of the leftovers. */
  plansWrap: { flex: 1, justifyContent: 'center', paddingVertical: 24 },
  /*
   * ⛔ HORIZONTAL, ANNUAL FIRST, EACH WITH ITS OWN SPACE (founder, 2026-08-13). Two narrow columns
   * made both plans compete for the same 159 points and squeezed the price into a shrinking figure.
   * A plan is a NAME and a PRICE — a line, not a column — so each takes the full width and the
   * reading order becomes the comparison: annual above, monthly below, one glance apart.
   */
  plans: { gap: 18 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    minHeight: 128,
    paddingVertical: 26,
    paddingHorizontal: 26,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
  },
  // The answer is the LIT EDGE — the same signal the sex, units and language controls give.
  planOn: { borderColor: color.textPrimary },
  // A.13: a press washes, it never fades.
  planPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },

  planText: { flex: 1, minWidth: 0, gap: 4 },
  planPriceCol: { flexShrink: 0, alignItems: 'flex-end' },
  planName: { color: color.textMuted, fontFamily: font.sansMedium, fontSize: 22, textAlign: 'left' },
  planPrice: {
    color: color.textSecondary,
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
    textAlign: 'right',
  },
  /*
   * ⚠️ SANS, AND IT WAS MONO UNTIL TODAY. "/month" is a WORD, and in Hebrew it is "/חודש" — glyphs
   * IBM Plex Mono does not contain (`monoCarriesNoWords`). The law never caught it because the
   * string arrives through a variable rather than a `t(...)` inside the tag, so the cadence has been
   * one OS font substitution away from tofu on every Hebrew paywall.
   */
  cadence: { color: color.textMuted, fontFamily: font.sans, fontSize: 17, textAlign: 'right' },
  onChosen: { color: color.textPrimary }, // rtl-ok: merged onto a base that sets textAlign

  planSub: { color: color.textMuted, fontFamily: font.sans, fontSize: 17, lineHeight: 22, textAlign: 'left' },

  // The saving tag straddles the card's top edge — the one figure allowed to be loud, struck in
  // deep moss, sitting over the name it qualifies.
  saveTag: {
    position: 'absolute',
    top: -13,
    start: 22,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: signal[1],
  },
  saveTagText: {
    // Cream ink, asked for BY NAME — the tag's ground is deep moss, so this is the same cream that
    // carries every other word on a dark surface, not "whatever the paper ladder's first rung is".
    /* ⛔ …and it was a hand-rolled `Legend` that tracked Hebrew, at a tracking sized for the 10.5pt
       it stopped being set in — one of six found 2026-08-27. See `WellDone.heroLabel`. The tag is
       the loudest word on the paywall; `חסכי 40%` came apart into letters to say it. */
    color: color.textPrimary,
    textAlign: 'left',
  },

  error: { color: color.alert, fontFamily: font.sans, fontSize: textScale.sm, textAlign: 'center', marginTop: space[5] },
  // Ask-to-Buy is news, not an error — same slot, the text's own colour, no red (audit finding 5).
  pendingNote: { color: color.textSecondary, fontFamily: font.sans, fontSize: textScale.sm, textAlign: 'center', marginTop: space[5] },

  footer: { paddingHorizontal: 26, paddingTop: space[3], gap: 12 },
  quietRow: { flexDirection: 'row', justifyContent: 'center', gap: 26 },
  quiet: { color: color.textSecondary, fontFamily: font.sansMedium, fontSize: 17, textAlign: 'center' },
  legal: {
    color: color.textMuted,
    fontFamily: font.sans,
    fontSize: 17,
    // lineHeight follows the floor up — 16 was set against a 12px line and would clip a 17px one.
    lineHeight: 22,
    textAlign: 'center',
  },
});
