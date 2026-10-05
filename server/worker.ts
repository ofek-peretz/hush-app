/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH WORKER — the only thing between the app and the models (OpenAI's, since 2026-09-28;
 * Gemini's before that).
 *
 * Deploy target: Cloudflare Workers. Copy this file over the generated `src/index.ts` in the
 * `hush-coach` project and run `npx wrangler deploy`.
 *
 * IT EXISTS FOR EXACTLY ONE REASON: **an API key cannot ship inside a phone app.** Anything in the
 * bundle is readable by anyone who downloads it, and a leaked key is someone else's bill on your
 * card. So the key lives in Cloudflare's secret store, the app never sees it, and this file is the
 * only code that does.
 *
 * It is deliberately thin. It holds no opinion about training, never edits a prompt, and never
 * inspects a plan — `coachPrompt` builds the call, `coachPlan` reads the answer, and both live in
 * the app where they are tested. Everything provider-specific is here and nowhere else: the model
 * names (`JOB_MODEL`), the request shape (`openaiModel.ts`, `voice.ts`). That is what made "swap the
 * provider" (2026-09-28) a change to the server alone.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────────────────
 * · It will not answer a caller that does not present the shared token. Without that, the URL is a
 *   public endpoint spending your money for anyone who finds it — and they are found, by scanners,
 *   within days.
 * · It will not accept a `model` from the caller. A request that picks its own model is a request
 *   that can pick the most expensive one.
 * · It will not accept an unbounded output. `max_output_tokens` is set here, not by the app.
 * · It will not pass the provider's error text back verbatim. An upstream error can quote the request,
 *   and the request contains an athlete's record.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { callProbeProvider, isProbeProvider } from './probeProviders.ts';
import { askStrongModel, type StrongEffort } from './strongModel.ts';
import { askOpenAI, type OpenAIEffort } from './openaiModel.ts';
import { hear, say, toBase64, DEFAULT_EAR, DEFAULT_VOICE, MAX_HEAR_BASE64, MAX_SAY_CHARS, VOICES } from './voice.ts';

export interface Env {
  /**
   * ⛔ THE MODEL BAKE-OFF SWITCH (2026-09-17) — '1' ONLY on a `wrangler versions upload --preview-alias`
   * probe version, NEVER in `[vars]`. With it, `x-probe-model` / `x-probe-think` choose the model and
   * thinking level for one call, so candidates are compared on this exact Worker code. Unset in
   * production, the headers are ignored.
   */
  PROBE?: string;
  /** The bake-off's Claude arms only (`probeProviders.ts`, PROBE). Unused by production since 2026-09-28. */
  ANTHROPIC_API_KEY?: string;
  /**
   * ⛔ THE ONE PROVIDER (founder, 2026-09-28: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו"*). Every
   * model call — the week, reading a routine, a review, the voice's ear and mouth — is OpenAI's. Set
   * with `npx wrangler secret put OPENAI_API_KEY`. Never in a file, never in the repo.
   */
  OPENAI_API_KEY: string;
  /** Unused by production since 2026-09-28 (the coach and the voice are OpenAI's). */
  GEMINI_API_KEY?: string;
  /**
   * Shared token the app sends in `x-hush-token`. Set with `npx wrangler secret put HUSH_TOKEN`.
   *
   * **This is a speed bump, not authentication.** It ships inside the app binary, so anyone willing
   * to unpack an IPA can read it. What it does buy is real: it stops the automated scanners that
   * find every new `*.workers.dev` hostname within days and spend whatever they can reach. Real
   * authentication arrives with real accounts; until then this is the difference between a bill you
   * chose and a bill you did not.
   */
  HUSH_TOKEN: string;
  /**
   * Cloudflare's rate limiter, declared in `wrangler.toml`. Optional at runtime on purpose: a
   * deploy that has not been given the binding yet still works, it is simply unlimited — and a
   * Worker that refused to start would be a worse failure than one that spends.
   */
  COACH_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /**
   * ════ REAL AUTHENTICATION, BORROWED FROM THE WORKER THAT ALREADY HAS IT ════
   *
   * The same KV namespace `hush-identity` writes its sessions into (`session:<token>` → Apple
   * `sub`, TTL 90 d). Sign-in is a hard wall at onboarding, so every real athlete holds one of
   * these tokens in her Keychain — which means the coach can finally tell an athlete from a script
   * by asking a question the script cannot answer. This worker only ever READS sessions; renewal
   * stays hush-identity's job, one writer per key family.
   *
   * Optional at runtime for the same reason COACH_LIMIT is: a deploy without the binding still
   * works, it is simply back to the speed-bump world it lived in before.
   */
  HUSH_KV?: {
    get(key: string, opts?: { cacheTtl?: number }): Promise<string | null>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  };
  /**
   * '1' → a call with no valid session is refused outright. Ships as '0' so every build already in
   * the field (none of them send a bearer) keeps its coach; the founder flips it once the first
   * bearer-sending build is the fleet. The flag is the migration, not a setting.
   */
  REQUIRE_AUTH?: string;
  /**
   * ════ THE ONE DOOR THAT STAYS OPEN TO A STRANGER (2026-09-09, the formula report) ════
   *
   * The intake is anonymous end-to-end — her week is built BEFORE she has an account — so a flat
   * "bearer or 401" would refuse the most important call in the product. With REQUIRE_AUTH on, a
   * call with no session is still admitted when it is an intake kind (`build`, `import`, `review`) AND it
   * names an install, and it spends this small per-install budget instead of an account's. An
   * install id is mintable, so this is a speed bump; the global ceiling is the wall behind it.
   * Default 6 — a real intake is one build, a retry, an import at most.
   */
  DAILY_ANON_CALLS?: string;
  /** Per-account calls per UTC day. Code default 40, deployed 200 (wrangler.toml, 2026-09-09) — a real athlete's heaviest day is under ten. */
  DAILY_ACCOUNT_CALLS?: string;
  /**
   * All accounts together, per UTC day — the kill switch that bounds the worst possible bill no
   * matter what else fails. Default 2000; with hedging at 3 upstream launches per call and
   * MAX_OUTPUT_TOKENS pricing, that is a ceiling the founder chose instead of one Google chose.
   */
  DAILY_GLOBAL_CALLS?: string;
  /**
   * ════ THE VOICE'S OWN LIMITER AND BUDGETS (2026-09-27, `voice.ts`) ════
   * A workout asks the ear a few times a minute and fetches the coach's lines ahead of time — a
   * burst the coach's 30/60 s limiter was never sized for, and a spend that must never starve the
   * week's build. So the voice counts apart: its own limiter, its own per-account day, its own
   * global ceiling. Defaults: 3000 hears (the strong ear hears every answer, and listens inside the
   * long windows), 2000 lines, 60 000 calls for everyone together.
   */
  VOICE_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  DAILY_VOICE_HEAR?: string;
  DAILY_VOICE_SAY?: string;
  DAILY_VOICE_GLOBAL?: string;
  /**
   * ════ THE VOICE FOR AN ATHLETE WITH NO ACCOUNT YET (2026-10-05) ════
   * An install with no session is given the voice out of its own pool: a day's hears and lines per
   * install (defaults 1200 and 300 — one workout, with room: the strong ear hears every stretch she
   * speaks, and a loud gym makes stretches of its own), and ONE ceiling for all such installs
   * together (default 20 000). The pool is separate on purpose: an install id is minted by whoever
   * sends it, so the per-install numbers are a speed bump and the anonymous ceiling is the wall —
   * and a wall that can only ever shut the anonymous door, never a signed-in athlete's.
   */
  DAILY_VOICE_ANON_HEAR?: string;
  DAILY_VOICE_ANON_SAY?: string;
  DAILY_VOICE_ANON_GLOBAL?: string;
}

/**
 * The model, and the ceiling on what one call may cost.
 *
 * Named here rather than taken from the request on purpose — see the header. Changing the model is
 * an edit and a deploy, which is exactly the friction it should have.
 */
/*
 * The model, and the three readings it took to get here (3.5 → 3.6 → 3.7).
 *
 * ⚠️ FIRST: GOOGLE'S PRICE PAGE MIXES TWO CURRENCIES INSIDE ONE ROW SET. The Hebrew page prints
 * some figures in USD and some in shekels — `ש"ח` means USD x 4. Verified against the English page
 * line by line (3.6 output reads "30 ₪" / $7.50; 3.5 reads "36 ש"ח" / $9.00; 2.5-flash-lite reads
 * "1.6 ש"ח" / $0.40). Read the English page. A 4x error on OUTPUT price picks the wrong model.
 *
 * Real prices per million tokens, and one athlete's year at 156 sessions (5,138 in, ~1,200 out):
 *
 *     2.5-flash-lite     $0.10 / $0.40      $0.15/yr
 *     3.1-flash-lite     $0.25 / $1.50      $0.48/yr
 *     3.5-flash-lite     $0.30 / $2.50      $0.71/yr
 *     3.6-flash          $1.50 / $7.50      $2.61/yr      <- this one
 *     3.5-flash          $1.50 / $9.00      $2.89/yr
 *     3.1-pro-preview    $2.00 / $12.00     $3.85/yr
 *
 * WHY NOT THE CHEAP TIER: the whole gap between the cheapest model and this one is $2.46 a year per
 * athlete, against $99.99 of revenue. The ruling on the record is that the post-session call is the
 * only decision the product sells and is not where you save.
 *
 * WHY 3.6 AND NOT 3.5, WHICH GOOGLE'S OWN LIST CALLS "most intelligent": the version numbers are
 * not a capability ranking and this took measuring. Artificial Analysis scores them IDENTICALLY
 * (index 50 each). 3.5 leads on HLE, broad knowledge, 41% to 38%. 3.6 leads on knowledge work
 * (GDPval 1421 vs 1349) and on every agentic and tool benchmark, runs about twice as fast, and
 * spends FEWER output tokens for the same task — so the real saving is larger than the 17% headline.
 * A tie on intelligence, a win on everything operational. And speed is not only money here: intake
 * is a live conversation and it produces the brief everything else rests on.
 *
 * NOT Pro, though it is affordable: `preview` means Google may retire it and its rate limits are
 * stricter, and this product has no second decider to fall back on when a model disappears.
 *
 * ── ⚠️ MEASURED, AND THE ESTIMATE ABOVE IS WRONG BY 2.5x ────────────────────────────────────────
 * The table is what the price page implies. Here is what a real programme build actually cost, from
 * `usage` on a live call — a full 4-day half-marathon plan built from a two-turn conversation:
 *
 *     prompt              4,746 tokens
 *     visible output        452 tokens
 *     THINKING            4,105 tokens      <- billed at the OUTPUT rate
 *                        ──────
 *     per call           $0.0413            (estimate said $0.0167)
 *     per athlete/year   $6.44              (estimate said $2.61) — 6.4% of $99.99
 *
 * **Thinking is 9x the visible output and 82% of the bill.** Any cost estimate for a 3.x model that
 * counts only the reply is wrong by roughly that factor. Still comfortably affordable; the number
 * is corrected here rather than quietly left standing.
 *
 * ── AND WHY `thinkingLevel` IS NOT SET ──────────────────────────────────────────────────────────
 * `generationConfig.thinkingLevel` takes `minimal`/`low`/`medium`/`high` and defaults to `medium`.
 * The obvious move after the number above is to turn it down. The measurements say do not:
 *
 *     "reply with the word OK"        83 thinking tokens
 *     build a 4-day programme      4,105 thinking tokens
 *
 * Fifty times the spend for fifty times the task. **The model is already proportional**, so there is
 * no waste to trim — only a ceiling to lower on the one call the product sells. It is one line here
 * if volume ever changes that arithmetic.
 *
 * MAX_OUTPUT_TOKENS caps the worst case at $0.061 per call meanwhile.
 *
 * None of this is settled by argument. Unreadable-response counts per model on real athlete data
 * are the honest comparison, and switching is this line plus a deploy.
 */
/*
 * ── ⚠️ 3.7 FLASH IS OUT, AND THE CASE FOR IT IS SPEED RATHER THAN MONEY (2026-08-30) ────────────
 *
 * Founder: *"יצא gemini flash 3.7 אולי זה יותר זול ועדיף ממה שיש לנו כעת."* Cheaper, no — the two
 * are priced IDENTICALLY: $0.75 / $3.75 per million on the introductory rate that runs to the end
 * of 2026, and $1.50 / $7.50 for both from 1 January 2027. The "50% price cut" in the coverage is
 * 3.7's introductory discount against its OWN standard rate, which is the same arrangement 3.6 is
 * already on. Switching saves nothing.
 *
 * Better, probably, and on the axis this product actually spends: Artificial Analysis measures
 * 3.7 at **329.7 output tokens/sec against 3.6's 173.1**, and time-to-first-token at **9.13s
 * against 18.03s** — roughly twice as fast on both, at the same price.
 *
 * ⚠️ THOSE ARE `high`-REASONING BENCHMARKS AND OURS IS A `low` CALL, so do not read the absolutes:
 * our whole build already completes in 5–8 seconds, well inside 3.6's benchmarked 18-second TTFT.
 * The RATIO is the signal, and it points at the one thing the plan-build screen is designed around
 * — the wait she watches.
 *
 * It also clears the bar that kept us off Pro: `gemini-3.7-flash` is GENERALLY AVAILABLE, not a
 * `preview` id, so it is not a model Google may retire under a product with no second decider.
 * Same tunable thinking levels, so `think: 'low'` carries over unchanged; 64k max output, so
 * `MAX_OUTPUT_TOKENS` is untouched.
 *
 * ⛔ SWITCHED ON THE FOUNDER'S INSTRUCTION, 2026-08-30: *"תחליף את gemini ל 3.7."* — and switched
 * back the same day on the measurement below, which is the whole reason the instruction was worth
 * carrying out rather than debating.
 *
 * ⛔ AND THE COMPARISON WAS RUN, AND **3.7 LOST** — REVERTED THE SAME DAY (2026-08-30).
 *
 * Both arms deployed for real, same Worker code, same sixteen plan builds, minutes apart:
 *
 *     3.7 ── 10/16 usable · 6 TRUNCATED · median 9.8s · five calls hit the 45s ceiling
 *     3.6 ── 16/16 usable · 0 truncated · median 5.0s · slowest 7.0s
 *
 * Confirmed on a second run of sixteen REAL athlete sentences: 16/16, median 4.2s, slowest 12.3s,
 * nothing over thirteen seconds. **Thirty-two consecutive builds without a failure.**
 *
 * ⚠️ AND EVERY WORD OF THE ARGUMENT ABOVE FOR 3.7 IS STILL TRUE — generally available, same
 * thinking levels, better published ratios. It was a good argument. On this call, with this schema
 * at `think: 'low'`, it is beaten by the older model on the only two numbers that reach an athlete:
 * whether an answer arrives, and when. Published benchmarks are not a measurement OF OUR CALL.
 *
 * ⛔ SO THE FOUNDER'S INSTRUCTION IS RECORDED AS CARRIED OUT AND MEASURED, NOT AS DECLINED. He
 * asked for the switch on a cost-and-quality hunch — *"אולי זה יותר זול ועדיף ממה שיש לנו כעת"* —
 * which is a hypothesis, and it was tested rather than argued with. Anyone tempted to try 3.7
 * again: run the sixteen-call probe first, and expect truncation to be the thing that breaks.
 *
 * ── ⛔ 3.8 FLASH WAS PROBED TOO, AND STAYED OFF (2026-09-15) ─────────────────────────────────────
 *
 * Founder: *"יש כרגע את GEMINI 3.6 אבל בפועל כבר יצא 3.8. תבדוק עלויות ואיכויות."* Same per-token
 * price as 3.6 (GA since 2026-09-02). Probed WITHOUT touching production: a non-deployed version
 * (`wrangler versions upload --preview-alias`), sixteen app-built requests (he/en, 2–6 days, eight
 * with a free-text ask carrying a checkable rule), two rounds per model — 32 builds each:
 *
 *              STOP     usable*   median   p90     output/call   $/build (std rate)   rule broken
 *     3.6      32/32    31/32     5.2s     12.8s   572           $0.0094              1 (a cable lift in "dumbbells only")
 *     3.8      32/32    30/32     4.3s      6.9s   889           $0.0114              4 (supersets asked, none paired ×2;
 *                                                                                        "no straight bar, bad shoulder" →
 *                                                                                        landmine press / trap bar ×2)
 *     * usable = STOP, the days asked for, no unknown id, ≥3 lifts a day. Thinking at `low` ≈ 0 on both.
 *
 * 3.8 is faster in the tail and ~20% dearer per build (it writes longer weeks). It lost on the one
 * thing this door is judged by — doing what she wrote — and the misses were an injury constraint
 * and a superset request, both twice out of two. Re-probe after any prompt change that targets them.
 */
/*
 * ════ ⛔ ONE PROVIDER, A MODEL PER JOB (founder, 2026-09-28) ════════════════════════════════════
 *
 *   > *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו וזהו הכי פשוט … תחליט אתה רק באיזה מודל ובאיזה
 *   > עוצמה נשתמש בכל אחת מהמטרות … מה יתן לנו מקסימום איכות וחווית משתמש בכל משימה."*
 *
 * Everything above this block is the history of the Gemini years (and it is why the hedges, the
 * ceilings and the race below look the way they do); from today every call is OpenAI's, chosen by
 * the models' own strength and speed as OpenAI states them (September 2026), not by our old probes:
 *
 *   job                          model          reasoning   why
 *   the week (`build`)           gpt-6-sol      high        the one decision we sell, thought through —
 *                                                           the founder's call over Astra (below)
 *     …its fallback              gpt-6-sol      low         a week ALWAYS lands inside her wait
 *   reading her routine          gpt-6-sol      medium      a photo of a handwritten routine is a hard
 *     (`import`, photos too)                                read; every set, rep and weight must survive
 *   reviewing her week           gpt-6-sol      medium      the safety read: a lift that hurts her injury
 *     (`review`)                                            must not survive it — worth a few seconds
 *   a chat turn                  gpt-6-sol      low         short, and she is waiting
 *   the voice: hearing           gpt-transcribe             `voice.ts` — OpenAI's recommended STT (07/2026)
 *   the voice: speaking          gpt-4o-mini-tts, marin     `voice.ts` — its only TTS model; marin is the
 *                                                           most natural of its voices
 *
 * Sol ($2 / $10 per million) is OpenAI's "complex work" tier. I first gave the week Astra ($10 / $50)
 * @ medium; the founder, the same day: *"שים את sol בחשיבה גבוהה במקום astra 6 אני מעריך שזה יעשה
 * את העבודה לא פחות טוב"* — a fifth of the price per week (~$0.14 against ~$0.45). Measure after the
 * first credit: `server/voiceBakeoff.cjs` for the ear and the voice, and the probe (`x-probe-model`,
 * `x-probe-think`) for the week — Sol @ high must finish inside the strong deadline (wait − reserve).
 */
const MODEL = 'gpt-6-sol';
/** Each job's model and reasoning, by `kind` — the fast lane every call runs on (the week's fallback included). */
const JOB_MODEL: Record<string, { model: string; effort: OpenAIEffort }> = {
  build: { model: MODEL, effort: 'low' },
  import: { model: MODEL, effort: 'medium' },
  review: { model: MODEL, effort: 'medium' },
  chat: { model: MODEL, effort: 'low' },
};
/** The week's own model, when her wait leaves room for it (`askStrongModel`): the same Sol, thinking hard. */
const BUILD_STRONG_MODEL = MODEL;
const BUILD_STRONG_EFFORT: StrongEffort = 'high';
/** Below this much declared wait there is no room for the strong model AND the fast one after it. */
const BUILD_STRONG_MIN_WAIT_MS = 30_000;
/** Kept back from the declared wait for the fast model, should the strong one miss (Gemini 3.8's p90 was ~11 s; re-measure Sol's). */
const BUILD_FALLBACK_RESERVE_MS = 13_000;
/** A client may say it waits longer than it does; the strong model is never given more than this. */
const BUILD_WAIT_CAP_MS = 60_000;
/**
 * ⛔ THIS CAP INCLUDES THINKING, AND AT 8192 IT WAS CUTTING PROGRAMMES IN HALF.
 *
 * ⚠️ WATCHED HAPPEN, 2026-08-02: two replies came back as JSON that stopped mid-string. The app
 * reports that as `not_json`, which reaches her as "Not sent" — a whole turn lost, looking exactly
 * like a network failure and caused by nothing of the sort.
 *
 * `thoughtsTokenCount` is billed at the output rate on 3.x, and it is COUNTED AGAINST
 * `maxOutputTokens` too. Measured on a deliberately heavy build — six days, 90 minutes, "as
 * detailed as possible", supersets and running:
 *
 *     prompt          4,688
 *     thinking        5,444      <- 79% of the budget, before a single visible character
 *     visible         1,424
 *                    ──────
 *     against          8,192      finishReason STOP, with ~1,300 to spare
 *
 * That one survived. A seven-day programme, or a week with more items, does not — and the failure
 * is silent, because a truncated reply is indistinguishable from a dropped call.
 *
 * 16,384 leaves the thinking room to run and the programme room to be written. It is a SAFETY NET
 * against a runaway generation, not a budget: the model stops when it is finished, so the usual
 * call is unaffected and only the worst case moves (about $0.12 rather than $0.061 — on a call that
 * has never once happened).
 */
const MAX_OUTPUT_TOKENS = 16_384;
/**
 * ⚠️ THIS CONSTANT IS GONE, AND THE REASONING THAT SET IT WAS WRONG — kept here as a warning.
 *
 * It was raised 90s → 170s on the theory that the post-session call is simply heavy and deserves
 * longer: "a call that takes two minutes and arrives is worth far more than one cut off at ninety
 * seconds". Reasonable, and false. **There is no call that takes two minutes and arrives.** The
 * ceiling at 125s belongs to Cloudflare (see the fetch below), so every second we waited past it
 * bought nothing, and a healthy call of any kind has never once needed more than about twenty.
 *
 * The deadline is per-ATTEMPT now and set from what healthy calls actually cost — see `attemptMs`.
 * A number chosen from what the infrastructure ALLOWS, rather than from what the work COSTS, is a
 * number that only ever measures how long she waits to be told nothing happened.
 */

/** What the app sends. Mirrors `domain/coachPrompt.CoachRequest`, plus the schema to lock onto. */
interface CoachCall {
  blocks: { text: string; cache?: true }[];
  /**
   * Which of the coach's jobs this call is. Read for exactly one decision: whether a call with NO
   * session may pass at all (see `DAILY_ANON_CALLS`). Absent = a signed-in job.
   */
  kind?: 'build' | 'import' | 'review' | 'chat';
  /**
   * How hard to think. Absent means Google's default, `medium`.
   *
   * ⛔ THIS IS NOT A COST KNOB. It is what makes the heaviest call POSSIBLE — see the ceiling
   * documented at the fetch below. The model emits nothing at all while it thinks, so thinking time
   * is dead air on the wire, and dead air is what the ceiling counts.
   *
   * ⚠️ Turning it DOWN is not the fix it looks like. Measured on the same post-session call:
   * `low` answered in 3.9s and wrote a one-exercise week; the default wrote a real one. Thinking
   * level buys the quality of the programme. What we cut instead was the prompt.
   */
  think?: 'minimal' | 'low' | 'medium' | 'high';
  /** `COACH_PLAN_SCHEMA`, in JSON Schema. Absent for a plain chat turn, where prose is the answer. */
  schema?: Record<string, unknown>;
  /**
   * How long the app will wait for this answer, in ms — sent on `build` since 2026-09-27. The
   * Worker picks the strongest model that fits inside it (`BUILD_STRONG_MODEL`); absent — every
   * app before that date — means the fast model alone, because nothing said there was time.
   */
  wait?: number;
  /**
   * ════ WHAT SHE SHOWED IT ════
   *
   * Base64, and the mime type it was encoded as. A photographed programme from a previous coach, the
   * plate markings on an unfamiliar machine, a rack whose numbers she cannot read.
   *
   * ⚠️ THE SIZE LIMIT IS NOT TIDINESS. An image is billed as tokens like everything else, and it
   * arrives base64 — a third larger than the file. `MAX_IMAGE_BYTES` is enforced HERE rather than in
   * the app because the app is the part an attacker controls: a client that skipped its own resize
   * would otherwise be able to spend whatever a phone can encode.
   */
  images?: { mime: string; data: string }[];
}

/**
 * What an image may be, and how many.
 *
 * ~1.3 MB of base64 is roughly a 1 MB JPEG, which is a long way past what the model needs — the app
 * resizes to 1024px before it ever gets here, landing around 150 KB. This is the ceiling that stops
 * a broken or hostile client, not the size we expect.
 */
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_400_000;
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * The same ceiling, for text — because until 2026-09-01 there was NONE. `blocks` was checked for
 * being a non-empty array and nothing else, so a hostile client could post megabytes of text and
 * bill it at Gemini input rates, times three once hedging launched its extra calls.
 *
 * The real app's heaviest request — preamble + athlete file + a season of history — measures in
 * the tens of thousands of characters. These are the hostile-client ceilings, not the expectation,
 * exactly like MAX_IMAGE_BYTES one comment up: generous to every request the app can make, a wall
 * to the one it never would.
 */
const MAX_BLOCKS = 32;
const MAX_TEXT_CHARS = 240_000;
/** Everything together, pre-parse: all four images at ceiling, all the text, and JSON overhead. */
const MAX_BODY_BYTES = 8_000_000;

/**
 * The headers that let a browser talk to this at all.
 *
 * The app is not a browser origin and does not need them. The GALLERY is, and driving this from a
 * desktop browser is how it gets looked at before it ships — which is not a nicety: see the OPTIONS
 * handler below for the bug that only a browser could find.
 */
const CORS = {
  'access-control-allow-origin': '*',
  /*
   * ⚠️ EVERY HEADER THE APP SENDS HAS TO BE NAMED HERE, AND `x-hush-install` WAS NOT.
   *
   * It was added to the client for the rate limit — the one thing that tells one athlete from a
   * script — and this list was not updated with it. A browser then asks permission for a header the
   * answer does not grant, the preflight fails, **the real POST is never sent**, and the app reports
   * `offline` because from its side nothing came back. Nothing appears in any log, on either side.
   *
   * A phone never sees it: a native fetch sends no preflight. So this breaks exactly one thing —
   * driving the coach from a browser, which is the only way anybody looks at it before a build.
   * That is the SECOND time this precise trap has cost an hour (the first was `OPTIONS` answering
   * with a body at a null-body status, 2026-07-31), and both times the symptom was a bare failure
   * with nothing to read.
   */
  'access-control-allow-headers': 'content-type, x-hush-token, x-hush-install, authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
  // Cache the preflight for a day. Without it every single call is TWO round trips, and the first
  // one carries no data — pure latency, on a screen where she is waiting for an answer.
  'access-control-max-age': '86400',
} as const;

/**
 * One JSON reply, with the headers the app needs to read it from a phone.
 *
 * ⛔ `charset=utf-8` IS DECLARED, AND IT IS NOT DECORATION (founder 2026-09-16: *"חלק מהכתב יצא
 * גיבריש"*).
 *
 * Everything this Worker answers with that is not ASCII is the MODEL'S PROSE in the athlete's own
 * language — a week's title, a day's name — and it leaves here as UTF-8 bytes. An `application/json`
 * with no charset leaves the decoding to whatever reads it: the JSON spec says UTF-8, but a reply is
 * read by React Native's fetch on two platforms, by a browser in the web harness, and by whatever
 * proxy sits in front of a gym's wifi — and the historical default for an undeclared text body is
 * Latin-1, one byte per character, which turns every Hebrew letter into two mojibake glyphs.
 *
 * It costs fourteen characters and removes a whole class of guess. The phone refuses mangled prose
 * on its own side too (`domain/modelText`), because a header cannot fix a decoder that ignores it.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

/**
 * Compare two secrets without leaking their contents through how long the comparison took.
 *
 * `a === b` on strings returns early at the first differing character, which is enough to recover a
 * token one character at a time given enough attempts. Overkill for a shared speed-bump token, and
 * it costs three lines.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * ════ /voice/hear AND /voice/say (2026-09-27) ════
 *
 * Reached only past the shared token and the session lookup above. Never throws: every failure is a
 * small JSON the phone reads as "use the on-device ear / Carmit".
 *
 * ⛔ A WORKOUT IS NOT SIGNED IN BY CONSTRUCTION — THIS SAID IT WAS, AND IT COST THE FOUNDER'S FIRST
 * WORKOUT WITH THE VOICE (2026-10-05: *"הקול של האימון לא נשמע טוב זה כמו סירי… היא לא שומעת אותי"*).
 * The route refused every call with no session, on the reasoning that sign-in is a wall at
 * onboarding. It is not: half of all installs meet the account AFTER their first workout (the
 * `signInAfterFirstWorkout` arm), the exchange that mints a session is one fire-and-forget request
 * at sign-in, and a native sign-in that fails degrades to a local stub by design. On that morning the
 * shared KV held not one session — for anyone — so the coach spoke in the phone's own voice and the
 * strong ear heard nothing, and nothing on the phone or here said why.
 *
 * So an install with no session is served from its own, smaller pool (`DAILY_VOICE_ANON_*`), keyed
 * by the install id the app already sends. A signed-in athlete is counted exactly as before.
 */
async function voiceRoute(request: Request, env: Env, path: string, sub: string | null): Promise<Response> {
  const probing = env.PROBE === '1';
  // An install id is a UUID-shaped token the app mints; anything else is not an install.
  const sentInstall = (request.headers.get('x-hush-install') ?? '').trim();
  const install = /^[A-Za-z0-9_-]{8,64}$/.test(sentInstall) ? sentInstall : '';
  if (!sub && !install && !probing) return json({ error: 'unauthorized' }, 401);
  const who = sub ?? `a:${install}`;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > 1_500_000) return json({ error: 'too_large' }, 413);
  const limiter = env.VOICE_LIMIT ?? env.COACH_LIMIT;
  if (limiter && !probing) {
    const { success } = await limiter.limit({ key: `v:${who}` }).catch(() => ({ success: true }));
    if (!success) return json({ error: 'rate_limited' }, 429);
  }
  let body: { audio?: string; text?: string; expect?: string; lang?: string; voice?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const lang = String(body.lang ?? 'he').startsWith('he') ? 'he' : 'en';
  const hearing = path === '/voice/hear';
  if (hearing) {
    if (typeof body.audio !== 'string' || body.audio.length < 100) return json({ error: 'bad_request' }, 400);
    if (body.audio.length > MAX_HEAR_BASE64) return json({ error: 'too_large' }, 413);
  } else {
    const text = String(body.text ?? '').trim();
    if (text.length === 0) return json({ error: 'bad_request' }, 400);
    if (text.length > MAX_SAY_CHARS) return json({ error: 'too_large' }, 413);
  }
  if (env.HUSH_KV && !probing) {
    const day = new Date().toISOString().slice(0, 10);
    const n = (raw: string | undefined, fallback: number) => {
      const x = Number(raw);
      return raw != null && raw !== '' && Number.isFinite(x) && x >= 0 ? x : fallback;
    };
    const spend = async (key: string, ceiling: number): Promise<boolean> => {
      const c = Number((await env.HUSH_KV!.get(key).catch(() => null)) ?? '0');
      if (c >= ceiling) return false;
      await env.HUSH_KV!.put(key, String(c + 1), { expirationTtl: 172_800 }).catch(() => {});
      return true;
    };
    if (!(await spend(`quota:vg:${day}`, n(env.DAILY_VOICE_GLOBAL, 60_000)))) return json({ error: 'budget' }, 503);
    // No session: the anonymous pool's own wall first, then this install's own day.
    if (!sub && !(await spend(`quota:vag:${day}`, n(env.DAILY_VOICE_ANON_GLOBAL, 20_000)))) return json({ error: 'budget' }, 503);
    const mine = hearing ? `quota:vh:${who}:${day}` : `quota:vs:${who}:${day}`;
    const ceiling = sub
      ? (hearing ? n(env.DAILY_VOICE_HEAR, 3000) : n(env.DAILY_VOICE_SAY, 2000))
      : (hearing ? n(env.DAILY_VOICE_ANON_HEAR, 1200) : n(env.DAILY_VOICE_ANON_SAY, 300));
    if (!(await spend(mine, ceiling))) return json({ error: 'rate_limited' }, 429);
  }
  const keys = { OPENAI_API_KEY: env.OPENAI_API_KEY };
  if (hearing) {
    const probeEar = probing ? (request.headers.get('x-probe-ear') ?? '').trim() : '';
    const r = await hear(keys, body.audio!, { expect: String(body.expect ?? 'any'), lang }, probeEar || DEFAULT_EAR);
    // Upstream text never goes back verbatim on a failure — only a short reason the phone logs.
    if (r.ok === true) return json({ text: r.text, model: r.model, ms: r.ms });
    const why = (r as { why: string }).why;
    return json({ error: 'upstream', why: probing ? why : why.slice(0, 24), ms: r.ms }, 502);
  }
  const probeVoice = probing ? (request.headers.get('x-probe-voice') ?? '').trim() : '';
  // Her choice, if it is one of ours; otherwise the default. A probe may try any voice.
  const asked = String(body.voice ?? '');
  const r = await say(keys, String(body.text).trim(), lang, probeVoice || (VOICES.includes(asked) ? asked : DEFAULT_VOICE));
  if (r.ok === true) return json({ audio: toBase64(r.wav), voice: `${r.model}:${r.voice}`, ms: r.ms });
  const why = (r as { why: string }).why;
  return json({ error: 'upstream', why: probing ? why : why.slice(0, 24), ms: r.ms }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
     * ⚠️ THE BODY MUST BE null, AND THIS COST A LIVE BUG.
     *
     * This used to be `json({}, 204)`. 204 means NO CONTENT, and constructing a Response with a
     * body at a null-body status throws — so the preflight failed, so the browser never sent the
     * real request, and every POST from a browser died as a bare "Failed to fetch" with nothing in
     * any log. The Worker had answered `OK` from PowerShell an hour earlier and looked finished.
     *
     * **PowerShell never sends a preflight.** A POST carrying `x-hush-token` from a browser always
     * does. The whole class was invisible to the only client it had been tested with — the same
     * lesson this project keeps paying for: what the harness cannot drive, nobody sees.
     */
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // A GET returns a liveness answer and NOTHING else — no version, no model name, no config. An
    // endpoint that describes itself to a stranger is an endpoint that has told them what to try.
    if (request.method === 'GET') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    if (!env.OPENAI_API_KEY || !env.HUSH_TOKEN) {
      // Misconfigured rather than unauthorised — and said without naming which secret is missing.
      return json({ error: 'unconfigured' }, 500);
    }
    /*
     * BOTH SIDES TRIMMED.
     *
     * A secret set through a shell pipe arrives with the shell's trailing newline attached, and on
     * Windows that is two characters. The length check below then fails and the answer is a flat
     * 401 with nothing to distinguish it from a genuinely wrong token — which is exactly the hour
     * this cost on the first real deploy. Trailing whitespace in a credential is always an accident
     * of how it was typed, never part of the value.
     */
    const sent = (request.headers.get('x-hush-token') ?? '').trim();
    const stored = (env.HUSH_TOKEN ?? '').trim();
    if (!sameSecret(sent, stored)) return json({ error: 'unauthorized' }, 401);

    /*
     * ════ WHO IS ASKING — THE QUESTION A SCRIPT CANNOT ANSWER ════
     *
     * The bearer is the hush-identity session token from her Keychain. Looked up in the shared KV
     * (`session:<token>` → Apple sub) with a 60 s edge cache so the read costs a KV round trip once
     * a minute per athlete, not once per call. An invalid or absent bearer is not an error by
     * itself — REQUIRE_AUTH decides below whether the legacy speed-bump world is still open.
     *
     * The 401 here is deliberately the SAME 401 as a bad shared token: an attacker probing which
     * half of the gate refused them learns nothing.
     */
    let sub: string | null = null;
    if (env.HUSH_KV) {
      const auth = (request.headers.get('authorization') ?? '').trim();
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (bearer.length > 0) {
        sub = await env.HUSH_KV.get(`session:${bearer}`, { cacheTtl: 60 }).catch(() => null);
      }
    }
    /*
     * With auth required, a stranger is turned away UNLESS the body says it is an intake kind —
     * that decision needs the parsed body, so it is taken below, after the parse, and the
     * anonymous install is charged its own small budget there. The 401 for a stranger asking for a
     * signed-in job is the same 401 as a bad shared token.
     */
    const authRequired = env.REQUIRE_AUTH === '1';

    // The voice's two doors (`voice.ts`): an athlete by her session, or — before she has an account —
    // by her install, each out of its own pool; counted apart from the coach either way.
    const path = new URL(request.url).pathname;
    if (path === '/voice/hear' || path === '/voice/say') return voiceRoute(request, env, path, sub);

    /*
     * A body too large to be honest is refused before it is read. Content-length can be absent on a
     * chunked request — the per-field ceilings after the parse catch that path; this one exists so
     * a hundred-megabyte body is never even buffered.
     */
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

    /*
     * ════ THE LIMIT, AND WHY IT IS KEYED ON THE INSTALL ════
     *
     * The token above is a speed bump, not a secret — it ships inside the app bundle, because that
     * is what shipping a client means. Anyone who unpacks the app holds a working key to our Gemini
     * spend, and there was NO limit of any kind here: a loop could have run all night.
     *
     * Keyed on the shared token alone the ceiling would have to be low enough to hurt a real
     * athlete. Keyed on the INSTALL it can be generous to her and still stop a script — an attacker
     * has to mint a new id per request to get past it, which is possible and which makes this a
     * speed bump too. That is the honest description: it turns an open tap into work.
     *
     * The IP is the fallback for a client that sends no id, and the harder key of the two.
     */
    if (env.COACH_LIMIT) {
      const install = (request.headers.get('x-hush-install') ?? '').trim();
      // The session outranks the install as a key: an install id is minted by whoever sends it,
      // a session was minted by us. Only the legacy (pre-bearer) world still keys on the install.
      const key = sub ? `s:${sub}`
        : install.length > 0 ? `i:${install}`
        : `ip:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
      const { success } = await env.COACH_LIMIT.limit({ key }).catch(() => ({ success: true }));
      if (!success) {
        // 429 so the app can say "too many, in a moment" rather than "no connection" — a different
        // sentence, and the only one of the two that is true.
        return json({ error: 'rate_limited' }, 429);
      }
    }

    let call: CoachCall;
    try {
      call = (await request.json()) as CoachCall;
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    if (!Array.isArray(call.blocks) || call.blocks.length === 0) {
      return json({ error: 'bad_request' }, 400);
    }
    // The three calls the intake makes before she has an account: the build, the import's read,
    // and the builder's review of a week she wrote. A chat turn is never anonymous.
    const ANON_KINDS = ['build', 'import', 'review'];
    const anonInstall = (request.headers.get('x-hush-install') ?? '').trim();
    const anonymousIntake = !sub && authRequired && ANON_KINDS.includes(String(call.kind)) && anonInstall.length > 0;
    if (authRequired && !sub && !anonymousIntake) return json({ error: 'unauthorized' }, 401);
    // The text ceilings — see MAX_BLOCKS for why an unbounded body was the worker's biggest hole.
    if (call.blocks.length > MAX_BLOCKS) return json({ error: 'too_large' }, 413);
    let textChars = 0;
    for (const b of call.blocks) textChars += String(b?.text ?? '').length;
    if (textChars > MAX_TEXT_CHARS) return json({ error: 'too_large' }, 413);

    /*
     * ════ THE DAY'S BUDGET — COUNTED AFTER VALIDATION, SPENT BEFORE THE MODEL ════
     *
     * Two approximate counters in KV, reset by the UTC date in their key and erased by TTL:
     *
     *   quota:c:<sub>:<day>   what one account may spend in a day. A real athlete's heaviest
     *                         honest day — intake, a build, a retry, a review — is under ten calls;
     *                         the default of 40 is invisible to her and a wall to her shortcut.
     *   quota:g:<day>         what EVERYONE together may spend — the kill switch. Every other layer
     *                         here can be wrong at once and the worst possible day still costs what
     *                         this number says, times the hedge factor of 3.
     *
     * KV counters race: two concurrent calls can both read n and both write n+1. That undercount is
     * bounded by the per-key rate limit above (30/60 s), and a budget that can be exceeded by a few
     * concurrent calls is a budget; the alternative — a Durable Object serializing every coach call
     * on one object — is a global bottleneck bought to make a ceiling exact that only needs to be
     * real. Counted after validation so a malformed loop cannot starve honest athletes for free.
     */
    if (env.HUSH_KV) {
      const day = new Date().toISOString().slice(0, 10);
      const spend = async (key: string, ceiling: number): Promise<boolean> => {
        const n = Number((await env.HUSH_KV!.get(key).catch(() => null)) ?? '0');
        if (n >= ceiling) return false;
        await env.HUSH_KV!.put(key, String(n + 1), { expirationTtl: 172_800 }).catch(() => {});
        return true;
      };
      /*
       * ⚠️ NOT `Number(x) || default` — zero is falsy, and the first test ever written against this
       * worker proved the kill switch could not be set to KILL: an explicit '0' fell through to
       * 2000 and the call went upstream. An operator who writes 0 means 0.
       */
      const ceiling = (raw: string | undefined, fallback: number) => {
        const n = Number(raw);
        return raw != null && raw !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      const globalCeiling = ceiling(env.DAILY_GLOBAL_CALLS, 2000);
      if (!(await spend(`quota:g:${day}`, globalCeiling))) {
        // 503, not 429: the day's budget being gone is our weather, not her behaviour.
        return json({ error: 'budget' }, 503);
      }
      if (sub) {
        const accountCeiling = ceiling(env.DAILY_ACCOUNT_CALLS, 40);
        if (!(await spend(`quota:c:${sub}:${day}`, accountCeiling))) {
          return json({ error: 'rate_limited' }, 429);
        }
      } else if (anonymousIntake) {
        // A stranger's intake spends the install's own small budget (`DAILY_ANON_CALLS`).
        const anonCeiling = ceiling(env.DAILY_ANON_CALLS, 6);
        if (!(await spend(`quota:a:${anonInstall}:${day}`, anonCeiling))) {
          return json({ error: 'rate_limited' }, 429);
        }
      }
    }

    /*
     * THE PREAMBLE GOES FIRST AND IS SENT VERBATIM.
     *
     * Gemini's implicit caching keys on the START of the request, so the block order the app chose
     * is the whole saving — one reordering here and every call pays full price, silently. The app
     * already marks which block is the stable one; this only has to not disturb it.
     */
    /*
     * ⚠️ AND THE IMAGES GO LAST, AFTER EVERY BLOCK OF TEXT.
     *
     * Not a style choice — it is the same cache rule as above, read one level down. The preamble is
     * byte-identical for every athlete alive and that is what makes the prefix cacheable; a picture
     * inserted anywhere before it, or between the blocks, would push unique bytes into the shared
     * region and every call after it would pay full price, silently.
     *
     * Last also happens to be where a person would put it: the sheet, the question, then "here,
     * look at this".
     */
    const images = Array.isArray(call.images) ? call.images.slice(0, MAX_IMAGES) : [];
    for (const img of images) {
      if (typeof img?.data !== 'string' || !IMAGE_MIME.includes(String(img?.mime))) {
        return json({ error: 'bad_request' }, 400);
      }
      if (img.data.length > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, 413);
    }

    const probing = env.PROBE === '1';
    const probeModel = probing ? (request.headers.get('x-probe-model') ?? '').trim() : '';
    const isBuild = call.kind === 'build';
    const job = JOB_MODEL[String(call.kind ?? 'chat')] ?? JOB_MODEL.chat;
    const model = /^gpt-[\w.-]+$/.test(probeModel) ? probeModel : job.model;
    const probeThink = probing ? (request.headers.get('x-probe-think') ?? '').trim() : '';
    const effort: OpenAIEffort = (['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const).includes(probeThink as never)
      ? (probeThink as OpenAIEffort)
      : job.effort;
    // What the app asked for — it still decides only the lane (a conversational turn is timed apart).
    const think = call.think;
    const promptText = call.blocks.map((b) => String(b.text ?? '')).join('\n\n');

    /*
     * A 404 HERE IS NOT ALWAYS A WRONG MODEL ID — and an hour went into learning that (on Gemini,
     * 2026-08-02: a freshly enabled project listed the model and still 404'd calling it, for a while).
     * A new OpenAI key may do the same until its project has a model enabled and credit behind it.
     * So if this 404s right after a new key: change nothing, wait, call again. Guessing another id
     * costs a deploy and proves nothing — the reply names the model it asked for.
     */
    /*
     * ⛔ THERE IS A 125-SECOND CEILING ON THIS CALL AND IT IS NOT OURS TO RAISE.
     *
     * Measured 2026-08-02, once Gemini was healthy again: the post-session call failed at
     * **125.18s / 125.15s / 125.11s** — the same second every time, with an eight-token call
     * answering in 1.6s either side of it. Not an outage, and not `TIMEOUT_MS` (170s). The status
     * that comes back is 524, a CLOUDFLARE code: it is the Worker's own outbound subrequest being
     * cut off, so no timeout we set on either side can move it.
     *
     * Switching to `:streamGenerateContent?alt=sse` was the obvious fix and **it did not work** —
     * failed at 125.14s, identically. The model emits nothing while it thinks, so a stream is just
     * as idle as a plain request until the first token, and idle is what gets cut.
     *
     * Since 2026-09-28 the call is OpenAI's, read whole (`openaiModel`) — and every deadline here
     * stays under the ceiling: 45s on the fast lane, 110s otherwise, and the strong week at most
     * `BUILD_WAIT_CAP_MS` less its reserve. The app cannot tell; the reply's JSON is the same.
     *
     * ── WHAT ACTUALLY FIXED IT ──────────────────────────────────────────────────────────────────
     * Thinking is the dead air, so the fix was to give the model less to think about. Prompt v15
     * halved the preamble (34,878 → 16,330 chars: a compact catalogue, and rationale moved out of
     * the prompt and into comments). The same call answers in 15.7s now — and answers BETTER. See
     * `coachPrompt.howToAnswer`, where the measurements are.
     *
     * ⚠️ REDUCED, NOT ELIMINATED: one v15 run still hit 125s. That is what the retry below and
     * `retryWaitingUpdate()` in the app are for. Anything that grows this prompt again spends the
     * margin that keeps her week arriving.
     */
    /*
     * ⛔ THE MODEL ID ONCE WENT MISSING FROM THE CALL (2026-09-09): the working tree carried an
     * empty model in the Gemini URL — an uncommitted edit that had never been deployed — and the
     * quota deploy shipped it: every call answered 502 (`upstream 404`) until the redeploy minutes
     * later. The model is asked for and stamped on the reply from the same `model` constant, so the
     * two cannot drift again.
     */
    // ⛔ BAKE-OFF ONLY: a Claude id, on a PROBE version, answers the same call instead of OpenAI.
    if (probing && probeModel.startsWith('claude-') && isProbeProvider(probeModel) && call.schema) {
      try {
        const r = await callProbeProvider(
          { model: probeModel, effort: probeThink || 'default', text: call.blocks.map((b) => String(b.text ?? '')).join('\n\n'), schema: call.schema, images },
          env,
        );
        return json({ text: r.text, finishReason: r.finishReason, usage: r.usage, model: r.model });
      } catch (e) {
        return json({ error: 'upstream_error', why: String((e as Error)?.message ?? e).slice(0, 300) }, 502);
      }
    }

    /*
     * ⛔ THE WEEK IS WRITTEN BY THE STRONGEST MODEL THAT FITS HER WAIT (2026-09-27). Spent after the
     * day's budget like every model call, and bounded so the fast model still has its reserve: a
     * miss of any kind — no key, no credit, a refusal, a cut or unreadable answer, the deadline —
     * falls through to the fast model below, and the reply says which model answered.
     */
    const wait = typeof call.wait === 'number' && Number.isFinite(call.wait) ? Math.min(call.wait, BUILD_WAIT_CAP_MS) : 0;
    let strongMiss: string | undefined;
    if (isBuild && call.schema && !probing && wait >= BUILD_STRONG_MIN_WAIT_MS) {
      const strong = await askStrongModel(
        {
          model: BUILD_STRONG_MODEL,
          effort: BUILD_STRONG_EFFORT,
          text: promptText,
          schema: call.schema,
          deadlineMs: wait - BUILD_FALLBACK_RESERVE_MS,
        },
        env.OPENAI_API_KEY,
      );
      // The app reads `STOP` as "finished" — a completed OpenAI response, already required above.
      // `effort` says which call wrote it: the model is the same Sol on both lanes.
      if (strong.ok) return json({ text: strong.text, finishReason: 'STOP', usage: strong.usage, model: strong.model, effort: BUILD_STRONG_EFFORT });
      strongMiss = strong.why;
    }

    /*
     * HOW LONG ONE ATTEMPT MAY TAKE, and how many attempts there are.
     *
     * Both numbers come from measurement, not from what the infrastructure allows:
     *
     *     a conversational turn (`low`)    1.5–12s observed   →  20s, three attempts
     *     a programme, full thinking        14–20s observed   →  45s, three attempts
     *
     * ⚠️ ONE STALL IN FOUR, AND THEN ONE IN EIGHT. The first cut of this used a single retry at 30s
     * and still lost a call out of eight — 502 at 60.2s, two stalls in a row. A stall is
     * independent of the request (four identical turns went 9.9s, 8.4s, 125.1s, 2.0s), so the
     * answer to a 12% failure is a third attempt, not a longer wait: three chances at 20s is 60s
     * of worst case against roughly one call in six hundred.
     *
     * A stalled attempt is abandoned before it produces anything, so this buys reliability with
     * prompt tokens — about three quarters of a cent in the worst case, and nothing at all in the
     * usual one, because a healthy call never comes near the deadline.
     */
    const conversational = think === 'low' || think === 'minimal';
    /*
     * ⛔ AND THE DEADLINES ARE STAGED, BECAUSE A FLAT ONE MAKES HER PAY THE WORST CASE EVERY TIME.
     *
     * ⚠️ FOUNDER, ON BUILD 39: *"it still takes him a very, very long time to answer messages."*
     * Measured on the exact call the app makes, twelve runs:
     *
     *     1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6 · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6 · (one 60s failure)
     *
     * **A healthy conversational turn is under two seconds.** The stall is not slowness and it is
     * not thinking — `minimal` was no faster than `low` in the good case. It is a call that gets no
     * response at all, about one in six.
     *
     * The flat 20s deadline was sized from the slowest HEALTHY call, which meant every stall cost
     * 20 seconds before we even asked again — and two of them cost 40. That is the founder's
     * complaint exactly: not that the coach is slow, but that when it hangs she pays for it in full.
     *
     * Staged instead. The first attempt is sized to the TYPICAL call, so a stall is abandoned while
     * she is still expecting an answer, and the retry that follows usually lands in a second and a
     * half. Each later attempt gets more room, because by then the question is no longer "is this
     * hung" but "is everything slow right now".
     */
    /*
     * ⛔ HEDGED, NOT RETRIED — AND THE DIFFERENCE IS THE WHOLE FIX.
     *
     * ⚠️ FOUNDER, ON BUILD 39: *"it still takes him a very, very long time to answer messages."*
     *
     * Two earlier attempts at this were both wrong, and the second was worse than the first:
     *
     *   · A FLAT 20s DEADLINE, then retry. Twelve measured calls: 1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6
     *     · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6, plus one outright failure at 60s. About one call in
     *     six gets no response at all, and every one of those cost her the full 20 seconds BEFORE
     *     we even asked again.
     *   · SO I SHORTENED IT to 7s, staged. Fourteen calls, median 5.4s and several at 14–19s —
     *     **worse than what it replaced.** Because a 7s cut cannot tell a stalled call from a live
     *     one that is merely slow: it killed real work at 7s and paid to start over.
     *
     * **You cannot distinguish "hung" from "slow" by waiting. So stop waiting.** A second attempt
     * starts alongside the first without cancelling it, and whichever answers first wins. A slow-
     * but-alive call still wins if it finishes; a truly hung one is simply overtaken. Nobody ever
     * waits out a deadline to discover there is nothing coming.
     *
     * It costs a second call on the minority that are slow — a few tenths of a cent of prompt, on
     * roughly one turn in six — and buys back tens of seconds of somebody staring at a typing
     * indicator. That is a trade this product should take every time.
     *
     * `HEDGE_MS` is set just above the typical call so the common case never spawns a second one.
     * `OVERALL_MS` is the point where we stop hoping; the app waits longer still (`coachClient`).
     */
    /*
     * ⚠️ TUNED FROM THE FAST CASE, NOT THE SLOW ONE. Three identical requests, seconds apart:
     * **1.79s, 9.42s, 1.82s.** A healthy conversational turn is under two seconds, so a call still
     * silent at 2.5 is already the bad draw — and hedging at 4s was firing after the damage.
     *
     * Just above the fast case is the right place: the common turn never spawns a second call at
     * all, and a bad draw gets its replacement while she is still watching the dots.
     */
    /*
     * ⛔ RESIZED FOR COMPLETION, NOT HEADERS (2026-08-30) — see the race below for why the meaning
     * of this number changed under it.
     *
     * ⚠️ 1,800 ms WOULD NOW BE A DISASTER. It was measured against the moment headers come back,
     * which is sub-second for everything; against the moment an ANSWER is finished it is under the
     * fastest call this Worker has ever served, so every single request would spawn all three
     * attempts. The same constant, unchanged, would have tripled the bill silently.
     *
     * The two call shapes finish on completely different clocks, so they get different numbers:
     *
     *   · A CHAT TURN completes in about 1.8s (twelve measured: 1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6
     *     · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6). 3s is just past the healthy band.
     *   · A PLAN BUILD has a median of 8.4s (sixteen measured, listed at the race). 9s sits just
     *     past it, so the ordinary build never spawns a second call and the tail — 11.6, 13.1,
     *     16.4, 19.1, 21.5 — gets a fresh attempt running beside it with time left to win.
     *
     * `schema` is the discriminator because it is the honest one: a structured call IS the build,
     * and a flag would be a second opinion about the same fact.
     */
    const BUILD_HEDGE_MS = 9_000;
    const CHAT_HEDGE_MS = 3_000;
    /* The plan build keeps the fast lane's clocks: it is the fallback inside her wait (`JOB_MODEL`,
       `gpt-6-sol` @ `low` since 2026-09-28), and its hedge is re-measured with the probe after credit. */
    const fastLane = conversational || isBuild;
    const HEDGE_MS = fastLane ? (call.schema ? BUILD_HEDGE_MS : CHAT_HEDGE_MS) : 20_000;
    const OVERALL_MS = fastLane ? 45_000 : 110_000;
    const MAX_IN_FLIGHT = 3;

    /*
     * ════════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ THE RACE IS ON A FINISHED ANSWER, NOT ON HEADERS (2026-08-30).
     *
     * ⚠️ MEASURED ON THIS WORKER, 16 consecutive plan builds, one attempt each:
     *
     *     4.6  4.7✗  5.1  6.1  6.3  6.4✗  7.3  8.2  8.4  8.8  11.6  13.1  16.4  19.1  21.5  3.4✗
     *
     * Three came back TRUNCATED — `finishReason` null, at 4, 465 and 1,124 characters — and four of
     * the thirteen healthy ones arrived after the intake could still use them. Nine in sixteen.
     *
     * ── WHY THE HEDGE COULD NOT SAVE ANY OF THEM ────────────────────────────────────────────────
     * It raced `res.ok` — HEADERS. Headers come back fast from every attempt, healthy or not, so
     * the first one always won within a few hundred milliseconds and every sibling was aborted on
     * the spot. **From that moment there was no recourse.** If the winner's stream then died
     * mid-document, or ground on for twenty-one seconds, the hedge had already thrown away the
     * calls that could have covered for it. It was racing the one part of a streaming call that
     * never varies, and standing down before the part that does.
     *
     * A response with good headers is not an answer. `finishReason === 'STOP'` is an answer. So the
     * attempt now OWNS its whole life — fetch, then read the stream to the end — and the race is
     * decided on the first attempt that comes back complete. Both failures fall out of the same
     * change: a dead stream loses to its sibling, and so does a slow one.
     *
     * ⚠️ AND `HEDGE_MS` HAD TO MOVE WITH IT. 1.8s was tuned against headers; against COMPLETION it
     * would spawn three calls for every build on earth. It is sized from the measurement above:
     * just past the median, so the ordinary call never spawns a second, and the tail gets its
     * replacement while she is still watching the muscles light.
     * ════════════════════════════════════════════════════════════════════════════════════════════
     */
    type Answer = { text: string; finishReason: string | null; usage: Record<string, unknown> | null };

    const stopAt = Date.now() + OVERALL_MS;
    const controllers: AbortController[] = [];
    /*
     * ⚠️ HELD ON AN OBJECT, NOT IN TWO `let`s, AND THE COMPILER IS THE REASON.
     *
     * Both are written from inside an async callback, which TypeScript's flow analysis does not
     * follow — so a bare `let winner: Answer | null = null` is still narrowed to `null` at the
     * bottom of this function, `winner ?? salvage` becomes `never`, and reading `.text` off it is
     * an error. Narrowing on a property is invalidated by any intervening call, which is exactly
     * the truth here: something else may well have assigned it.
     */
    const race: {
      /** The first attempt that came back COMPLETE. Nothing else ends the race. */
      winner: Answer | null;
      salvage: Answer | null;
    } = { winner: null, salvage: null };
    /*
     * ⚠️ `race.salvage` IS THE BEST INCOMPLETE ANSWER, KEPT AS A LAST RESORT — never as a result.
     *
     * A truncated reply is still information: the app reads `finishReason`, counts it, and retries
     * or falls back deliberately. Throwing it away to report `upstream_unreachable` would tell the
     * app the network failed when in fact the model answered and stopped short, which are different
     * problems with different fixes. The race simply refuses to be WON by one.
     */
    let lastStatus: number | undefined;
    let lastWhy: string | undefined;
    let settled = 0;
    let resolveWin!: () => void;
    const won = new Promise<void>((r) => (resolveWin = r));
    /*
     * ⛔ A ONE-SHOT PROMISE IS NOT A REPEATABLE SIGNAL — AND THIS COST A BAD DEPLOY (2026-08-30).
     *
     * This was `const exhausted = new Promise(r => allDone = r)`, raced once per round. A promise
     * stays resolved: the moment the FIRST attempt settled, every later round's `Promise.race`
     * returned instantly, so the loop stopped waiting and fired all three attempts within
     * milliseconds of each other. Three identical calls at once, and the measurement said so —
     * **eleven of sixteen truncated**, against three before the change, with repeated 45-second
     * exhaustions where the old code had none.
     *
     * ⚠️ IT WAS LATENT IN THE OLD CODE TOO. Racing HEADERS meant round one almost always won, so
     * this path was never reached. Moving the race to completion is what walked into it — a bug I
     * did not write so much as uncover, which is the kind that ships.
     *
     * So the signal is re-armed per round, and `idle()` is asked as a QUESTION rather than
     * remembered as an event.
     */
    /** Nothing is in flight: every attempt launched so far has finished, none of them usably. */
    const idle = () => settled >= controllers.length;
    /** Resolves the next time that becomes true. Re-armed each round; a missed edge only costs a wait. */
    let wake: (() => void) | null = null;
    const nextIdle = () => new Promise<void>((r) => (wake = r));
    const allDone = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    const launch = () => {
      const controller = new AbortController();
      controllers.push(controller);
      void (async (): Promise<void> => {
        // One attempt owns its whole life: the call, read to the end, inside the race's own deadline.
        const r = await askOpenAI(
          { model, effort, text: promptText, schema: call.schema, images, deadlineMs: stopAt - Date.now(), maxOutputTokens: MAX_OUTPUT_TOKENS, signal: controller.signal },
          env.OPENAI_API_KEY,
        );
        if (!r.ok) {
          // A status is a real answer about our request and every attempt will get the same one — so
          // it is remembered, not raced. Its text went to `wrangler tail` (`openaiModel`), never here.
          if (r.status !== undefined) lastStatus = r.status;
          if (r.status === 404 || probing) lastWhy = r.why;
          if (r.status === undefined) throw new Error(r.why);
          return;
        }
        const answer: Answer = { text: r.text, finishReason: r.finishReason, usage: r.usage };
        if (answer.finishReason === 'STOP') {
          if (!race.winner) {
            race.winner = answer;
            resolveWin();
          }
          return;
        }
        // Short, or stopped for a reason of its own. It does not win; it waits in case nothing does.
        if (!race.salvage || answer.text.length > race.salvage.text.length) race.salvage = answer;
      })()
        .catch(() => {
          /* aborted, stalled, or the connection died. Nothing to say; another attempt may land. */
        })
        .finally(() => {
          /*
           * ⛔ EVERYTHING IN FLIGHT HAS FAILED — DO NOT SIT OUT THE HEDGE TIMER.
           *
           * ⚠️ Found in the live battery, 2026-08-02: a build came back 503 and the athlete got
           * nothing. The hedge is timed for a call that is STILL RUNNING — waiting before asking
           * again makes sense when the first attempt might yet answer. A 503 already answered: it
           * said no. Waiting is then pure delay, and three of them in a row is the difference
           * between a slow programme and no programme.
           */
          settled += 1;
          if (idle()) allDone();
        });
    };

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    launch();
    for (let n = 1; n <= MAX_IN_FLIGHT && !race.winner; n += 1) {
      const remaining = stopAt - Date.now();
      if (remaining <= 0) break;
      const waitFor = n < MAX_IN_FLIGHT ? Math.min(HEDGE_MS, remaining) : remaining;
      /* ⚠️ ASKED, NOT REMEMBERED. If everything has already finished there is nothing to wait for
         — and waiting on a stale resolved promise is what fired three calls at once. */
      if (!idle()) {
        await Promise.race([
          won,
          // Nothing is in flight any more and none of it was usable — go again NOW rather than
          // waiting out a hedge that was timed for a call still running.
          nextIdle(),
          sleep(waitFor),
        ]);
      }
      if (!race.winner && n < MAX_IN_FLIGHT) {
        // A failure that came back FAST deserves a breath before the next ask; a hedge does not,
        // because the first attempt is still going.
        if (settled >= controllers.length) await sleep(700);
        launch();
      }
    }
    /*
     * Whoever is still running is no longer wanted. Aborting them stops the bytes and the bill.
     *
     * ⚠️ AND THERE IS NO `keep` EXCEPTION ANY MORE, WHICH IS THE POINT: the winner's body was read
     * to the end inside its own attempt, so by the time we are here there is no stream left to
     * cancel. That exception existed only because the old race handed back an unread `Response`.
     */
    for (const c of controllers) c.abort();

    const answer = race.winner ?? race.salvage;
    if (!answer) {
      // Nothing usable from any attempt. If one of them was told something specific, relay THAT
      // rather than a generic unreachable — a 401 must not be reported as a bad connection.
      if (lastStatus === 404) {
        return json({ error: 'upstream_error', status: 404, why: (lastWhy ?? '').slice(0, 300), model }, 502);
      }
      if (lastStatus !== undefined) return json({ error: 'upstream_error', status: lastStatus, ...(probing ? { why: (lastWhy ?? '').slice(0, 300) } : {}) }, 502);
      // Nothing was decided, and the app knows what to do: nothing is written, the update waits.
      return json({ error: 'upstream_unreachable' }, 502);
    }

    return json({
      text: answer.text,
      finishReason: answer.finishReason,
      // Passed through so the app can count what a call actually cost, per model, on real data —
      // the only honest way to compare a cheap model with an expensive one.
      usage: answer.usage,
      model,
      effort,
      // Why the strong model did not write this week, when it was asked to — the one trace of a miss.
      ...(strongMiss ? { strongMiss: strongMiss.slice(0, 160) } : {}),
    });
  },
};
