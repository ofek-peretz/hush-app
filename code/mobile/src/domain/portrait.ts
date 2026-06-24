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
import type { Capability, ForecastRecord, PortraitSnapshot } from '@/data/local/models';
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
/** Actionable confidence (spec §5.7 R9): forecasts are permitted only at >= 70. */
export const ACTIONABLE_CONFIDENCE = 70;

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

/**
 * The weakest capability Hush can make an ACTIONABLE commitment about: the
 * lowest-scored capability whose confidence is >= 70 (spec §5.3 R9/R10 — never
 * forecast a low-confidence/still-learning capability). Needs >= 2 actionable
 * capabilities so a real gap exists. Null otherwise => no commitment, no
 * forecast (conviction or silence, §5.3 R12).
 */
export function forecastableLagging(s: PortraitSnapshot): Capability | null {
  const actionable = CAPABILITY_ORDER.filter(
    (c) => !isStillLearning(s, c) && s.confidence[c] >= ACTIONABLE_CONFIDENCE,
  );
  if (actionable.length < 2) return null;
  return actionable.sort((a, b) => s.perCapability[a] - s.perCapability[b])[0];
}

/** The {strongest, weakest-actionable} pair the commitment (and forecast) bind to. */
export function commitmentTargets(
  s: PortraitSnapshot,
): { strong: Capability; weak: Capability } | null {
  const strong = strongestConfident(s);
  const weak = forecastableLagging(s);
  if (!strong || !weak || strong === weak) return null;
  return { strong, weak };
}

/**
 * Commitment line (§4.8, revised). Names the strongest and the most-untapped
 * (weakest actionable) capability and commits to closing the gap — direction +
 * intent + commitment, NO timing (horizonless, ratified 2026-06-14). This line
 * IS the forecast (see buildPortraitForecast). Null if Hush cannot make an
 * actionable commitment — then it stays silent rather than hedge.
 */
export function commitmentLine(s: PortraitSnapshot): Line | null {
  const t = commitmentTargets(s);
  if (!t) return null;
  return {
    key: 'portrait.commitment',
    params: {
      strong: '$t(' + capabilityNameKey(t.strong) + ')',
      weak: '$t(' + capabilityNameKey(t.weak) + ')',
    },
  };
}

/**
 * Build the Portrait's gap-closing forecast record (PENDING) — HORIZONLESS
 * (ratified 2026-06-14): a falsifiable directional commitment with NO timeframe.
 * The prediction: the weakest-actionable capability reaches the level of the
 * capability immediately above it today. It resolves to a receipt WHEN the gap
 * closes (whenever that is); there is no deadline and therefore no timed miss.
 * Null if no actionable commitment can be made (same gate as the commitment line).
 */
export function buildPortraitForecast(
  s: PortraitSnapshot,
  id: string,
  _nowISO: string,
): ForecastRecord | null {
  const weak = forecastableLagging(s);
  if (!weak) return null;
  const rankedAsc = [...CAPABILITY_ORDER].sort((a, b) => s.perCapability[a] - s.perCapability[b]);
  const idx = rankedAsc.indexOf(weak);
  const neighborAbove = rankedAsc[idx + 1];
  const target = neighborAbove ? s.perCapability[neighborAbove] : s.perCapability[weak];
  return {
    id,
    type: 'portrait',
    capability: weak,
    predictedValue: target,
    dueSessionOrDate: 'open', // horizonless: resolves on gap-close, no deadline
    state: 'PENDING',
  };
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

