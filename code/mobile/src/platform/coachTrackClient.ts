/**
 * ════ THE COACH TRACK'S WIRE — every endpoint of `COACH_TRACK_V1.md §4`, typed (2026-09-17) ════
 *
 * Same worker, same session, same build-time URL as the circle and the pair
 * (`EXPO_PUBLIC_CIRCLE_URL` → `hush-identity`), through the one authenticated door
 * (`circleClient.identityRequest`) so a lapsed session signs out of all three at once.
 *
 * ── ⛔ NOTHING HERE THROWS, AND NOTHING HERE WAITS FOR EVER ──────────────────────────────────────
 * Every call answers `{ ok: true, … }` or `{ ok: false, error }` with a closed set of reasons the
 * screens can say in words. Every call is bounded (`TIMEOUT_MS`); the upload is the one caller that
 * runs after a save, and law 3 says no upload may ever stand between her and her next set.
 *
 * ── ⛔ THIS FILE SENDS WHAT IT IS HANDED ─────────────────────────────────────────────────────────
 * The allow-list is `domain/coachTrack.sessionToUpload`'s job and the server's again (law 4). This
 * file adds no field of its own — and it validates what COMES BACK, because a week that reaches the
 * phone is stored as the week she trains.
 */

//

import { circleAvailable, circleSignedIn, identityRequest, type IdentityAnswer } from '@/platform/circleClient';
import {
  validateEnvelope,
  validateWeekWire,
  type CardioUpload,
  type CoachWeekWire,
  type Consent,
  type SessionUpload,
  type WeekEnvelope,
} from '@/domain/coachTrack';

/** Short reads: a roster or a week is small, and a coach waiting 12 s on a spinner has left. */
export const TIMEOUT_MS = 10_000;
/** A batch of up to twenty workouts is the one large body — a little more time, still bounded. */
export const UPLOAD_TIMEOUT_MS = 15_000;

/** The refusals a screen can say in words. `network` covers offline, timeout and a 5xx. */
export type CoachTrackError =
  | 'bad_code'
  | 'seats_full'
  | 'already_linked'
  | 'self'
  | 'coach_not_configured'
  | 'signed_out'
  | 'not_found'
  | 'forbidden'
  | 'invalid'
  /** 409 — the 51st template (`COACH_TRACK_V1 §6`). */
  | 'templates_full'
  /** 429 — more than 20 open invites, or the per-IP limiter. */
  | 'too_many_invites'
  /** 503 `unavailable` — the database is in trouble; distinct from being offline. */
  | 'unavailable'
  | 'network';

export type CoachResult<T> = { ok: true; value: T } | { ok: false; error: CoachTrackError };

export interface CoachSelf {
  name: string;
  seats: number;
  used: number;
}

export interface AthleteOf {
  linkId: string;
  coachName: string;
  since: string;
  consent: Consent;
}

/**
 * ⛔ WHY `seat_limit` IS THE NUMBER IT IS (`COACH_TRACK_V1` §4 `PlanWire`, landed 2026-09-18).
 *
 * `null` for a coach who never bought anything — the free tier is the absence of a plan, not a
 * plan called free. `seats` is the ENFORCED number and always equals `CoachSelf.seats`; it is
 * repeated here so a screen reading the plan never has to reach for the other object to know what
 * it is talking about.
 *
 * ⚠️ `over_limit` IS DERIVED AT READ, never stored: the server raises it whenever `used > seats`,
 * which is a lapsed plan with three athletes and a 100→10 downgrade with thirty at the same time.
 * It is the one state that says something TRUE ABOUT HIS ROSTER rather than about his card, and
 * the app must never draw it as "your athletes were removed" — nothing is ever removed (§6).
 */
export interface CoachPlanState {
  /** One of `COACH_PRODUCT_IDS` — the tier Apple last confirmed. */
  productId: string;
  /** The enforced seat count. Identical to `CoachSelf.seats`. */
  seats: number;
  /** ISO, or null once nothing is running. */
  renewsAt: string | null;
  /** `grace` = Apple is retrying the card and the seats STAY. See the note above on `over_limit`. */
  state: 'active' | 'grace' | 'expired' | 'over_limit';
}

export interface CoachMe {
  coach?: CoachSelf;
  /** His subscription, as the worker last verified it with Apple. Absent = he never bought one. */
  plan?: CoachPlanState | null;
  athleteOf?: AthleteOf;
}

export interface CoachInvite {
  code: string;
  url: string;
  expiresAt: string;
}

export interface JoinAnswer {
  linkId: string;
  coachName: string;
  since: string;
  week?: WeekEnvelope;
}

export interface RosterEntry {
  linkId: string;
  name: string;
  sex?: 'male' | 'female';
  days?: number;
  since: string;
  weekVersion?: number;
  recent: SessionUpload[];
}

export interface AthleteDetail {
  linkId: string;
  name: string;
  sex?: 'male' | 'female';
  days?: number;
  since: string;
  consent: Consent;
  bodyweightKg?: number;
  week?: WeekEnvelope;
  sessions: SessionUpload[];
  cardio?: CardioUpload[];
}

export interface CoachTemplate {
  /** The server's id (`POST /coach/templates` upserts by name → `{template: {id, name, week, updatedAt}}`). */
  id?: string;
  name: string;
  week: CoachWeekWire;
  updatedAt?: string;
}

/** Is the coach track part of THIS build at all? (No URL → no door, and no call is ever made.) */
export function coachTrackAvailable(): boolean {
  return circleAvailable();
}

/** Does this phone hold an identity session? Gates every call the store makes on its own. */
export async function coachTrackSignedIn(): Promise<boolean> {
  return circleSignedIn();
}

const KNOWN: ReadonlySet<string> = new Set([
  'bad_code', 'seats_full', 'already_linked', 'self', 'coach_not_configured', 'templates_full', 'too_many_invites', 'unavailable',
]);
/*
 * The server's finer words (§6, 2026-09-17), folded onto the coarse ones the outbox already keys on:
 * `not_linked` IS "the link is gone" (`pullCoachWeek` forgets the link on `not_found`), `not_coach` is
 * the 403 it always was, and both bad-body refusals are `invalid` — a screen says the same sentence.
 */
const FOLDED: Readonly<Record<string, CoachTrackError>> = {
  not_linked: 'not_found',
  not_found: 'not_found',
  not_coach: 'forbidden',
  bad_week: 'invalid',
  bad_request: 'invalid',
};

/** The worker's refusal, as a word. The body's `error` wins when it is one we know; else the status. */
export function errorOf(a: Extract<IdentityAnswer<unknown>, { ok: false }>): CoachTrackError {
  if (a.signedOut) return 'signed_out';
  const said = a.body && typeof a.body.error === 'string' ? a.body.error : null;
  if (said && KNOWN.has(said)) return said as CoachTrackError;
  // (A worker deployed without its D1 binding says `coach_not_configured` — caught above, and kept
  // distinct from `network`, because "the server is not set up" and "you are offline" differ.)
  // ⚠️ A 5xx is `network` BEFORE the folded words are read: a proxy's 503 carrying `not_found` must
  // never read as "the link is gone" — `pullCoachWeek` forgets the link on that (law 6).
  if (a.status === 0 || a.status >= 500) return 'network';
  if (said && FOLDED[said]) return FOLDED[said];
  if (a.status === 429) return 'too_many_invites';
  if (a.status === 404) return 'not_found';
  if (a.status === 403) return 'forbidden';
  if (a.status === 400 || a.status === 413 || a.status === 422) return 'invalid';
  return 'network';
}

async function req<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS,
): Promise<CoachResult<T>> {
  const a = await identityRequest<T>(path, { method, ...(body !== undefined ? { body } : {}), timeoutMs });
  if (!a.ok) return { ok: false, error: errorOf(a) };
  return { ok: true, value: a.body };
}

const q = (linkId: string) => encodeURIComponent(linkId);

/** Validate a week the worker answered with — a malformed one is refused, never stored. */
function envelopeOrInvalid<T extends { week?: unknown }>(r: CoachResult<T>): CoachResult<T> {
  if (!r.ok || r.value?.week === undefined || r.value.week === null) return r;
  const v = validateEnvelope(r.value.week);
  if (!v.ok) return { ok: false, error: 'invalid' };
  return { ok: true, value: { ...r.value, week: v.value } };
}

/* ── anyone signed in ─────────────────────────────────────────────────────────────────────────── */

export function coachMe(): Promise<CoachResult<CoachMe>> {
  return req<CoachMe>('GET', '/coach/me');
}

export function coachEnroll(name: string): Promise<CoachResult<{ coach: CoachSelf }>> {
  return req('POST', '/coach/enroll', { name });
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE CLIENT TELLS THE SERVER ABOUT A PURCHASE. IT NEVER TELLS THE SERVER HOW MANY SEATS IT HAS.
 *
 * Seats are enforced on the worker, from `coaches.seat_limit`, and `/coach/join` checks that column
 * and nothing the phone said (`COACH_TRACK_V1 §6`). This call carries only what Apple issued — the
 * product id and the original transaction id — and the ANSWER is the coach row as the worker now
 * sees it. If the worker refuses, or is an older deploy that has never heard of this path, the
 * screen says the purchase stands and the seats have not opened yet. What it must never do is
 * decide locally that it now has thirty seats: a phone that can raise its own limit is a phone that
 * can be told to, and every seat past the free two would be free to anyone with a debugger.
 *
 * ⛔ THE WORKER BUILT IT (2026-09-18, `server/hush-identity/src/coach.ts` + `migrations/0002`).
 * It verifies the transaction with Apple's App Store Server API, refuses a body that names a tier
 * Apple did not sign (`plan_mismatch`), refuses a transaction another coach already holds
 * (`plan_claimed`, behind a partial UNIQUE index), and answers the coach row AND the plan. Apple's
 * server notifications move `seat_limit` afterwards without this call — which is why the screen
 * reads the seats back from `/coach/me` and never computes them. The five-step note that stood
 * here is done; the RULE it existed to protect is the paragraph above, and that one stays.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
export function coachClaimPlan(claim: {
  /** One of `COACH_PRODUCT_IDS` (platform/billing) — the worker re-checks it against Apple. */
  productId: string;
  /** Apple's `originalTransactionId`. Absent only when StoreKit reported none. */
  transactionId?: string;
}): Promise<CoachResult<{ coach: CoachSelf; plan?: CoachPlanState | null }>> {
  return req('POST', '/coach/plan', claim);
}

/* ── the coach ───────────────────────────────────────────────────────────────────────────────── */

export function coachInvite(): Promise<CoachResult<CoachInvite>> {
  return req('POST', '/coach/invite');
}

export function coachRoster(): Promise<CoachResult<{ athletes: RosterEntry[] }>> {
  return req('GET', '/coach/roster');
}

export async function coachAthlete(linkId: string): Promise<CoachResult<AthleteDetail>> {
  return envelopeOrInvalid(await req<AthleteDetail>('GET', `/coach/athlete?l=${q(linkId)}`));
}

/** Send a week. Validated on the phone first — a week the server must refuse is never sent. */
export async function coachSendWeek(linkId: string, week: CoachWeekWire): Promise<CoachResult<{ version: number; sentAt: string }>> {
  const v = validateWeekWire(week);
  if (!v.ok) return { ok: false, error: 'invalid' };
  return req('PUT', `/coach/athlete/week?l=${q(linkId)}`, { week: v.value });
}

export function coachRemoveAthlete(linkId: string): Promise<CoachResult<{ ok: boolean }>> {
  return req('POST', `/coach/athlete/remove?l=${q(linkId)}`);
}

export function coachTemplates(): Promise<CoachResult<{ templates: CoachTemplate[] }>> {
  return req('GET', '/coach/templates');
}

export async function coachSaveTemplate(name: string, week: CoachWeekWire): Promise<CoachResult<{ template?: CoachTemplate }>> {
  const v = validateWeekWire(week);
  if (!v.ok) return { ok: false, error: 'invalid' };
  return req('POST', '/coach/templates', { name, week: v.value });
}

export function coachDeleteTemplate(name: string): Promise<CoachResult<{ ok: boolean }>> {
  return req('POST', '/coach/templates/delete', { name });
}

/* ── the trainee ─────────────────────────────────────────────────────────────────────────────── */

export async function coachJoin(input: {
  code: string;
  name: string;
  sex?: 'male' | 'female';
  days?: number;
  consent: Consent;
}): Promise<CoachResult<JoinAnswer>> {
  return envelopeOrInvalid(await req<JoinAnswer>('POST', '/coach/join', input));
}

/** The week, only when newer than `since` — `week` absent means she already holds the latest. */
export async function traineeWeek(since: number): Promise<CoachResult<{ week?: WeekEnvelope }>> {
  return envelopeOrInvalid(await req<{ week?: WeekEnvelope }>('GET', `/me/coach/week?since=${Math.max(0, Math.floor(since))}`));
}

export function traineeUpload(sessions: SessionUpload[], cardio?: CardioUpload[]): Promise<CoachResult<{ accepted: number }>> {
  return req('POST', '/me/coach/sessions', { sessions, ...(cardio && cardio.length ? { cardio } : {}) }, UPLOAD_TIMEOUT_MS);
}

export function traineeConsent(consent: Consent): Promise<CoachResult<{ ok: boolean }>> {
  return req('POST', '/me/coach/consent', { consent });
}

export function traineeLeave(): Promise<CoachResult<{ ok: boolean }>> {
  return req('POST', '/me/coach/leave');
}
