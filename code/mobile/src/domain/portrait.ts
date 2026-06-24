/**
 * Capability Portrait logic (spec §4.8, §2.4, §2.10/§2.11, §7.10; UX §2).
 *
 * The Portrait carries NO numbers. Bars are relative-to-standard lengths; the
 * meaning (strongest, lagging, still-learning, ordering changes) is expressed
 * in words and position only (UX Law 9/12, §8.3 VoiceOver).
 *
 * Confidence is an internal model value, NEVER displayed. A capability below
 * the data threshold is "still learning" and is excluded from commitments and
 * median/imbalance math (spec §5.7, §7.9).
 */
import type { Capability, PortraitSnapshot } from '@/data/local/models';
import type { Line } from '@/domain/voice';

/** Fixed render order, top to bottom (bars draw in this sequence). */
export const CAPABILITY_ORDER: Capability[] = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'knee_dominant',
  'hip_dominant',
];

/** Internal confidence tier (spec §5.7). Below 30 => still learning. */
const STILL_LEARNING_CONFIDENCE = 30;

export function capabilityNameKey(c: Capability): string {
  return `capability.${c}`;
}

export function isStillLearning(s: PortraitSnapshot, c: Capability): boolean {
  return s.stillLearning[c] || s.confidence[c] < STILL_LEARNING_CONFIDENCE;
}

/**
 * Bar fill fraction (0..1), normalized RELATIVE to the athlete's strongest
 * CONFIDENT capability (ratified 2026-06-14, Decision 2). The Portrait is a
 * relative internal profile — "how my capabilities compare to each other," NOT
 * a population comparison, percentile, score, or strength standard. The strongest
 * confident capability is the reference (1.0); everything else scales against it.
 *
 * Because it is purely relative, the absolute scale of the model's score is
 * irrelevant — raw latent scores and any other monotonic encoding both work.
 * No number is ever shown from this.
 */
export function barFraction(s: PortraitSnapshot, c: Capability): number {
  const ref = strongestConfident(s);
  const denom = ref
    ? s.perCapability[ref]
    : Math.max(...CAPABILITY_ORDER.map((k) => s.perCapability[k]), Number.EPSILON);
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(1, s.perCapability[c] / denom));
}

/** Confident capabilities only (still-learning excluded), sorted strongest first. */
function confidentRanked(s: PortraitSnapshot): Capability[] {
  return CAPABILITY_ORDER.filter((c) => !isStillLearning(s, c)).sort(
    (a, b) => s.perCapability[b] - s.perCapability[a],
  );
}

/** The commitment is built around the strongest CONFIDENT capability (§2.10). */
export function strongestConfident(s: PortraitSnapshot): Capability | null {
  return confidentRanked(s)[0] ?? null;
}

/** The lagging (weakest confident) capability — "the most room" (§8.3). */
export function laggingConfident(s: PortraitSnapshot): Capability | null {
  const r = confidentRanked(s);
  return r.length > 0 ? r[r.length - 1] : null;
}

/** Full rank (all capabilities) strongest-first, ignoring confidence. */
function rankAll(s: PortraitSnapshot): Capability[] {
  return [...CAPABILITY_ORDER].sort((a, b) => s.perCapability[b] - s.perCapability[a]);
}

/** A relative-state phrase key for a capability's place among the five (§4.8 compare). */
export function stateKeyFor(s: PortraitSnapshot, c: Capability): string {
  const rank = rankAll(s).indexOf(c); // 0..4
  return [
    'portrait.stateStrongest',
    'portrait.stateSecond',
    'portrait.stateMid',
    'portrait.stateFourth',
    'portrait.stateWeakest',
  ][rank];
}

/**
 * Compare proof (§4.8): the capability that was the athlete's WEAKEST at the
 * baseline, and where it stands now — relative internal restructuring, with NO
 * timeframe (horizonless, ratified 2026-06-14). Null if no usable baseline.
 */
export function compareProof(baseline: PortraitSnapshot, current: PortraitSnapshot): Line | null {
  const baselineWeakest = rankAll(baseline)[rankAll(baseline).length - 1];
  if (!baselineWeakest) return null;
  return {
    key: 'portrait.compareProof',
    params: {
      capability: '$t(' + capabilityNameKey(baselineWeakest) + ')',
      state: '$t(' + stateKeyFor(current, baselineWeakest) + ')',
    },
  };
}

