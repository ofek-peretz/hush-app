/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A COACH WITH A SEAT FREE IS NEVER SOLD ONE — and a plain athlete never learns coaching has a price.
 *
 * ⛔ RULING 1 OF THE COACH TRACK (founder, 2026-09-17): *"The coach pays."* Free up to two linked
 * trainees, then one of three monthly tiers. Two halves, and this law pins both of them:
 *
 *  1 · NOTHING SELLS A SEAT TO A COACH WHO HAS ONE. The seats screen is never a gate: no code path
 *      in the product navigates to `CoachPlans` on its own, and the only three doors are ones he
 *      presses himself — the FULL-roster sheet, the coach-account screen, and one quiet line at the
 *      foot of the athlete paywall. A coach with a seat free never even opens the invite sheet's
 *      `full` state (`Athletes.onInvite` mints an invite instead), so nothing about money appears.
 *
 *  2 · COACH BILLING IS INVISIBLE TO AN ATHLETE. Not one seat, tier or coach price is drawn on
 *      Today, the session, the programme, Progress, Cardio or the You tab's own rows. The single
 *      exception is a question at the foot of the paywall — a LINK, carrying no price and no seat
 *      count — because the founder deleted the fork at the front door on 2026-09-16 and a coach has
 *      to be able to find this from somewhere.
 *
 *  3 · AND A PAYING COACH IS A PAYING CUSTOMER. An active tier carries his own training too
 *      (`withCoachPlan`), beside the rule that a linked trainee is Pro — overlaid on StoreKit's
 *      answer, never written over it.
 *
 * ⛔ THE CLIENT NEVER RAISES ITS OWN SEAT LIMIT. Seats live in `coaches.seat_limit` on the worker.
 *    The screen's only write is `coachClaimPlan`, which carries what Apple issued and nothing else,
 *    and the number it prints afterwards is whatever `/coach/me` answered.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';

import { NO_COACH_PLAN, NO_ENTITLEMENT, isTrainingGated, withCoachLink, withCoachPlan, FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { billingStub } from '@/platform/billing/billing';
import {
  COACH_FREE_SEATS,
  COACH_PLAN_SEATS,
  COACH_PRODUCT_IDS,
  COACH_PRODUCT_ORDER,
  isCoachProductId,
  isProductId,
} from '@/platform/billing/products';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const he = JSON.parse(read('src/i18n/locales/he.json'));
const en = JSON.parse(read('src/i18n/locales/en.json'));

const PLAN = { active: true, productId: COACH_PRODUCT_IDS.coach30, seats: 30, expiresAt: null };

describe('⛔ 1 — the seats screen is a door he presses, never a gate that opens on him', () => {
  it('only three surfaces navigate to CoachPlans, and each one is a press', () => {
    const doors = ['src/screens/coach/Athletes.tsx', 'src/screens/coach/CoachEnroll.tsx', 'src/screens/subscription/Paywall.tsx'];
    for (const f of doors) expect(read(f)).toContain("navigate('CoachPlans')");

    /*
     * The sweep: nothing ELSE in the app may reach it. A gate would be a `CoachPlans` navigate
     * inside an effect or a guard somewhere in the training path — exactly the shape the athlete
     * paywall has and this screen must never grow.
     */
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(rel);
      }
      return out;
    };
    const offenders = walk('src')
      .filter((f) => /navigate\((['"`])CoachPlans\1/.test(read(f)))
      .filter((f) => !doors.includes(f) && f !== 'src/screens/profile/ProfileSheet.tsx');
    expect(offenders).toEqual([]);
  });

  it('the roster only shows the full sheet when every seat is taken', () => {
    const src = read('src/screens/coach/Athletes.tsx');
    // The one test that puts money on screen — and it is an inequality on HIS OWN numbers.
    expect(src).toContain("if (coach && coach.used >= coach.seats) {");
    expect(src).toContain("setSheet({ kind: 'full', used: coach.used, seats: coach.seats,");
    // Below that line the press mints an invite. Nothing about a price is reachable with a seat free.
    expect(src).toContain('const r = await coachInvite();');
  });

  it('the profile row sends a coach to his plan and a linked trainee to her coach — never to a price', () => {
    const src = read('src/screens/profile/ProfileSheet.tsx');
    expect(src).toMatch(/if \(ent\.source === 'coach'\) \{\s*navigation\.navigate\('MyCoach'\);/);
    expect(src).toMatch(/if \(ent\.source === 'coachPlan'\) \{\s*navigation\.navigate\('CoachPlans'\);/);
  });
});

describe('⛔ 2 — an athlete never meets coach billing', () => {
  /** Every screen an athlete lives on, and none of them may name a seat, a tier or a coach price. */
  const ATHLETE_SURFACES = [
    'src/screens/home/HomeView.tsx',
    'src/screens/session/SessionFlow.tsx',
    'src/screens/plan/PreWorkout.tsx',
    'src/screens/plan/ProgramTab.tsx',
    'src/screens/progress/ProgressLifts.tsx',
    'src/screens/subscription/Paywall.tsx',
  ];

  it('no athlete surface draws a coach tier, a seat count or a coach product id', () => {
    for (const f of ATHLETE_SURFACES) {
      if (!fs.existsSync(path.join(ROOT, f))) continue;
      const src = read(f);
      expect(src).not.toMatch(/hush\.coach\./);
      expect(src).not.toContain('COACH_PLAN_SEATS');
      expect(src).not.toContain('coachTrack.coach.plans.tier');
      expect(src).not.toContain('getCoachPlans');
    }
  });

  it('the paywall carries exactly ONE coach string, and it is a question with no price in it', () => {
    const src = read('src/screens/subscription/Paywall.tsx');
    const keys = src.match(/coachTrack\.coach\.plans\.[a-zA-Z.]+/g) ?? [];
    expect(keys).toEqual(['coachTrack.coach.plans.paywallLink']);
    for (const loc of [he, en]) {
      const line = loc.coachTrack.coach.plans.paywallLink;
      expect(typeof line).toBe('string');
      // no figure, no currency, no seat count — it asks, it does not offer.
      expect(line).not.toMatch(/[0-9$₪€£]/);
    }
  });

  it('the athlete paywall still leads with Pro — the coach line is the last thing on the page', () => {
    const src = read('src/screens/subscription/Paywall.tsx');
    expect(src.indexOf("t('paywall.keepTraining')")).toBeLessThan(src.indexOf("coachTrack.coach.plans.paywallLink"));
    expect(src.indexOf("t('paywall.recordYours')")).toBeLessThan(src.indexOf("coachTrack.coach.plans.paywallLink"));
    // …and it is a muted line, never a second act (there is one Button in this footer).
    expect(src).toContain('coachLine: { color: color.textMuted');
  });
});

describe('⛔ 3 — a paying coach is a paying customer', () => {
  it('an active tier opens his own Pro, with a source of its own', () => {
    const covered = withCoachPlan(NO_ENTITLEMENT, PLAN);
    expect(covered).toEqual({ active: true, productId: COACH_PRODUCT_IDS.coach30, source: 'coachPlan', expiresAt: null });
    expect(isTrainingGated(FREE_SESSION_LIMIT + 40, covered.active, '2025-01-01T00:00:00.000Z')).toBe(false);
    // `coachPlan` is NOT `subscription` — the membership row has to be able to say which is paying.
    expect(covered.source).not.toBe('subscription');
    expect(covered.source).not.toBe('coach');
  });

  it('no plan changes nothing, and a real purchase is never replaced', () => {
    expect(withCoachPlan(NO_ENTITLEMENT, NO_COACH_PLAN)).toBe(NO_ENTITLEMENT);
    const paid = { active: true, productId: 'hush.pro.annual', source: 'subscription', expiresAt: '2027-01-01T00:00:00.000Z' };
    expect(withCoachPlan(paid, PLAN)).toBe(paid);
    // A lapsed purchase is re-opened by the tier, and closed again when the tier goes.
    const lapsed = { active: false, productId: 'hush.pro.month', source: 'subscription', expiresAt: '2026-01-01T00:00:00.000Z' };
    expect(withCoachPlan(lapsed, PLAN).active).toBe(true);
    expect(withCoachPlan(lapsed, NO_COACH_PLAN)).toBe(lapsed);
  });

  it('the link is tried first, so a coach who also trains under someone reads the link’s sentence', () => {
    const both = withCoachPlan(withCoachLink(NO_ENTITLEMENT, true), PLAN);
    expect(both.source).toBe('coach');
  });
});

describe('⛔ the client never raises its own seat limit', () => {
  it('the screen tells the worker about a purchase and reads the seats back — it never writes them', () => {
    const src = read('src/screens/coach/CoachPlans.tsx');
    expect(src).toContain('const r = await coachClaimPlan(body);');
    expect(src).toContain('await coachTrack?.refreshMe().catch(() => null);');
    // The claim body is Apple's facts and nothing else.
    expect(src).toMatch(/claim\(\{ productId: selected, \.\.\.\(r\.transactionId \? \{ transactionId: r\.transactionId \} : \{\}\) \}\)/);
    // Nothing anywhere in the screen assigns a seat count.
    expect(src).not.toMatch(/seats\s*[:=]\s*COACH_PLAN_SEATS/);
    expect(src).not.toMatch(/setSeats\(/);

    const wire = read('src/platform/coachTrackClient.ts');
    expect(wire).toContain("return req('POST', '/coach/plan', claim);");
    // …and the TODO that says what the worker must do before this is ever pressed in anger.
    /* ⚠️ The five-step TODO that stood here until 2026-09-18 said what the worker had to build. It
       is built (`server/hush-identity/src/coach.ts` + `migrations/0002`), so the note is gone and
       what this asserts is the RULE it was protecting, which outlives it. */
    expect(wire).not.toMatch(/TODO\(server, coach-track phase 3\)/);
    expect(wire).toMatch(/verifies the transaction with Apple/);
    expect(wire).toMatch(/never computes them/);
  });

  it('the seats a screen may print come from /coach/me, not from the tier it just bought', () => {
    const src = read('src/screens/coach/CoachPlans.tsx');
    expect(src).toContain('seats={coach ? { used: coach.used, seats: coach.seats } : null}');
  });
});

describe('⛔ never a dead button and never a fake price', () => {
  it('the stub answers no coach products, because App Store Connect has none', async () => {
    await expect(billingStub.getCoachPlans()).resolves.toEqual([]);
    await expect(billingStub.getCoachPlan()).resolves.toBe(NO_COACH_PLAN);
    await expect(billingStub.purchaseCoachPlan(COACH_PRODUCT_IDS.coach10)).resolves.toMatchObject({ status: 'failed' });
    // The Pro stub DOES print placeholders — those products are real. This is the distinction.
    await expect(billingStub.getProducts()).resolves.toHaveLength(2);
  });

  it('no price for a coach tier is written anywhere in the source or the copy', () => {
    const src = read('src/screens/coach/CoachPlans.tsx');
    expect(src).not.toMatch(/19\.99|39\.99|69\.99/);
    for (const loc of [he, en]) {
      const plans = JSON.stringify(loc.coachTrack.coach.plans);
      expect(plans).not.toMatch(/19\.99|39\.99|69\.99|\$|₪|€|£/);
    }
    // The only price the card can draw is the store's own localized label.
    expect(src).toContain('{product.priceLabel}');
  });

  it('with no products the screen draws no purchase control at all', () => {
    const src = read('src/screens/coach/CoachPlans.tsx');
    expect(src).toContain('const unavailable = !!p.plans && p.plans.length === 0;');
    expect(src).toContain('{p.needsAccount || !unavailable ? (');
    // …and it says WHY, in its own words, rather than greying something out.
    for (const loc of [he, en]) {
      expect(loc.coachTrack.coach.plans.notYetTitle.length).toBeGreaterThan(0);
      expect(loc.coachTrack.coach.plans.notYetFree).toContain('{{seats}}');
    }
  });

  /**
   * ⛔ AND THE SHIPPING STATE READS AS FINISHED (2026-09-18, measured).
   *
   * `[]` is not a temporary state — it is what every phone answers today — and the screen spent it
   * as a card under a title with some 700 points of empty stage below it on a 6.7-inch phone: the
   * shape of a page still loading. The block is centred in the room the title leaves. Nothing was
   * ADDED to fill the gap, because the one thing this screen must not do is say more than it has.
   */
  it('with no products the page composes at any phone height, and still names the three sizes', () => {
    const src = read('src/screens/coach/CoachPlans.tsx');
    // The whole argument is ONE optical block, centred in the room it has.
    expect(src).toContain("wrapCentred: { justifyContent: 'center'");
    expect(src).toContain('contentContainerStyle={[styles.wrap, unavailable && !over && styles.wrapCentred]}');
    // …and it still scrolls when the content no longer fits, rather than clipping.
    expect(src).toContain("wrap: { flexGrow: 1,");
    // The three sizes are OURS to name; the prices are Apple's and are not named.
    for (const loc of [he, en]) {
      const coming = loc.coachTrack.coach.plans.notYetComing;
      for (const n of ['10', '30', '100']) expect(coming).toContain(n);
      expect(coming).not.toMatch(/\$|₪|€|£/);
    }
  });

  it('the full-roster sheet now opens onto a real screen — the null hook is gone', () => {
    const src = read('src/screens/coach/CoachInvite.tsx');
    expect(src).not.toMatch(/export const COACH_SEATS_UPGRADE/);
    expect(src).toContain('onPress={onSeats}');
  });
});

describe('⛔ the product catalogue', () => {
  it('three tiers, the contract’s ids, the contract’s seat counts, smallest first', () => {
    expect(COACH_PRODUCT_ORDER).toEqual([
      'hush.coach.10.month',
      'hush.coach.30.month',
      'hush.coach.100.month',
    ]);
    expect(COACH_PRODUCT_ORDER.map((id) => COACH_PLAN_SEATS[id])).toEqual([10, 30, 100]);
    expect(COACH_FREE_SEATS).toBe(2);
  });

  it('a coach id is never mistaken for a Pro id, in either direction', () => {
    for (const id of COACH_PRODUCT_ORDER) {
      expect(isCoachProductId(id)).toBe(true);
      expect(isProductId(id)).toBe(false);
    }
    for (const id of ['hush.pro.month', 'hush.pro.annual']) {
      expect(isProductId(id)).toBe(true);
      expect(isCoachProductId(id)).toBe(false);
    }
  });

  it('the coach seam is separate from the athlete seam, so no coach transaction can set Pro', () => {
    const seam = read('src/platform/billing/billing.ts');
    expect(seam).toContain('purchaseCoachPlan(productId: CoachProductId): Promise<CoachPurchaseResult>;');
    expect(seam).toContain('purchase(productId: ProductId): Promise<PurchaseResult>;');
    const sk = read('src/platform/billing/storekit.ts');
    // Pro's entitlement is read from the Pro order only; the coach's from the coach order only.
    expect(sk).toContain('const subs = await iap.getActiveSubscriptions([...PRODUCT_ORDER]);');
    expect(sk).toContain('const subs = await iap.getActiveSubscriptions([...COACH_PRODUCT_ORDER]);');
    expect(sk).toContain('subs.find((s) => s.isActive && isProductId(s.productId))');
    expect(sk).toContain('subs.find((s) => s.isActive && isCoachProductId(s.productId))');
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AND WHEN THE PLAN ENDS, THE ATHLETES DO NOT (2026-09-18 — the worker's `/coach/plan` landed).
 *
 * `COACH_TRACK_V1 §6`: `EXPIRED`, `REFUND`, `REVOKE` and a failed renewal put `seat_limit` back to
 * NULL, and **nothing is deleted**. The coach keeps every athlete, every week he ever sent and
 * every upload; what closes is a new invite (409 `seats_full`). The server derives `over_limit`
 * from `used > seats` at read, so the same state covers a lapse and a 100→10 downgrade.
 *
 * The app's whole job here is to SAY that. `22 / 10` in clay is not a sentence, and the reading it
 * invites — "twelve of my athletes were removed" — is the one thing that is not true.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ over_limit has a face, and it never reads as a removal', () => {
  const roster = read('src/screens/coach/Athletes.tsx');
  const plansSrc = read('src/screens/coach/CoachPlans.tsx');
  const sheet = read('src/screens/coach/CoachInvite.tsx');
  const client = read('src/platform/coachTrackClient.ts');
  const store = read('src/state/stores/coachStore.tsx');

  it('the wire carries the plan, and the app reads the state the contract defines', () => {
    expect(client).toContain('export interface CoachPlanState');
    for (const f of ['productId', 'seats', 'renewsAt']) expect(client).toContain(`${f}:`);
    expect(client).toContain("state: 'active' | 'grace' | 'expired' | 'over_limit';");
    expect(client).toContain('plan?: CoachPlanState | null;');
    // …and the store holds it beside the coach row, from `/coach/me` and nowhere else.
    expect(store).toContain('plan: CoachPlanState | null;');
    expect(store).toContain('setPlan(me?.plan ?? null);');
    // Enrolling answers no plan; writing null there would erase a returning coach's tier.
    const enroll = store.slice(store.indexOf('const enroll = useCallback('), store.indexOf('const join = useCallback'));
    expect(enroll).not.toContain('setPlan(');
  });

  it('the five-step TODO on the claim is gone — the worker built it', () => {
    expect(client).not.toMatch(/TODO\(server, coach-track phase 3\)/);
    expect(client).not.toMatch(/DOES NOT EXIST ON THE WORKER YET/);
    // …and the rule it protected stays: the client never raises its own seats.
    expect(client).toContain('decide locally that it now has thirty seats');
  });

  it('the roster says it in words, and the seats figure is not left to carry it alone', () => {
    expect(roster).toContain("track$?.plan?.state === 'over_limit'");
    expect(roster).toContain("t('coachTrack.coach.roster.overLimit')");
    expect(roster).toContain('overLimit={overLimit}');
  });

  it('the invite still answers — a sheet that explains, never a disabled button', () => {
    // The press is not gated on seats anywhere; the sheet is what says no.
    expect(roster).not.toMatch(/disabled=\{[^}]*overLimit/);
    expect(roster).toContain('...(overLimit ? { overLimit: true } : {})');
    expect(sheet).toContain("t(state.overLimit ? 'coachTrack.coach.invite.overTitle' : 'coachTrack.coach.invite.fullTitle')");
  });

  it('CoachPlans leads with it, above the pitch, and says grace is not a cancellation', () => {
    expect(plansSrc).toContain("const over = p.plan?.state === 'over_limit';");
    expect(plansSrc).toContain("t('coachTrack.coach.plans.overTitle')");
    expect(plansSrc).toContain("p.plan?.state === 'grace'");
    expect(plansSrc).toContain("t('coachTrack.coach.plans.graceLine')");
  });

  it('⛔ not one of these sentences says an athlete was removed, in either language', () => {
    for (const loc of [he, en]) {
      const said = [
        loc.coachTrack.coach.roster.overLimit,
        loc.coachTrack.coach.plans.overTitle,
        loc.coachTrack.coach.plans.overBody,
        loc.coachTrack.coach.plans.graceLine,
        loc.coachTrack.coach.invite.overTitle,
        loc.coachTrack.coach.invite.overBody,
      ];
      for (const line of said) {
        expect(typeof line).toBe('string');
        /* The false reading, stated: "your athletes were removed / you lost N". A DENIAL of it
           ("Nobody was removed") is the sentence we want, so the ban is on the claim, not the word. */
        expect(line).not.toMatch(/your athletes (were|have been) (removed|deleted)/i);
        expect(line).not.toMatch(/you lost|המתאמנים (שלך )?הוסרו|איבדת/);
      }
      // And each one says what is still his, not only what is closed.
      expect(loc.coachTrack.coach.plans.overBody).toMatch(/{{used}}/);
      expect(loc.coachTrack.coach.plans.overBody).toMatch(/{{seats}}/);
      // The plans card denies it out loud — the reading is common enough to answer, not dodge.
      expect(loc.coachTrack.coach.plans.overBody).toMatch(/Nobody was removed|אף אחד לא הוסר/);
    }
  });
});
