/**
 * ════ THE WIRE FOR A WEEK THE MODEL WRITES — the third sanctioned AI surface ════
 *
 * ⛔ FOUNDER, 2026-08-29: *"אני יודע שאם נחזיר את הבינה לבניית התוכנית זה שינוי בחזרה אבל האמת
 * שלבנות עם הבינה זה הכי כיף וקצר וקולע."*
 *
 * He is right that it is a reversal, and it is the reversal of a LATENCY decision rather than of a
 * principle. The 2026-08-10 removal said so in its own words: the two-call split *"existed to make
 * a ninety-second wait survivable"*, and the honest fix was to stop making the call. The wait had
 * a measured cause — 35,000 characters of preamble, a four-deep schema, a hedge that fired two more
 * whole calls — and `domain/buildPrompt` removes every one of them. What comes back is a fast call,
 * not the old one.
 *
 * ── WHAT THIS SURFACE MAY AND MAY NOT DO ───────────────────────────────────────────────────────
 * It inherits the import's and the review's whole discipline, and `theAiHasOneJob` pins it beside
 * them:
 *
 *   · fired by HER TAP on one door of the builder ("build a programme for me") and nowhere else;
 *   · it writes NO `CoachPlan` and touches no disk — the reply becomes a builder DRAFT she is
 *     looking at, and the only thing that reaches storage is a week she sealed herself;
 *   · it cannot prescribe: `BUILD_WEEK_SCHEMA` has no load, no reps and no rest field, so the
 *     engine's three jobs are structurally out of its reach;
 *   · and it never strands her — every failure is a REASON, and the caller falls through to the
 *     local assembler, which is what this door did on its own until today.
 *
 * ⚠️ ONE RETRY, AND ONLY FOR A TRUNCATED STREAM (2026-08-30). Every other failure falls back
 * instantly — the worker already hedges, and a retry on top of a hedge is how one tap becomes six
 * calls. A truncation is the one failure that is neither the model's nor the network's opinion
 * about anything: measured at ONE CALL IN FIVE, it is a stream that died mid-sentence, and the same
 * request a second later simply works. Silently handing her a locally-assembled week instead — on
 * a fifth of the builds, on the door whose whole promise is that the model wrote it — is the wrong
 * trade against six more seconds.
 */

//

import { readCoachWeek, type CoachWeekDraft } from '@/domain/coachDraft';
import { buildWeekRequest } from '@/domain/buildPrompt';
import { currentLocale } from '@/i18n';
import { askCoach, type CoachFailure, type CoachReply } from '@/platform/coach/coachClient';
import { BUILD_EVENTS } from '@/platform/events';
import { track } from '@/platform/telemetry';

export type PlanBuildResult =
  | { ok: true; week: CoachWeekDraft }
  | { ok: false; reason: CoachFailure | 'not_json' | 'nothing_said' | 'too_slow' };

/**
 * ⛔ HOW LONG THE INTAKE MAY EVER WAIT ON THIS CALL (founder 2026-08-30, describing the freeze:
 * *"באנימציה זה אפילו לא הראה איזה תרגילים זה מכניס ולבסוף זה פשוט נתקע"*).
 *
 * `coachClient` aborts at **180 seconds**, and that number is right for what it was chosen for — a
 * conversational turn the athlete is watching a typing indicator for, where hanging up on an answer
 * that is still coming is worse than waiting. It is catastrophically wrong here.
 *
 * This call sits under `BuildingProgramme`, whose rows stand as DASHES until an answer lands. So a
 * slow call is not a slow screen, it is a DEAD one: a dark body and empty rows, on the last step of
 * the intake, with the back gesture correctly disabled. Three minutes of that — six, once the
 * truncation retry doubled it — is indistinguishable from a crash, and it is what he met.
 *
 * ── ⛔ AND THE NUMBER IS THE ANIMATION'S OWN LENGTH, WHICH IS THE WHOLE IDEA ────────────────────
 * `BuildingProgramme` lights a muscle at a time WHETHER OR NOT the model has answered — *"the
 * muscles are ours to know"* — so the first stretch of the wait is already paid for: it is a beat
 * the screen was always going to play. Seven placeholder muscles at `beatFor(2)` apiece, after the
 * opening, is **13.0 seconds** of screen that is alive with nothing in hand.
 *
 * Then the ticker reaches the last muscle and STOPS. From that instant the wait buys nothing at
 * all: every further second is a static screen — every muscle lit, every row a dash, no motion —
 * on the last step of the intake with the back gesture correctly disabled. At the client's 180s
 * that was **167 seconds of a dead screen**, which is what the founder met and reported as frozen.
 *
 * So the model gets exactly the time the animation was going to take, and not one second more.
 * Past the beat there is no free time left to spend, and the local assembler answers instantly —
 * the screen fills at 13 seconds either way, and the only thing a slow call costs is WHOSE week
 * she gets, never a second of her attention.
 *
 * ⚠️ MEASURED AGAINST IT: 4.7–8.7s across ~40 live runs, slowest 13.5. The overlap is near-exact,
 * which is why this is a coincidence worth locking rather than a threshold worth tuning —
 * `theModelWritesAWeekSheCanEdit` recomputes the beat from the screen's own constants and fails if
 * the two ever drift apart.
 */
export const PLAN_BUILD_BUDGET_MS = 13_000;
/**
 * ⛔ AND SHE WAITS LONGER ONLY WHEN SHE HAS SOMETHING TO LOSE (2026-08-30).
 *
 * ⚠️ MEASURED ON THE PRODUCTION WORKER, 16 consecutive builds, one attempt each:
 *
 *     4.6  4.7✗  5.1  6.1  6.3  6.4✗  7.3  8.2  8.4  8.8  11.6  13.1  16.4  19.1  21.5  3.4✗
 *
 * Median 8.4s, and a long tail. At 13s **nine of sixteen** land in time; the rest fall through to
 * the local assembler, and her sentence reaches nobody.
 *
 * The founder's bar is *"קצר בזמן"*, and raising a flat budget looks like breaking it. It is not,
 * and the distribution is why: **the median call is unaffected by the ceiling.** A budget only
 * ever costs time to the calls that are ALREADY slow — which are exactly the athletes who would
 * otherwise be handed a week their own words never touched. The waiting falls on the people it
 * buys something for.
 *
 * ⚠️ BUT ONLY IF THERE ARE WORDS. An athlete who pressed through the ask step without writing a
 * line is asking for the same week the local assembler produces instantly. Making her wait 19
 * seconds to be told the same thing is pure cost, so she keeps the short budget. This is the whole
 * reason the two constants exist rather than one raised number.
 *
 * ⛔ AND IT IS CAPPED BY THE COVER, NOT CHOSEN. 18.8s is the placeholder walk's own length
 * (`OPENING_MS` + 9 × `beatFor(PLACEHOLDER_LIFTS)`) — past it the screen has nothing left to draw
 * and goes static, which is the freeze this whole area was rebuilt to remove. The law recomputes
 * both from source and fails if the budget ever outgrows the drawing.
 */
export const PLAN_BUILD_SAID_MS = 18_500;

/**
 * Ask the model for a week. Never throws; never retries; never writes.
 *
 * ⚠️ IT TAKES HER FOUR FACTS AS ARGUMENTS RATHER THAN READING A PROFILE, because at the moment
 * this fires there IS no profile: it is onboarding step 3, and `completeOnboarding` does not run
 * until `ProgramCreated`. The relay is the only thing that knows her, which is the same reason
 * `PlanBuilder` reads `route.params.inputs` for the figure it draws demonstrations with.
 */
export async function requestPlanBuild(her: {
  daysPerWeek: number;
  sex: 'female' | 'male';
  weightKg?: number;
  /** Her own instruction, when she wrote one. Empty is the ordinary case and is not sent. */
  ask?: string;
}): Promise<PlanBuildResult> {
  const locale = currentLocale() === 'he' ? 'he' : 'en';
  const req = buildWeekRequest({ ...her, locale });
  /* ⚠️ THE SCHEMA COMES OFF THE REQUEST, never re-imported here. One place decides what the model
     may say, and it is the file that also decides what it is told — the two drifting apart is the
     exact failure `thePromptAndTheSchemaAgree` exists to catch. */
  /* ⚠️ THE THINKING LEVEL COMES OFF THE REQUEST TOO, for the same reason the schema does: one file
     decides what the model is told, what it may say, and how hard it thinks — and `buildPrompt`
     carries the measurement that chose it. */
  /*
   * ⚠️ THE BUDGET IS THE WHOLE ATTEMPT, NOT ONE CALL. A retry that started inside the budget may
   * not run past it — the athlete is watching one screen, and she does not care that the second
   * call was cheap.
   *
   * ⚠️ AND `Promise.race` DOES NOT CANCEL THE LOSER. The request keeps going and the Worker keeps
   * answering; we simply stop waiting for it. That is correct here — a build we abandoned is paid
   * for either way, and the alternative is threading an AbortController through a transport shared
   * with the import for no gain she can see.
   */
  const startedAt = Date.now();
  /* Her own words are the only thing that buys the longer wait — see `PLAN_BUILD_SAID_MS`. */
  const budget = her.ask?.trim() ? PLAN_BUILD_SAID_MS : PLAN_BUILD_BUDGET_MS;
  const left = () => budget - (Date.now() - startedAt);
  /** The reply, or `null` when the budget ran out first — never a reply-shaped lie about a timeout. */
  const within = async (work: Promise<CoachReply>): Promise<CoachReply | null> => {
    const ms = left();
    if (ms <= 0) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clock = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
    try {
      return await Promise.race([work, clock]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const ask1 = () => askCoach({ v: req.v, blocks: req.blocks }, req.schema, req.think);
  let reply = await within(ask1());
  /*
   * ⛔ ONCE, AND ONLY ON `truncated` — see the note in the header. The bound is a literal second
   * attempt rather than a loop, because the failure it answers is transient and a loop against a
   * genuinely broken stream is how one tap becomes a bill.
   *
   * ⚠️ AND ONLY IF THE BUDGET CAN AFFORD IT. A truncation at second 20 is not worth a second call
   * she will never see the answer to — `within` returns the fallback immediately once time is out.
   */
  if (reply && !reply.ok && reply.reason === 'truncated' && left() > 4_000) {
    void track(BUILD_EVENTS.truncated, { daysPerWeek: her.daysPerWeek });
    reply = await within(ask1());
  }
  if (!reply) return { ok: false, reason: 'too_slow' };
  if (!reply.ok) return { ok: false, reason: reply.reason };

  let json: unknown;
  try {
    json = JSON.parse(reply.text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const week = readCoachWeek(json);
  if (!week) return { ok: false, reason: 'nothing_said' };

  /*
   * ⛔ THE CATALOGUE'S OWN SHOPPING LIST (founder 2026-08-29): *"אם כן נוסיף עוד תרגילים ככל
   * שנצטרך."*
   *
   * The model names the lifts it wanted and could not find; this is the only place that fact is
   * ever visible. Counted, not acted on — nothing downstream reads it into her week — so a gap in
   * the catalogue stops being a week quietly worse than the one that was meant, and becomes a name
   * with a number beside it.
   *
   * ⚠️ FIRE-AND-FORGET, AND IT MUST BE. A telemetry write may never delay a programme or fail one:
   * `track` swallows its own errors, and the `void` here says the answer does not wait for it.
   */
  if (week.missing.length > 0) {
    void track(BUILD_EVENTS.catalogueGap, { wanted: week.missing, days: her.daysPerWeek });
  }
  return { ok: true, week };
}
