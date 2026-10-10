/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK — a coach writes the week, FERROX runs the loads. (2026-09-17)
 *
 * The contract is `docs/architecture/COACH_TRACK_V1.md`; this file is its server half, and where the
 * two disagree the doc is corrected, not quietly overridden. `index.ts` resolves the session to a
 * `sub` and hands every `/coach/…` and `/me/coach/…` path here.
 *
 * ── WHAT IT HOLDS ───────────────────────────────────────────────────────────────────────────────
 * D1 (`COACH_DB`, database `ferrox-coach`, schema `migrations/0001_coach.sql`): coaches, the links
 * between a coach and a trainee, single-use invites, the weeks a coach sends, and what a trainee's
 * phone uploads after each saved workout.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────────────────
 * · ⛔ TELL A COACH WHO A TRAINEE IS. The trainee's `sub` is written once, into `coach_links`, and
 *   no statement in this file ever SELECTs it. A coach addresses a trainee by `linkId` and nothing
 *   else — the name on the roster is the one she typed when she joined.
 * · ⛔ STORE ANYTHING THE WIRE DID NOT NAME (law 4). Every inbound payload is rebuilt field by field
 *   by the pure readers below; unknown keys are dropped whatever the client sent, and a payload that
 *   breaks a bound is refused rather than trimmed into something the coach did not write.
 * · ⛔ SHOW ANYTHING FROM BEFORE THE LINK, OR AFTER IT (laws 4, 6). An upload older than the link's
 *   `since` is dropped at the door, and every coach read filters `ended_at IS NULL` — an unlink
 *   takes access away on the very next request, not at the purge.
 * · ⛔ KEEP BODYWEIGHT OR CARDIO WITHOUT HER SAY-SO. Consent is checked when the upload is written
 *   AND when a coach reads it; withdrawing it erases what was stored under it.
 * · ⛔ CARRY PROSE (law 7). A per-lift `note` of at most 140 characters is the only free text a
 *   coach sends. There is no message table, and there is not going to be one.
 * · Pass internal error text to the caller. D1 trouble is `503 unavailable`, nothing more.
 * · ⛔ BELIEVE A PHONE ABOUT MONEY (2026-09-18). `POST /coach/plan` carries a product id and a
 *   transaction id and NOTHING ELSE that matters: the seat count comes from `COACH_TIER_SEATS` in
 *   `./appleBilling.ts`, keyed by the product id APPLE signed, after that file has walked the
 *   certificate chain to Apple's own root. A body that says "100 seats" changes nothing at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/*
 * ⛔ TYPES ONLY, AND THAT IS ON PURPOSE. This file imports no VALUE from anywhere: `index.ts` hands
 * it the invite alphabet (`InviteCodes`) and Apple's half (`BillingGate`) rather than this file
 * reaching for either. It is what lets the laws transpile `src/coach.ts` on its own and RUN the
 * readers — a law that only grepped for a 140 would pass on a 140 in a comment.
 */
import type { AppleBillingEnv, PlanState, VerifiedPlan } from './appleBilling.ts';

export interface CoachEnv extends AppleBillingEnv {
  /**
   * ⚠️ OPTIONAL, AND THAT IS THE DEPLOY SAFETY. A deployment without the database (the binding
   * commented out, or a worker deployed before the founder ran `d1 create`) answers every coach
   * route `503 coach_not_configured` — and the circle, the pair and sign-in carry on untouched.
   */
  COACH_DB?: D1Database;
  /** Linked trainees a coach gets before paying (founder ruling 1). Absent/garbage = 2. */
  COACH_FREE_SEATS?: string;
}

/** The invite alphabet lives in `index.ts`; it is handed in rather than copied, so there is one. */
export interface InviteCodes {
  random(): string;
  safe(raw: string): string;
  length: number;
}

/**
 * ⛔ APPLE'S HALF, HANDED IN — `./appleBilling.ts` behind three methods, so this file stays free of
 * value imports (see the note at the top) and so the ONE place that decides "Apple said yes" is a
 * file of its own to audit.
 */
export interface BillingGate {
  /**
   * ⛔ THE SEAT COUNT OF A PRODUCT ID — null when it is not one of the three coach tiers. The table
   * lives in `appleBilling.ts` and is read with the product id APPLE signed, never the body's.
   */
  seats(productId: string): number | null;
  /** Are the `APPLE_IAP_*` secrets present? Absent → 503 `billing_not_configured`, and no log. */
  configured(): boolean;
  /**
   * Ask Apple about this transaction. Null = Apple knows no such transaction, or it is not one of
   * ours. THROWS when Apple could not be reached — "we could not check" is never "it is not valid".
   */
  verify(transactionId: string): Promise<VerifiedPlan | null>;
  /**
   * The local driver's injection. Null unless BOTH locks in `appleBilling.ts` opened (a var no
   * deployment has, AND a loopback hostname) and `signature` is its HMAC over `message`.
   */
  test(raw: unknown, message: string, signature: string | null): Promise<VerifiedPlan | null>;
}

/**
 * The plan as `/coach/me` and `/coach/plan` answer it (COACH_TRACK_V1 §4).
 *
 * ⛔ `over_limit` IS NOT A STORED STATE. It is derived, every time, from `used > seats` — a coach
 * whose plan lapsed with three athletes on it, and a coach who moved from 30 seats to 10 with
 * twenty athletes on it, are the same situation and get the same word. Nothing about it deletes a
 * link or a week; it takes the invite button and nothing else.
 */
export interface PlanWire {
  productId: string;
  seats: number;
  renewsAt: string | null;
  state: PlanState | 'over_limit';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A coach invite is single-use and dies after a week (spec §4). */
export const INVITE_TTL_MS = 7 * DAY_MS;
/** ⛔ LAW 6: an ended link's rows outlive it by thirty days, and not one day more. */
export const PURGE_AFTER_MS = 30 * DAY_MS;
/** The roster's window onto each athlete (spec §4). */
const ROSTER_WINDOW_MS = 14 * DAY_MS;
const MAX_TEMPLATES = 50;
/** Unused, unexpired invites a coach may hold at once — a table that cannot be filled by a loop. */
const MAX_OPEN_INVITES = 20;
/** Week versions kept per link. The phone only ever needs the newest; a few back is for support. */
const KEEP_WEEK_VERSIONS = 20;
const MAX_BODY_BYTES = 256 * 1024;
/** Where an invite link points — the product's domain, which answers `/c/CODE` (brand/landing). */
const INVITE_ORIGIN = 'https://getferrox.com';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const iso = (ms: number): string => new Date(ms).toISOString();

// ════════════════════════════ THE WIRE (spec §3) ════════════════════════════

export interface CoachLiftWire {
  ex: string;
  sets: number;
  band: [number, number];
  note?: string;
  pairNext?: boolean;
}
export interface CoachWeekWire {
  v: 1;
  title?: string;
  days: Array<{ name: string; lifts: CoachLiftWire[] }>;
}
export interface WeekEnvelope {
  version: number;
  sentAt: string;
  coachName: string;
  week: CoachWeekWire;
}
export interface SessionSetWire {
  ex: string;
  load: number | null;
  reps: number;
}
export interface SessionUpload {
  id: string;
  at: string;
  day: string;
  weekVersion?: number;
  minutes: number;
  early: boolean;
  sets: SessionSetWire[];
  swaps?: Array<{ from: string; to: string }>;
  skipped?: string[];
  pain?: string[];
  bodyweightKg?: number;
}
export interface CardioUpload {
  id: string;
  at: string;
  kind: 'run' | 'walk';
  metres: number;
  seconds: number;
}
export interface Consent {
  bodyweight: boolean;
  cardio: boolean;
}

// ════════════════════════════ THE READERS — pure, and the whole of law 4 ════════════════════════════
//
// Each one takes `unknown` and returns a NEW object built from the named fields, or null. None of
// them spreads, copies or returns its input. Length is counted in UTF-16 units, as JS counts it —
// the same `.length` the app's editor caps with.

export const EXERCISE_ID = /^[a-z0-9_]{1,64}$/;
/** The week's bounds, named once — the law reads these. */
export const WEEK_LIMITS = { title: 60, days: 7, dayName: 40, lifts: 14, sets: 10, band: 50, note: 140 } as const;
export const UPLOAD_LIMITS = { batch: 20, id: 64, day: 40, minutes: 600, sets: 120, load: 1000, reps: 100, swaps: 14, skipped: 14, pain: 6, painArea: 24 } as const;
export const NAME_MAX = 40;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
// eslint-disable-next-line no-control-regex
const CONTROL = /[ -]/g;

/**
 * A bounded piece of text: controls stripped, trimmed, at most `max`. Returns null when it is not a
 * string or is too long — over-long is REFUSED, never cut: a coach's cue with its last words sawn
 * off is a different cue, and the editor that let it through is the bug worth hearing about.
 */
export function readText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(CONTROL, '').trim();
  return s.length <= max ? s : null;
}

const readExId = (v: unknown): string | null => (typeof v === 'string' && EXERCISE_ID.test(v) ? v : null);

/** A person's name as a coach or a trainee typed it — required, ≤ 40. */
export function readName(v: unknown): string | null {
  const s = readText(v, NAME_MAX);
  return s ? s : null;
}

/** A week as a coach sends it (spec §3 `CoachWeekWire`). Any broken bound refuses the whole week. */
export function readCoachWeek(raw: unknown): CoachWeekWire | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const week: CoachWeekWire = { v: 1, days: [] };
  if (raw.title !== undefined) {
    const title = readText(raw.title, WEEK_LIMITS.title);
    if (title === null) return null;
    if (title) week.title = title;
  }
  if (!Array.isArray(raw.days) || raw.days.length < 1 || raw.days.length > WEEK_LIMITS.days) return null;
  for (const d of raw.days) {
    if (!isObj(d)) return null;
    const name = readText(d.name, WEEK_LIMITS.dayName);
    if (!name) return null;
    if (!Array.isArray(d.lifts) || d.lifts.length < 1 || d.lifts.length > WEEK_LIMITS.lifts) return null;
    const lifts: CoachLiftWire[] = [];
    for (const l of d.lifts) {
      if (!isObj(l)) return null;
      const ex = readExId(l.ex);
      if (!ex || !isInt(l.sets, 1, WEEK_LIMITS.sets)) return null;
      if (!Array.isArray(l.band) || l.band.length !== 2) return null;
      const [lo, hi] = l.band;
      if (!isInt(lo, 1, WEEK_LIMITS.band) || !isInt(hi, 1, WEEK_LIMITS.band) || lo > hi) return null;
      const lift: CoachLiftWire = { ex, sets: l.sets, band: [lo, hi] };
      if (l.note !== undefined) {
        // ⛔ LAW 7 — the only prose a coach sends, and it is 140 characters or it is not sent.
        const note = readText(l.note, WEEK_LIMITS.note);
        if (note === null) return null;
        if (note) lift.note = note;
      }
      if (l.pairNext === true) lift.pairNext = true;
      lifts.push(lift);
    }
    // A superset "with the next lift" on the day's last lift pairs with nothing.
    delete lifts[lifts.length - 1].pairNext;
    week.days.push({ name, lifts });
  }
  return week;
}

/**
 * ⛔ ONE SAVED WORKOUT, AS THE COACH IS ALLOWED TO SEE IT (spec §3 `SessionUpload`, law 4).
 *
 * `sinceMs` is the link date: a workout that started before it is not the coach's to see, however
 * the phone came to send it. `bodyweightKg` survives only under consent — without it the field is
 * dropped and the rest of the workout is kept, because a set is not less true for her weight being
 * private.
 */
export function readSessionUpload(
  raw: unknown,
  opts: { consentBodyweight: boolean; sinceMs: number; nowMs: number },
): SessionUpload | null {
  if (!isObj(raw)) return null;
  const id = readText(raw.id, UPLOAD_LIMITS.id);
  if (!id) return null;
  const atMs = typeof raw.at === 'string' && raw.at.length <= 40 ? Date.parse(raw.at) : NaN;
  if (!Number.isFinite(atMs) || atMs < opts.sinceMs || atMs > opts.nowMs + DAY_MS) return null;
  const day = readText(raw.day, UPLOAD_LIMITS.day);
  if (!day) return null;
  if (!isInt(raw.minutes, 0, UPLOAD_LIMITS.minutes) || typeof raw.early !== 'boolean') return null;
  if (!Array.isArray(raw.sets) || raw.sets.length > UPLOAD_LIMITS.sets) return null;
  const sets: SessionSetWire[] = [];
  for (const s of raw.sets) {
    if (!isObj(s)) return null;
    const ex = readExId(s.ex);
    if (!ex || !isInt(s.reps, 0, UPLOAD_LIMITS.reps)) return null;
    if (s.load !== null && !isNum(s.load, 0, UPLOAD_LIMITS.load)) return null;
    sets.push({ ex, load: s.load === null ? null : Math.round((s.load as number) * 100) / 100, reps: s.reps });
  }
  const out: SessionUpload = { id, at: iso(atMs), day, minutes: raw.minutes, early: raw.early, sets };
  if (raw.weekVersion !== undefined) {
    if (!isInt(raw.weekVersion, 1, 1_000_000)) return null;
    out.weekVersion = raw.weekVersion;
  }
  if (raw.swaps !== undefined) {
    if (!Array.isArray(raw.swaps) || raw.swaps.length > UPLOAD_LIMITS.swaps) return null;
    const swaps: Array<{ from: string; to: string }> = [];
    for (const w of raw.swaps) {
      if (!isObj(w)) return null;
      const from = readExId(w.from);
      const to = readExId(w.to);
      if (!from || !to) return null;
      swaps.push({ from, to });
    }
    out.swaps = swaps;
  }
  if (raw.skipped !== undefined) {
    if (!Array.isArray(raw.skipped) || raw.skipped.length > UPLOAD_LIMITS.skipped) return null;
    const skipped: string[] = [];
    for (const x of raw.skipped) {
      const ex = readExId(x);
      if (!ex) return null;
      skipped.push(ex);
    }
    out.skipped = skipped;
  }
  if (raw.pain !== undefined) {
    if (!Array.isArray(raw.pain) || raw.pain.length > UPLOAD_LIMITS.pain) return null;
    const pain: string[] = [];
    for (const p of raw.pain) {
      const area = readText(p, UPLOAD_LIMITS.painArea);
      if (!area) return null;
      pain.push(area);
    }
    out.pain = pain;
  }
  // ⛔ CONSENT AT WRITE. Not consented → not read, not stored, not an error.
  if (opts.consentBodyweight && isNum(raw.bodyweightKg, 20, 400)) {
    out.bodyweightKg = Math.round(raw.bodyweightKg * 10) / 10;
  }
  return out;
}

/** One run or walk (spec §3 `CardioUpload`). The CALLER drops the whole list without consent. */
export function readCardioUpload(raw: unknown, opts: { sinceMs: number; nowMs: number }): CardioUpload | null {
  if (!isObj(raw)) return null;
  const id = readText(raw.id, UPLOAD_LIMITS.id);
  if (!id) return null;
  const atMs = typeof raw.at === 'string' && raw.at.length <= 40 ? Date.parse(raw.at) : NaN;
  if (!Number.isFinite(atMs) || atMs < opts.sinceMs || atMs > opts.nowMs + DAY_MS) return null;
  if (raw.kind !== 'run' && raw.kind !== 'walk') return null;
  if (!isNum(raw.metres, 0, 1_000_000) || !isInt(raw.seconds, 0, 86_400)) return null;
  return { id, at: iso(atMs), kind: raw.kind, metres: Math.round(raw.metres), seconds: raw.seconds };
}

/** Consent is `true` or it is not given. A missing field is a no; a non-boolean is a bad request. */
export function readConsent(raw: unknown): Consent | null {
  if (raw === undefined) return { bodyweight: false, cardio: false };
  if (!isObj(raw)) return null;
  for (const k of ['bodyweight', 'cardio'] as const) {
    if (raw[k] !== undefined && typeof raw[k] !== 'boolean') return null;
  }
  return { bodyweight: raw.bodyweight === true, cardio: raw.cardio === true };
}

/** What a trainee tells her coach about herself on joining — a name, and optionally two facts. */
export function readJoinProfile(raw: unknown): { name: string; sex?: 'male' | 'female'; days?: number } | null {
  if (!isObj(raw)) return null;
  const name = readName(raw.name);
  if (!name) return null;
  const out: { name: string; sex?: 'male' | 'female'; days?: number } = { name };
  if (raw.sex === 'male' || raw.sex === 'female') out.sex = raw.sex;
  if (isInt(raw.days, 1, 7)) out.days = raw.days;
  return out;
}

// ════════════════════════════ rows → wire ════════════════════════════

export interface CoachRow {
  name: string;
  seat_limit: number | null;
  plan_product_id: string | null;
  plan_txn: string | null;
  plan_state: string | null;
  plan_renews_at: number | null;
  plan_event_at: number | null;
}
/** ⛔ Named once. `trainee_sub` is not a coach column at all, and no SELECT here reaches one. */
const COACH_COLUMNS = 'name, seat_limit, plan_product_id, plan_txn, plan_state, plan_renews_at, plan_event_at';
/** ⛔ The columns a coach route may read about a link. `trainee_sub` is not among them, ever. */
interface LinkRow {
  id: string;
  trainee_name: string;
  sex: string | null;
  days: number | null;
  since: number;
  consent_bodyweight: number;
  consent_cardio: number;
}
const LINK_COLUMNS = 'id, trainee_name, sex, days, since, consent_bodyweight, consent_cardio';

const consentOf = (l: LinkRow): Consent => ({ bodyweight: l.consent_bodyweight === 1, cardio: l.consent_cardio === 1 });

function profileOf(l: LinkRow): { name: string; sex?: string; days?: number } {
  return {
    name: l.trainee_name,
    ...(l.sex === 'male' || l.sex === 'female' ? { sex: l.sex } : {}),
    ...(l.days != null ? { days: l.days } : {}),
  };
}

/**
 * ⛔ CONSENT AT READ. A stored row is rebuilt through the same reader on the way out, and her
 * bodyweight is attached only if consent stands NOW — not merely when it was written.
 */
function sessionOut(row: { payload_json: string; bodyweight_kg: number | null }, consentBodyweight: boolean): SessionUpload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    return null;
  }
  const s = readSessionUpload(parsed, { consentBodyweight: false, sinceMs: 0, nowMs: Number.MAX_SAFE_INTEGER / 2 });
  if (s && consentBodyweight && row.bodyweight_kg != null) s.bodyweightKg = row.bodyweight_kg;
  return s;
}

function envelopeOut(row: { version: number; sent_at: number; coach_name: string; week_json: string } | null): WeekEnvelope | null {
  if (!row) return null;
  let week: CoachWeekWire | null = null;
  try {
    week = readCoachWeek(JSON.parse(row.week_json));
  } catch {
    return null;
  }
  return week ? { version: row.version, sentAt: iso(row.sent_at), coachName: row.coach_name, week } : null;
}

// ════════════════════════════ queries ════════════════════════════

function freeSeats(env: CoachEnv): number {
  const n = Number.parseInt(env.COACH_FREE_SEATS ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

async function coachOf(db: D1Database, sub: string): Promise<CoachRow | null> {
  return db.prepare(`SELECT ${COACH_COLUMNS} FROM coaches WHERE sub = ? AND deleted_at IS NULL`).bind(sub).first<CoachRow>();
}

/** The seats this coach actually has — his own column, or the free tier the deployment grants. */
const seatsOf = (env: CoachEnv, coach: CoachRow): number => coach.seat_limit ?? freeSeats(env);

/**
 * ⛔ THE PLAN, AS THE APP IS TOLD IT (§4). Null when no purchase was ever verified for this coach —
 * a free coach has no plan, not an "expired" one. `over_limit` is decided HERE and nowhere else.
 */
export function planOf(coach: CoachRow, seats: number, used: number): PlanWire | null {
  const state = coach.plan_state;
  if (!coach.plan_product_id || (state !== 'active' && state !== 'grace' && state !== 'expired')) return null;
  return {
    productId: coach.plan_product_id,
    seats,
    renewsAt: coach.plan_renews_at != null ? iso(coach.plan_renews_at) : null,
    state: used > seats ? 'over_limit' : state,
  };
}

async function seatsUsed(db: D1Database, coachSub: string): Promise<number> {
  const r = await db
    .prepare('SELECT COUNT(*) AS n FROM coach_links WHERE coach_sub = ? AND ended_at IS NULL')
    .bind(coachSub)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Her live link, as the TRAINEE sees it — the coach's name, never the coach's sub. */
async function liveLinkOf(db: D1Database, traineeSub: string): Promise<(LinkRow & { coach_name: string }) | null> {
  return db
    .prepare(
      `SELECT l.id, l.trainee_name, l.sex, l.days, l.since, l.consent_bodyweight, l.consent_cardio, c.name AS coach_name
         FROM coach_links l JOIN coaches c ON c.sub = l.coach_sub
        WHERE l.trainee_sub = ? AND l.ended_at IS NULL`,
    )
    .bind(traineeSub)
    .first<LinkRow & { coach_name: string }>();
}

/** ⛔ LAW 6 — a coach reaches a link only while it lives. `ended_at IS NULL` is the whole door. */
async function coachLink(db: D1Database, coachSub: string, linkId: string): Promise<LinkRow | null> {
  if (!linkId || linkId.length > 64) return null;
  return db
    .prepare(`SELECT ${LINK_COLUMNS} FROM coach_links WHERE id = ? AND coach_sub = ? AND ended_at IS NULL`)
    .bind(linkId, coachSub)
    .first<LinkRow>();
}

async function latestWeek(db: D1Database, linkId: string, newerThan: number): Promise<WeekEnvelope | null> {
  const row = await db
    .prepare(
      'SELECT version, sent_at, coach_name, week_json FROM coach_weeks WHERE link_id = ? AND version > ? ORDER BY version DESC LIMIT 1',
    )
    .bind(linkId, newerThan)
    .first<{ version: number; sent_at: number; coach_name: string; week_json: string }>();
  return envelopeOut(row);
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return null;
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (text.length > MAX_BODY_BYTES) return null;
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

const randomId = (prefix: string): string =>
  prefix + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ════════════════════════════ the routes ════════════════════════════

export async function handleCoach(
  req: Request,
  env: CoachEnv,
  url: URL,
  sub: string,
  codes: InviteCodes,
  billing: BillingGate,
): Promise<Response> {
  const db = env.COACH_DB;
  if (!db) return json(503, { error: 'coach_not_configured' });
  try {
    return await route(req, env, db, url, sub, codes, billing, Date.now());
  } catch {
    return json(503, { error: 'unavailable' });
  }
}

async function route(
  req: Request,
  env: CoachEnv,
  db: D1Database,
  url: URL,
  sub: string,
  codes: InviteCodes,
  billing: BillingGate,
  now: number,
): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // ─────────────── anyone signed in ───────────────

  if (method === 'GET' && path === '/coach/me') {
    const coach = await coachOf(db, sub);
    const link = await liveLinkOf(db, sub);
    let mine: { coach: { name: string; seats: number; used: number }; plan: PlanWire | null } | null = null;
    if (coach) {
      const seats = seatsOf(env, coach);
      const used = await seatsUsed(db, sub);
      // `plan` rides beside `coach`, never inside it: a coach who never bought anything answers
      // `plan: null`, and a stranger — who has no coach either — is answered `{}` as he always was.
      mine = { coach: { name: coach.name, seats, used }, plan: planOf(coach, seats, used) };
    }
    return json(200, {
      ...(mine ?? {}),
      ...(link ? { athleteOf: { linkId: link.id, coachName: link.coach_name, since: iso(link.since), consent: consentOf(link) } } : {}),
    });
  }

  if (method === 'POST' && path === '/coach/enroll') {
    const body = await readBody(req);
    const name = body ? readName(body.name) : null;
    if (!name) return json(400, { error: 'bad_request' });
    // Idempotent, and a rename. An account deleted and signed back into starts again, undeleted.
    await db
      .prepare(
        `INSERT INTO coaches (sub, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(sub) DO UPDATE SET name = excluded.name, deleted_at = NULL`,
      )
      .bind(sub, name, now)
      .run();
    const coach = await coachOf(db, sub);
    const seats = coach ? seatsOf(env, coach) : freeSeats(env);
    const used = await seatsUsed(db, sub);
    return json(200, { coach: { name, seats, used }, plan: coach ? planOf(coach, seats, used) : null });
  }

  /*
   * ⛔ JOIN — the one door where a stranger's code becomes a link, so every refusal has its own name
   * the app can say out loud: a typo (`bad_code`), a full roster (`seats_full`), a second coach
   * (`already_linked`), and a coach who tapped her own invite (`self`).
   *
   * ⚠️ TWO RACES, CLOSED IN THE DATABASE rather than by the reads before them. The invite is claimed
   * with a conditional UPDATE (single use holds under two simultaneous taps), and the link is
   * inserted only while the coach's live count is under her seats — with the partial unique index
   * `coach_links_one_live_per_trainee` refusing a second live link whatever the reads said.
   */
  if (method === 'POST' && path === '/coach/join') {
    const body = await readBody(req);
    if (!body) return json(400, { error: 'bad_request' });
    const code = codes.safe(typeof body.code === 'string' ? body.code : '');
    if (code.length !== codes.length) return json(404, { error: 'bad_code' });
    const invite = await db
      .prepare('SELECT coach_sub, expires_at, used_at, used_by_link FROM coach_invites WHERE code = ?')
      .bind(code)
      .first<{ coach_sub: string; expires_at: number; used_at: number | null; used_by_link: string | null }>();
    const coach = invite && invite.expires_at > now ? await coachOf(db, invite.coach_sub) : null;
    if (!invite || !coach) return json(404, { error: 'bad_code' });
    if (invite.coach_sub === sub) return json(409, { error: 'self' });

    const answer = async (link: LinkRow): Promise<Response> => {
      const week = await latestWeek(db, link.id, 0);
      return json(200, { linkId: link.id, coachName: coach.name, since: iso(link.since), ...(week ? { week } : {}) });
    };

    if (invite.used_at != null) {
      // A retry of HER OWN join (the answer was lost to the gym's reception) gets the same answer.
      const mine = await liveLinkOf(db, sub);
      if (mine && mine.id === invite.used_by_link) return answer(mine);
      return json(404, { error: 'bad_code' });
    }

    const profile = readJoinProfile(body);
    const consent = readConsent(body.consent);
    if (!profile || !consent) return json(400, { error: 'bad_request' });
    if (await liveLinkOf(db, sub)) return json(409, { error: 'already_linked' });
    const seats = seatsOf(env, coach);
    if ((await seatsUsed(db, invite.coach_sub)) >= seats) return json(409, { error: 'seats_full' });

    const linkId = randomId('l_');
    const claimed = await db
      .prepare('UPDATE coach_invites SET used_at = ?, used_by_link = ? WHERE code = ? AND used_at IS NULL AND expires_at > ?')
      .bind(now, linkId, code, now)
      .run();
    if (claimed.meta.changes !== 1) return json(404, { error: 'bad_code' });
    const release = () =>
      db.prepare('UPDATE coach_invites SET used_at = NULL, used_by_link = NULL WHERE code = ? AND used_by_link = ?').bind(code, linkId).run();

    let inserted = 0;
    try {
      const r = await db
        .prepare(
          `INSERT INTO coach_links (id, coach_sub, trainee_sub, trainee_name, sex, days, consent_bodyweight, consent_cardio, since)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE (SELECT COUNT(*) FROM coach_links WHERE coach_sub = ? AND ended_at IS NULL) < ?`,
        )
        .bind(
          linkId, invite.coach_sub, sub, profile.name, profile.sex ?? null, profile.days ?? null,
          consent.bodyweight ? 1 : 0, consent.cardio ? 1 : 0, now,
          invite.coach_sub, seats,
        )
        .run();
      inserted = r.meta.changes;
    } catch {
      await release();
      return json(409, { error: 'already_linked' });
    }
    if (inserted !== 1) {
      await release();
      return json(409, { error: 'seats_full' });
    }
    return answer({
      id: linkId, trainee_name: profile.name, sex: profile.sex ?? null, days: profile.days ?? null, since: now,
      consent_bodyweight: consent.bodyweight ? 1 : 0, consent_cardio: consent.cardio ? 1 : 0,
    });
  }

  // ─────────────── the trainee (`/me/coach/…`) ───────────────

  if (path.startsWith('/me/coach/')) {
    if (method === 'POST' && path === '/me/coach/leave') {
      // Idempotent: leaving when there is nothing to leave is already the state she asked for.
      await db.prepare('UPDATE coach_links SET ended_at = ? WHERE trainee_sub = ? AND ended_at IS NULL').bind(now, sub).run();
      return json(200, { ok: true });
    }

    const link = await liveLinkOf(db, sub);
    if (!link) return json(404, { error: 'not_linked' });

    if (method === 'GET' && path === '/me/coach/week') {
      const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10);
      const week = await latestWeek(db, link.id, Number.isFinite(since) && since > 0 ? since : 0);
      return json(200, week ? { week } : {});
    }

    /*
     * ⛔ THE UPLOAD IS A SINK (law 3's server half). Idempotent on (link_id, id) — the first copy
     * wins and a retry is counted as accepted, so a queue drained twice stores once. A workout that
     * fails its reader is dropped and still answered 200: resending it will never make it valid, and
     * a 400 would pin it at the head of her phone's queue for ever.
     */
    if (method === 'POST' && path === '/me/coach/sessions') {
      const body = await readBody(req);
      if (!body) return json(400, { error: 'bad_request' });
      const rawSessions = body.sessions ?? [];
      const rawCardio = body.cardio ?? [];
      if (!Array.isArray(rawSessions) || rawSessions.length > UPLOAD_LIMITS.batch) return json(400, { error: 'bad_request' });
      if (!Array.isArray(rawCardio) || rawCardio.length > UPLOAD_LIMITS.batch) return json(400, { error: 'bad_request' });
      const consent = consentOf(link);
      const stmts: D1PreparedStatement[] = [];
      for (const raw of rawSessions) {
        const s = readSessionUpload(raw, { consentBodyweight: consent.bodyweight, sinceMs: link.since, nowMs: now });
        if (!s) continue;
        const { bodyweightKg, ...rest } = s;
        stmts.push(
          db
            .prepare(
              'INSERT OR IGNORE INTO coach_sessions (link_id, id, at_ms, uploaded_at, bodyweight_kg, payload_json) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .bind(link.id, s.id, Date.parse(s.at), now, bodyweightKg ?? null, JSON.stringify(rest)),
        );
      }
      // ⛔ CONSENT AT WRITE — without it, not one run is read.
      if (consent.cardio) {
        for (const raw of rawCardio) {
          const c = readCardioUpload(raw, { sinceMs: link.since, nowMs: now });
          if (!c) continue;
          stmts.push(
            db
              .prepare('INSERT OR IGNORE INTO coach_cardio (link_id, id, at_ms, uploaded_at, payload_json) VALUES (?, ?, ?, ?, ?)')
              .bind(link.id, c.id, Date.parse(c.at), now, JSON.stringify(c)),
          );
        }
      }
      if (stmts.length > 0) await db.batch(stmts);
      return json(200, { accepted: stmts.length });
    }

    /*
     * ⛔ WITHDRAWING CONSENT ERASES WHAT IT COVERED. Hiding it at read would already keep the promise
     * on screen; nulling it here keeps it in the database too, so a later bug in a read path has
     * nothing to leak.
     */
    if (method === 'POST' && path === '/me/coach/consent') {
      const body = await readBody(req);
      const consent = body && body.consent !== undefined ? readConsent(body.consent) : null;
      if (!consent) return json(400, { error: 'bad_request' });
      const stmts = [
        db
          .prepare('UPDATE coach_links SET consent_bodyweight = ?, consent_cardio = ? WHERE id = ?')
          .bind(consent.bodyweight ? 1 : 0, consent.cardio ? 1 : 0, link.id),
      ];
      if (!consent.bodyweight) stmts.push(db.prepare('UPDATE coach_sessions SET bodyweight_kg = NULL WHERE link_id = ?').bind(link.id));
      if (!consent.cardio) stmts.push(db.prepare('DELETE FROM coach_cardio WHERE link_id = ?').bind(link.id));
      await db.batch(stmts);
      return json(200, { ok: true });
    }

    return json(404, { error: 'not_found' });
  }

  // ─────────────── the coach ───────────────

  const coach = await coachOf(db, sub);
  if (!coach) return json(403, { error: 'not_coach' });

  /*
   * ⛔ THE PLAN (2026-09-18, COACH_TRACK_V1 §4) — a purchase becomes seats, and only Apple can say so.
   *
   * The body carries what StoreKit handed the phone and nothing else that counts: the seat number
   * comes from the product APPLE named in a signed transaction, never from this request. A body
   * claiming `hush.coach.100.month` over a ten-seat purchase is refused (`plan_mismatch`), and a
   * purchase already bound to another coach is refused by the database as well (`plan_claimed`).
   */
  if (method === 'POST' && path === '/coach/plan') {
    const body = await readBody(req);
    if (!body) return json(400, { error: 'bad_request' });
    const claimed = readText(body.productId, 64) ?? '';
    const transactionId = readText(body.transactionId, 64) ?? '';
    if (billing.seats(claimed) === null || !/^[A-Za-z0-9._-]{1,64}$/.test(transactionId)) return json(400, { error: 'bad_request' });

    // 1 · the local driver's path — closed in every deployment, see `appleBilling.testGateOpen`.
    const message = `plan|${sub}|${claimed}|${transactionId}`;
    let verified = await billing.test(body.test, message, req.headers.get('x-hush-billing-test'));

    // 2 · or Apple, asked directly.
    if (!verified) {
      // ⛔ NO KEY, NO ANSWER, AND NO LOG. Not a 200 that quietly grants nothing, and not a line in
      // a log with a transaction id in it: the founder's secrets are missing, and that is all.
      if (!billing.configured()) return json(503, { error: 'billing_not_configured' });
      try {
        verified = await billing.verify(transactionId);
      } catch {
        return json(503, { error: 'billing_unavailable' });
      }
      if (!verified) return json(404, { error: 'transaction_not_found' });
    }
    if (verified.productId !== claimed) return json(409, { error: 'plan_mismatch' });
    const tierSeats = billing.seats(verified.productId);
    if (tierSeats === null) return json(409, { error: 'plan_mismatch' });
    // A refunded, revoked or lapsed purchase opens nothing. The coach is told, and keeps his two.
    if (verified.state === 'expired') return json(409, { error: 'plan_inactive' });

    // ⛔ ONE PURCHASE, ONE ROSTER. Read first so the answer has a name, and let the partial unique
    // index be the thing that actually holds under two simultaneous claims.
    const owner = await db.prepare('SELECT sub FROM coaches WHERE plan_txn = ?').bind(verified.originalTransactionId).first<{ sub: string }>();
    if (owner && owner.sub !== sub) return json(409, { error: 'plan_claimed' });
    try {
      await db
        .prepare(
          `UPDATE coaches SET seat_limit = ?, plan_product_id = ?, plan_txn = ?, plan_state = ?, plan_renews_at = ?, plan_event_at = ?
             WHERE sub = ? AND deleted_at IS NULL`,
        )
        .bind(tierSeats, verified.productId, verified.originalTransactionId, verified.state, verified.renewsAtMs, now, sub)
        .run();
    } catch {
      return json(409, { error: 'plan_claimed' });
    }
    const after = await coachOf(db, sub);
    if (!after) return json(503, { error: 'unavailable' });
    const seats = seatsOf(env, after);
    const used = await seatsUsed(db, sub);
    return json(200, { coach: { name: after.name, seats, used }, plan: planOf(after, seats, used) });
  }

  if (method === 'POST' && path === '/coach/invite') {
    /*
     * ⛔ A FULL ROSTER MINTS NO INVITE (2026-09-18). Until today seats were checked at join only,
     * and a coach could hand out a code his roster had no room for — which is a promise made to a
     * trainee that the server then breaks in front of her. It is refused here, by the same number
     * `/coach/join` enforces, so an over-limit coach (a lapsed plan, three athletes) keeps every
     * athlete he has and simply cannot add one.
     */
    if ((await seatsUsed(db, sub)) >= seatsOf(env, coach)) return json(409, { error: 'seats_full' });
    const open = await db
      .prepare('SELECT COUNT(*) AS n FROM coach_invites WHERE coach_sub = ? AND used_at IS NULL AND expires_at > ?')
      .bind(sub, now)
      .first<{ n: number }>();
    if ((open?.n ?? 0) >= MAX_OPEN_INVITES) return json(429, { error: 'too_many_invites' });
    const expiresAt = now + INVITE_TTL_MS;
    // Collisions are astronomically unlikely (31^6) — but a taken code is retried, not clobbered.
    for (let i = 0; i < 5; i++) {
      const code = codes.random();
      const r = await db
        .prepare('INSERT OR IGNORE INTO coach_invites (code, coach_sub, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(code, sub, now, expiresAt)
        .run();
      if (r.meta.changes === 1) return json(200, { code, url: `${INVITE_ORIGIN}/c/${code}`, expiresAt: iso(expiresAt) });
    }
    return json(503, { error: 'unavailable' });
  }

  if (method === 'GET' && path === '/coach/roster') {
    const links = await db
      .prepare(`SELECT ${LINK_COLUMNS} FROM coach_links WHERE coach_sub = ? AND ended_at IS NULL ORDER BY since`)
      .bind(sub)
      .all<LinkRow>();
    const athletes = [];
    for (const l of links.results) {
      const v = await db.prepare('SELECT MAX(version) AS v FROM coach_weeks WHERE link_id = ?').bind(l.id).first<{ v: number | null }>();
      const rows = await db
        .prepare('SELECT payload_json, bodyweight_kg FROM coach_sessions WHERE link_id = ? AND at_ms >= ? ORDER BY at_ms DESC LIMIT 60')
        .bind(l.id, now - ROSTER_WINDOW_MS)
        .all<{ payload_json: string; bodyweight_kg: number | null }>();
      const recent = rows.results.map((r) => sessionOut(r, l.consent_bodyweight === 1)).filter((s): s is SessionUpload => s !== null);
      athletes.push({
        linkId: l.id,
        ...profileOf(l),
        since: iso(l.since),
        ...(v?.v != null ? { weekVersion: v.v } : {}),
        recent,
      });
    }
    return json(200, { athletes });
  }

  if (path === '/coach/athlete' || path.startsWith('/coach/athlete/')) {
    const link = await coachLink(db, sub, url.searchParams.get('l') ?? '');
    if (!link) return json(404, { error: 'not_found' });
    const consent = consentOf(link);

    if (method === 'GET' && path === '/coach/athlete') {
      const week = await latestWeek(db, link.id, 0);
      const rows = await db
        .prepare('SELECT payload_json, bodyweight_kg FROM coach_sessions WHERE link_id = ? ORDER BY at_ms DESC LIMIT 200')
        .bind(link.id)
        .all<{ payload_json: string; bodyweight_kg: number | null }>();
      const sessions = rows.results.map((r) => sessionOut(r, consent.bodyweight)).filter((s): s is SessionUpload => s !== null);
      const out: Record<string, unknown> = { linkId: link.id, ...profileOf(link), since: iso(link.since), consent };
      // ⛔ CONSENT AT READ — the latest weight she chose to share, only while she still shares it.
      if (consent.bodyweight) {
        const bw = await db
          .prepare('SELECT bodyweight_kg FROM coach_sessions WHERE link_id = ? AND bodyweight_kg IS NOT NULL ORDER BY at_ms DESC LIMIT 1')
          .bind(link.id)
          .first<{ bodyweight_kg: number }>();
        if (bw) out.bodyweightKg = bw.bodyweight_kg;
      }
      if (week) out.week = week;
      out.sessions = sessions;
      if (consent.cardio) {
        const c = await db
          .prepare('SELECT payload_json FROM coach_cardio WHERE link_id = ? ORDER BY at_ms DESC LIMIT 200')
          .bind(link.id)
          .all<{ payload_json: string }>();
        out.cardio = c.results
          .map((r) => {
            try {
              return readCardioUpload(JSON.parse(r.payload_json), { sinceMs: 0, nowMs: Number.MAX_SAFE_INTEGER / 2 });
            } catch {
              return null;
            }
          })
          .filter((x): x is CardioUpload => x !== null);
      }
      return json(200, out);
    }

    if (method === 'PUT' && path === '/coach/athlete/week') {
      const body = await readBody(req);
      const week = body ? readCoachWeek(body.week) : null;
      if (!week) return json(400, { error: 'bad_week' });
      // The version is computed INSIDE the insert, so two sends cannot both become version 3; a
      // collision on the primary key is retried once, and then it is the database's to report.
      let version: number | null = null;
      for (let i = 0; i < 2 && version === null; i++) {
        try {
          const r = await db
            .prepare(
              `INSERT INTO coach_weeks (link_id, version, sent_at, coach_name, week_json)
               SELECT ?, COALESCE(MAX(version), 0) + 1, ?, ?, ? FROM coach_weeks WHERE link_id = ?
               RETURNING version`,
            )
            .bind(link.id, now, coach.name, JSON.stringify(week), link.id)
            .first<{ version: number }>();
          version = r?.version ?? null;
        } catch {
          if (i === 1) throw new Error('week_insert');
        }
      }
      if (version === null) return json(503, { error: 'unavailable' });
      await db.prepare('DELETE FROM coach_weeks WHERE link_id = ? AND version <= ?').bind(link.id, version - KEEP_WEEK_VERSIONS).run();
      return json(200, { version, sentAt: iso(now) });
    }

    if (method === 'POST' && path === '/coach/athlete/remove') {
      // ⛔ LAW 6 — ended, so the very next coach read of this link is a 404. The rows go at the purge.
      await db.prepare('UPDATE coach_links SET ended_at = ? WHERE id = ? AND coach_sub = ? AND ended_at IS NULL').bind(now, link.id, sub).run();
      return json(200, { ok: true });
    }

    return json(404, { error: 'not_found' });
  }

  if (path === '/coach/templates' || path === '/coach/templates/delete') {
    const templateOut = (r: { id: string; name: string; week_json: string; updated_at: number }) => {
      try {
        const week = readCoachWeek(JSON.parse(r.week_json));
        return week ? { id: r.id, name: r.name, week, updatedAt: iso(r.updated_at) } : null;
      } catch {
        return null;
      }
    };

    if (method === 'GET' && path === '/coach/templates') {
      const rows = await db
        .prepare('SELECT id, name, week_json, updated_at FROM coach_templates WHERE coach_sub = ? ORDER BY updated_at DESC')
        .bind(sub)
        .all<{ id: string; name: string; week_json: string; updated_at: number }>();
      return json(200, { templates: rows.results.map(templateOut).filter((t) => t !== null) });
    }

    if (method === 'POST' && path === '/coach/templates') {
      const body = await readBody(req);
      const name = body ? readName(body.name) : null;
      const week = body ? readCoachWeek(body.week) : null;
      if (!name || !week) return json(400, { error: 'bad_request' });
      // A save under a name she already used REPLACES that template; only a new name takes a slot.
      const existing = await db.prepare('SELECT id FROM coach_templates WHERE coach_sub = ? AND name = ?').bind(sub, name).first<{ id: string }>();
      if (!existing) {
        const n = await db.prepare('SELECT COUNT(*) AS n FROM coach_templates WHERE coach_sub = ?').bind(sub).first<{ n: number }>();
        if ((n?.n ?? 0) >= MAX_TEMPLATES) return json(409, { error: 'templates_full' });
      }
      const id = existing?.id ?? randomId('t_');
      await db
        .prepare(
          `INSERT INTO coach_templates (id, coach_sub, name, week_json, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(coach_sub, name) DO UPDATE SET week_json = excluded.week_json, updated_at = excluded.updated_at`,
        )
        .bind(id, sub, name, JSON.stringify(week), now)
        .run();
      return json(200, { template: { id, name, week, updatedAt: iso(now) } });
    }

    if (method === 'POST' && path === '/coach/templates/delete') {
      const body = await readBody(req);
      const id = body && typeof body.id === 'string' ? body.id.slice(0, 64) : '';
      const name = body ? readName(body.name) ?? '' : '';
      if (!id && !name) return json(400, { error: 'bad_request' });
      await db.prepare('DELETE FROM coach_templates WHERE coach_sub = ? AND (id = ? OR name = ?)').bind(sub, id, name).run();
      return json(200, { ok: true });
    }
  }

  return json(404, { error: 'not_found' });
}

// ════════════════════════════ RENEWAL AND LOSS — App Store Server Notifications ════════════════════════════

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ SEATS MAY DROP BELOW LIVE LINKS. NOTHING HERE DELETES ANYTHING. (2026-09-18)
 *
 * `index.ts` verifies the notification's certificate chain to Apple's root and hands the result
 * here. A renewal restores the tier; an expiry, a refund or a revocation puts `seat_limit` back to
 * NULL — the free two — and that is the WHOLE effect. The coach keeps every athlete he has, every
 * week he ever sent and every upload they made; `/coach/me` starts answering `state: 'over_limit'`
 * and `/coach/invite` starts answering 409 `seats_full` until he is under the limit or renews.
 *
 * Taking an athlete away because a card expired would be taking away HER training week, and she is
 * not the one who failed to pay. There is no statement in this function that could.
 *
 * ⚠️ AND APPLE RE-SENDS FOR THREE DAYS. A DID_RENEW replayed after an EXPIRED would resurrect a
 * lapsed plan, so every write carries the event's own timestamp and an older event is ignored.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function coachApplePlanEvent(
  env: CoachEnv,
  event: { plan: VerifiedPlan; seats: number; at: number },
): Promise<'applied' | 'stale' | 'unknown' | 'off'> {
  const db = env.COACH_DB;
  if (!db) return 'off';
  const { plan } = event;
  const row = await db
    .prepare('SELECT sub, plan_event_at FROM coaches WHERE plan_txn = ? AND deleted_at IS NULL')
    .bind(plan.originalTransactionId)
    .first<{ sub: string; plan_event_at: number | null }>();
  // Nobody here has claimed this purchase (the coach has not tapped "restore" yet, or it is not a
  // coach purchase at all). There is nothing to keep honest, and nothing to create.
  if (!row) return 'unknown';
  if (row.plan_event_at != null && row.plan_event_at > event.at) return 'stale';
  const r = await db
    .prepare(
      `UPDATE coaches SET seat_limit = ?, plan_product_id = ?, plan_state = ?, plan_renews_at = ?, plan_event_at = ?
         WHERE plan_txn = ? AND deleted_at IS NULL AND (plan_event_at IS NULL OR plan_event_at <= ?)`,
    )
    .bind(
      // ⛔ A LAPSED PLAN HOLDS NO SEATS. NULL is the free tier, and it is the only thing that moves.
      plan.state === 'expired' ? null : event.seats,
      plan.productId,
      plan.state,
      plan.renewsAtMs,
      event.at,
      plan.originalTransactionId,
      event.at,
    )
    .run();
  return r.meta.changes === 1 ? 'applied' : 'stale';
}

// ════════════════════════════ LAW 8 — the account deletion cascade ════════════════════════════

/**
 * ⛔ CALLED BY `/account/delete` BEFORE ANYTHING IN KV IS TOUCHED. If this throws, the deletion
 * answers 503 and her phone retries — a deletion that erased her sign-in but left her uploads in
 * a coach's roster would be the worst of both.
 *
 *   · as a COACH  → every live link ended (her trainees' access to her, and hers to them, stops
 *                    now), her invites and templates deleted, her name blanked; the row itself
 *                    goes with the purge.
 *   · as a TRAINEE → every workout and run she uploaded, deleted now; her links ended and her name
 *                    on them blanked.
 */
export async function coachAccountDeleted(env: CoachEnv, sub: string, now = Date.now()): Promise<void> {
  const db = env.COACH_DB;
  if (!db) return;
  await db.batch([
    // as a coach
    db.prepare('UPDATE coach_links SET ended_at = ? WHERE coach_sub = ? AND ended_at IS NULL').bind(now, sub),
    db.prepare('DELETE FROM coach_invites WHERE coach_sub = ?').bind(sub),
    db.prepare('DELETE FROM coach_templates WHERE coach_sub = ?').bind(sub),
    db.prepare("UPDATE coaches SET deleted_at = ?, name = '' WHERE sub = ? AND deleted_at IS NULL").bind(now, sub),
    // as a trainee
    db.prepare('DELETE FROM coach_sessions WHERE link_id IN (SELECT id FROM coach_links WHERE trainee_sub = ?)').bind(sub),
    db.prepare('DELETE FROM coach_cardio WHERE link_id IN (SELECT id FROM coach_links WHERE trainee_sub = ?)').bind(sub),
    db.prepare("UPDATE coach_links SET ended_at = COALESCE(ended_at, ?), trainee_name = '' WHERE trainee_sub = ?").bind(now, sub),
  ]);
}

// ════════════════════════════ LAW 6 — the daily purge (cron `17 3 * * *`) ════════════════════════════

/**
 * Removes every row of a link ended more than `PURGE_AFTER_MS` ago, expired invites, and deleted
 * coaches with nothing left pointing at them. Children are deleted explicitly AND cascade from the
 * link, so a D1 without foreign keys enforced still purges.
 */
export async function purgeCoach(env: CoachEnv, now = Date.now()): Promise<void> {
  const db = env.COACH_DB;
  if (!db) return;
  const cutoff = now - PURGE_AFTER_MS;
  const ENDED = 'SELECT id FROM coach_links WHERE ended_at IS NOT NULL AND ended_at < ?';
  await db.batch([
    db.prepare(`DELETE FROM coach_sessions WHERE link_id IN (${ENDED})`).bind(cutoff),
    db.prepare(`DELETE FROM coach_cardio WHERE link_id IN (${ENDED})`).bind(cutoff),
    db.prepare(`DELETE FROM coach_weeks WHERE link_id IN (${ENDED})`).bind(cutoff),
    db.prepare('DELETE FROM coach_links WHERE ended_at IS NOT NULL AND ended_at < ?').bind(cutoff),
    db.prepare('DELETE FROM coach_invites WHERE expires_at < ?').bind(now),
    db
      .prepare('DELETE FROM coaches WHERE deleted_at IS NOT NULL AND deleted_at < ? AND NOT EXISTS (SELECT 1 FROM coach_links WHERE coach_sub = coaches.sub)')
      .bind(cutoff),
  ]);
}

// ───────── Cloudflare D1 ambient types — kept local so this file compiles standalone ────────

interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}
