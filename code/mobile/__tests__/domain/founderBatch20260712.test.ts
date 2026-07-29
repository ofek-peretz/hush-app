/**
 * Founder QA batch 2026-07-12 — the pure rules the design pass introduced.
 *
 * Everything here is a LAW the UI now depends on, so it is pinned rather than left to a
 * screenshot: a duration is minutes, a saving is derived from real prices (never a
 * hardcoded percent), the wheel's focus curve is what makes the selection unambiguous, the
 * route trace preserves the shape of the run, and every milestone family strikes its own
 * badge.
 */
import { durationMinutes, fmtMinutes, fmtMinutesFromMs } from '@/domain/duration';
import { parsePriceAmount, annualSavingPct } from '@/domain/pricing';
import { WHEEL_HEIGHT } from '@/components/ds/WheelPicker';
import { projectRoute, simplifyRoute, MAX_ROUTE_POINTS } from '@/components/RouteTrace';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { COUNT_THRESHOLDS, TONNAGE_THRESHOLDS_KG, clubLadders, type Milestone } from '@/domain/milestones';
import type { SubscriptionProduct } from '@/platform/billing';

const t = (key: string) => key; // copy is not under test here — identity is enough

describe('durations read in minutes, never as a clock', () => {
  it('renders a session as "63 min", not "1:03"', () => {
    expect(fmtMinutes(3780, 'min')).toBe('63 min');
    expect(fmtMinutesFromMs(3_780_000, 'min')).toBe('63 min');
  });

  it('rounds to the nearest minute', () => {
    expect(durationMinutes(89)).toBe(1); // 1:29 → 1 min
    expect(durationMinutes(91)).toBe(2); // 1:31 → 2 min
  });

  it('never rounds real work down to zero minutes', () => {
    expect(durationMinutes(20)).toBe(1);
    expect(durationMinutes(1)).toBe(1);
  });

  it('is zero only when nothing happened', () => {
    expect(durationMinutes(0)).toBe(0);
    expect(durationMinutes(-5)).toBe(0);
  });
});

describe('the annual saving is derived from the live store prices', () => {
  const plan = (period: 'annual' | 'monthly', priceLabel: string): SubscriptionProduct =>
    ({ id: `hush.pro.${period}`, period, priceLabel, introTrialLabel: null }) as SubscriptionProduct;

  it('reads a price out of any locale format', () => {
    expect(parsePriceAmount('$59.99')).toBeCloseTo(59.99);
    expect(parsePriceAmount('59,99 €')).toBeCloseTo(59.99);
    expect(parsePriceAmount('₪219.90')).toBeCloseTo(219.9);
    expect(parsePriceAmount('US$1,234.56')).toBeCloseTo(1234.56);
    expect(parsePriceAmount('1.234,56 kr')).toBeCloseTo(1234.56);
    expect(parsePriceAmount('$60')).toBe(60);
    // A bare thousands group is a whole number, not a decimal.
    expect(parsePriceAmount('¥1.234')).toBe(1234);
  });

  it('computes the founder’s 60/10 case as 50%', () => {
    expect(annualSavingPct([plan('annual', '$60'), plan('monthly', '$10')])).toBe(50);
  });

  it('rounds DOWN so the tag can never overstate the discount', () => {
    // 12 × 9.99 = 119.88; 79.99 saves 33.27% → the athlete is told 33.
    expect(annualSavingPct([plan('annual', '$79.99'), plan('monthly', '$9.99')])).toBe(33);
  });

  it('shows nothing rather than a guess when the maths is not there', () => {
    expect(annualSavingPct([plan('annual', '$60')])).toBeNull(); // no monthly to compare
    expect(annualSavingPct([plan('annual', 'Free'), plan('monthly', '$10')])).toBeNull(); // unparseable
    expect(annualSavingPct([plan('annual', '$120'), plan('monthly', '$10')])).toBeNull(); // no saving
    expect(annualSavingPct([plan('annual', '$119'), plan('monthly', '$10')])).toBeNull(); // <5%: noise
  });
});

describe('the wheel reads as a measuring rule (v7 1.4 engraved scale)', () => {
  it('stays a comfortable touch target — the numeral row above the engraved tick strip', () => {
    // v7 draws every onboarding ruler at 76: a big scrolling numeral row over a fixed graduation
    // struck by one moss centre tick. Body data now stacks only ONE wheel (bodyweight; sex moved
    // to Name, age/height struck for deciding nothing), so the tight ≤56 budget is retired.
    expect(WHEEL_HEIGHT.md).toBeGreaterThanOrEqual(44); // never smaller than the box it replaced
    // ONE WHEEL, ONE SIZE (founder 2026-07-28): "enlarge them, and let that size be uniform for
    // every wheel in the app." The <=90 ceiling was written when there were TWO — an onboarding
    // ruler and a bigger in-workout dial — which kept the ruler, the FIRST control the athlete ever
    // turns, the smaller of the two. Both names survive so call sites compile; they resolve to the
    // same measurement now, so the assertion that one was >= the other becomes the property that
    // actually matters: they are the SAME.
    expect(WHEEL_HEIGHT.md).toBeLessThanOrEqual(120); // …and never so tall it crowds the step
    expect(WHEEL_HEIGHT.lg).toBe(WHEEL_HEIGHT.md);
  });
});

describe('the route trace draws the shape the athlete actually ran', () => {
  it('draws nothing from nothing', () => {
    expect(projectRoute([], 300, 180, 18)).toBe('');
    expect(projectRoute([{ lat: 32.1, lon: 34.8 }], 300, 180, 18)).toBe('');
  });

  it('keeps every point, in order', () => {
    const route = [
      { lat: 32.0, lon: 34.0 },
      { lat: 32.001, lon: 34.001 },
      { lat: 32.002, lon: 34.0 },
    ];
    const d = projectRoute(route, 300, 180, 18);
    expect(d.startsWith('M')).toBe(true);
    expect(d.split('L').length).toBe(route.length); // one M + (n-1) L
  });

  it('stays inside the frame', () => {
    const route = Array.from({ length: 20 }, (_, i) => ({ lat: 32 + i * 0.001, lon: 34 + (i % 5) * 0.002 }));
    const pts = projectRoute(route, 300, 180, 18)
      .split(/[ML]/)
      .filter(Boolean)
      .map((p) => p.trim().split(' ').map(Number));
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(18 - 0.5);
      expect(x).toBeLessThanOrEqual(300 - 18 + 0.5);
      expect(y).toBeGreaterThanOrEqual(18 - 0.5);
      expect(y).toBeLessThanOrEqual(180 - 18 + 0.5);
    }
  });

  it('thins an hour-long run down to something a record can carry', () => {
    // GPS fires ~1/s: an hour is ~3,600 fixes, and every cardio record lives in ONE stored
    // value that History parses whole on open. Raw traces would put megabytes there.
    const hour = Array.from({ length: 3600 }, (_, i) => ({ lat: 32 + i * 1e-5, lon: 34 + i * 1e-5 }));
    const thin = simplifyRoute(hour);
    expect(thin.length).toBe(MAX_ROUTE_POINTS);
    // The start and the finish are EXACT — the two markers must land where the athlete did.
    expect(thin[0]).toEqual(hour[0]);
    expect(thin[thin.length - 1]).toEqual(hour[hour.length - 1]);
  });

  it('leaves a short route untouched', () => {
    const short = Array.from({ length: 40 }, (_, i) => ({ lat: 32 + i * 1e-4, lon: 34 }));
    expect(simplifyRoute(short)).toBe(short);
  });

  it('never drops a point out of order while thinning', () => {
    const run = Array.from({ length: 1000 }, (_, i) => ({ lat: 32 + i * 1e-5, lon: 34 }));
    const thin = simplifyRoute(run);
    for (let i = 1; i < thin.length; i++) expect(thin[i].lat).toBeGreaterThan(thin[i - 1].lat);
  });

  it('does NOT stretch a straight out-and-back into a square', () => {
    // A run due north: no east-west extent at all. A naive fit-to-box would spread the
    // single column of points across the full width and invent a shape that never happened.
    const route = Array.from({ length: 10 }, (_, i) => ({ lat: 32 + i * 0.001, lon: 34 }));
    const xs = projectRoute(route, 300, 180, 18)
      .split(/[ML]/)
      .filter(Boolean)
      .map((p) => Number(p.trim().split(' ')[0]));
    const spreadX = Math.max(...xs) - Math.min(...xs);
    expect(spreadX).toBeLessThan(0.5); // still a line, centred — not a smear
  });
});

describe('every milestone strikes a badge that means something', () => {
  const copy = (m: Milestone) => milestoneCopy(m, t, 'kg');

  it('gives a 60 kg bench and a 60 kg squat DIFFERENT badges', () => {
    const bench = copy({ id: 'club_bb_bench_press_60', family: 'club', value: 60, exerciseId: 'bb_bench_press' });
    const squat = copy({ id: 'club_bb_back_squat_60', family: 'club', value: 60, exerciseId: 'bb_back_squat' });
    expect(bench.value).toBe(squat.value); // same figure…
    expect(bench.glyph).not.toBe(squat.glyph); // …unmistakably different marks
    expect(bench.glyph).toBe('bench');
    expect(squat.glyph).toBe('squat');
  });

  it('engraves the OBJECT the tonnage copy promises', () => {
    expect(copy({ id: 'tonnage_250000', family: 'tonnage', value: 250_000 }).glyph).toBe('liberty');
    expect(copy({ id: 'tonnage_10000000', family: 'tonnage', value: 10_000_000 }).glyph).toBe('eiffel');
  });

  it('drops the medical-looking "+" from the first raise', () => {
    const raise = copy({ id: 'engine_first_raise', family: 'engine' });
    expect(raise.value).toBe(''); // an event, not a number
    expect(raise.glyph).toBe('raise');
  });

  it('leaves no mark in any family without a glyph', () => {
    const all: Milestone[] = [
      ...COUNT_THRESHOLDS.map((n): Milestone => ({ id: `count_${n}`, family: 'count', value: n })),
      ...TONNAGE_THRESHOLDS_KG.map((n): Milestone => ({ id: `tonnage_${n}`, family: 'tonnage', value: n })),
      // The club ladders are personal now (founder 2026-07-13), so every lift that can carry a
      // club for ANY athlete must have its own badge — the woman's set and the man's, together.
      ...[{ sex: 'female' as const }, { sex: 'male' as const }].flatMap((p) =>
        Object.entries(clubLadders(p)).flatMap(([exerciseId, ladder]) =>
          ladder.map((n): Milestone => ({ id: `club_${exerciseId}_${n}`, family: 'club', value: n, exerciseId })),
        ),
      ),
      { id: 'engine_first_raise', family: 'engine' },
      { id: 'engine_doubled_bb_bench_press', family: 'engine', exerciseId: 'bb_bench_press' },
    ];
    for (const m of all) expect(copy(m).glyph).toBeTruthy();
    // …and the clubs never fall back to the generic plate stack.
    const clubs = all.filter((m) => m.family === 'club');
    for (const m of clubs) expect(copy(m).glyph).not.toBe('plates');
  });
});
