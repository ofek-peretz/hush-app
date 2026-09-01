/**
 * ════ THE WIRE FOR HER PLAN'S REVIEW — the second sanctioned AI surface ════
 *
 * Founder, 2026-08-25: *"אפשר להוסיף אפשרות לחוות דעת מהבינה מלאכותית על התוכנית."*
 *
 * One function, one call, fired by HER TAP in the plan builder and nowhere else. It inherits the
 * import's whole discipline (`theAiHasOneJob` pins this file beside it): the model READS the draft
 * she built and answers with suggestions (`domain/planReview`); it cannot author a programme —
 * `PLAN_REVIEW_SCHEMA` has no `sessions` — and nothing here writes a `CoachPlan` or touches disk.
 *
 * The sheet it sends is the coach's ordinary sheet: her profile, her history, and the DRAFT as
 * `facts.programme` (via `coachPlanFromProgram`, so the coach sees exactly the week she is looking
 * at, engine-priced loads included). No conversation state — a review is one question.
 */

//

import { db } from '@/data/local/db';
import { fixtureModel } from '@/data/api/fixtureModel';
import type { Program } from '@/data/local/models';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { coachPlanFromProgram, bandFromChoice } from '@/domain/enginePlan';
import { parsePlanReview, PLAN_REVIEW_SCHEMA, type PlanReview } from '@/domain/planReview';
import { currentLocale } from '@/i18n';
import { askCoach, type CoachFailure } from '@/platform/coach/coachClient';

export type PlanReviewResult =
  | { ok: true; review: PlanReview }
  | { ok: false; reason: CoachFailure | 'not_json' | 'nothing_said' };

/** Ask the coach's opinion on a DRAFT week she built. Never throws; never retries; never writes. */
export async function requestPlanReview(draft: Program): Promise<PlanReviewResult> {
  const [profile, history, brief] = await Promise.all([
    db.loadProfile().catch(() => null),
    db.loadHistory().catch(() => []),
    db.loadCoachBrief().catch(() => undefined),
  ]);
  if (!profile) return { ok: false, reason: 'not_configured' };

  // The draft, as the coach's own plan vocabulary — loads are the engine's decided targets where
  // history exists, so the reviewer sees the same numbers she will lift.
  const targets = await fixtureModel
    .sessionTargets({ programDayId: draft.days[0]?.id ?? '', completedSessions: 0 })
    .catch(() => []);
  const plan = coachPlanFromProgram(draft, targets, bandFromChoice(profile.repBand));

  const facts = coachFacts({
    profile,
    plan,
    history,
    ...(brief?.length ? { brief } : {}),
    language: currentLocale(),
  });

  const reply = await askCoach(coachRequest({ facts, ask: { kind: 'plan_review' }, cache: true }), PLAN_REVIEW_SCHEMA);
  if (!reply.ok) return { ok: false, reason: reply.reason };
  const parsed = parsePlanReview(reply.text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, review: parsed.review };
}
