/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TURNING THE MODEL'S ANSWER INTO A DRAFT SHE CAN EDIT.
 *
 * ⛔ FOUNDER, 2026-08-29: *"ואז על זה מלבישים שינויים במידה ורוצים כמו שאנחנו עורכים במסך בניית
 * האימון."*
 *
 * That sentence decides the whole shape of this file. The model's week does not go to disk, does
 * not become a `CoachPlan`, and does not skip past her — it lands in the BUILDER as a draft, in the
 * same state a proven shelf lands in, and she seals it (or changes it first).
 *
 * ── WHY IT REUSES `materializeTemplate` RATHER THAN PARSING INTO A PROGRAMME ────────────────────
 * `planTemplates` already had to answer this exact question — *"how does a list of ids and set
 * counts become a real week?"* — and its answer is the one this file borrows verbatim: replay it
 * through the builder's own verbs (`blankDraft`/`addDay`/`renameDay`/`addLift`/`setLiftSets`), so
 * the result is **valid by construction**, priced by `builderMinutes`, judged by `builderAdvice`,
 * and sealed by `sealSmart` exactly as a hand-written week is.
 *
 * The alternative — a second path from JSON to `Program` — is how the two would eventually
 * disagree, and the disagreement would be invisible: a week that prices differently from the one
 * beside it on the same shelf.
 *
 * ── WHAT IS REFUSED, AND WHY EACH ONE IS A REAL FAILURE MODE ────────────────────────────────────
 *   · **An id we do not carry.** Dropped silently at the lift level. Models invent ids; the schema
 *     cannot check them because it does not hold the catalogue.
 *   · **A repeated lift inside one day.** Dropped. `everyShelfBuilds` forbids it for a template and
 *     the reason is identical here: two rows of the same exercise is a mistake, not a superset.
 *   · **A set count outside the builder's bounds.** Clamped, never dropped — the lift is right and
 *     the number is a typo, and `setLiftSets` would refuse the write anyway.
 *   · **A day left with nothing in it.** Dropped whole. An empty day is scaffolding, not a session,
 *     and `sealAuthored` prunes it later regardless — better to never show it to her.
 *   · **A pair whose partner did not survive.** Dropped — `pair` means "with the NEXT lift", so a
 *     mark left standing after the row under it was refused would couple two lifts the model never
 *     coupled, and the week would read as if it had. Same for a mark on a day's last seat.
 *   · **Nothing usable at all.** `null`, so the caller can fall back to the local assembler rather
 *     than opening an empty builder over a failed call.
 *
 * ⚠️ IT DOES NOT JUDGE THE WEEK. Volume, balance and session length are `builderAdvice`'s to state
 * — on the screen, to her, as findings she can act on. Silently rejecting a week here for being
 * light would be this file making a coaching decision in the dark.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { exerciseById } from '@/data/exercises';
import { matchLift } from '@/domain/importedPlan';
import type { Program } from '@/data/local/models';
import { BUILDER_SETS_MAX, BUILDER_SETS_MIN } from '@/domain/planBuilder';
import { BUILD_MAX_LIFTS, REPS_MAX, REPS_MIN } from '@/domain/buildPrompt';
import { materializeTemplate, type PlanTemplate } from '@/domain/planTemplates';

/** The model's answer, exactly as `BUILD_WEEK_SCHEMA` shapes it. */
export interface CoachWeekDraft {
  /** The model's own title for the week — see `name` on `BUILD_WEEK_SCHEMA`. Absent when it gave none. */
  name?: string;
  days: { name: string; lifts: { ex: string; sets: number; pair?: boolean; reps?: [number, number] }[] }[];
  /**
   * ⛔ THE LIFTS IT WANTED AND WE DO NOT CARRY (founder 2026-08-29): *"אם כן נוסיף עוד תרגילים ככל
   * שנצטרך."*
   *
   * A catalogue is a vocabulary, and a vocabulary silently bends what gets said. Without this the
   * only trace of a gap is a week quietly worse than the one the model meant to write, and nobody
   * ever learns which lift was missing.
   *
   * ⚠️ IT NEVER TOUCHES HER WEEK — `draftFromCoachWeek` reads `days` and nothing else. This is
   * telemetry, and it is the shopping list for the catalogue.
   */
  missing: string[];
}

/** Read the reply defensively — a shape that does not match is nothing, never a partial week. */

/**
 * The model's rep range for one lift, or nothing (founder 2026-09-07 — see `REPS_MIN` in
 * `buildPrompt`). Two finite integers, low ≤ high, both inside the sane bounds; anything else is
 * DROPPED rather than repaired — a guessed band is a prescription nobody wrote.
 */
function readReps(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const [a, b] = raw;
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const lo = Math.round(a);
  const hi = Math.round(b);
  if (lo < REPS_MIN || hi > REPS_MAX || lo > hi) return undefined;
  return [lo, hi];
}

export function readCoachWeek(json: unknown): CoachWeekDraft | null {
  if (!json || typeof json !== 'object') return null;

  const days = (json as { days?: unknown }).days;
  if (!Array.isArray(days)) return null;
  const out: CoachWeekDraft['days'] = [];
  for (const d of days) {
    if (!d || typeof d !== 'object') continue;
    const name = (d as { name?: unknown }).name;
    const lifts = (d as { lifts?: unknown }).lifts;
    if (typeof name !== 'string' || !Array.isArray(lifts)) continue;
    const rows: CoachWeekDraft['days'][number]['lifts'] = [];
    for (const l of lifts) {
      if (!l || typeof l !== 'object') continue;
      const ex = (l as { ex?: unknown }).ex;
      const sets = (l as { sets?: unknown }).sets;
      if (typeof ex !== 'string' || typeof sets !== 'number' || !Number.isFinite(sets)) continue;
      /* ⚠️ `true` AND NOTHING ELSE. A truthy string, a 1, an object — every one of those is a reply
         that did not say what the field means, and a pair invented out of a stray value would bind
         two lifts the model never coupled. Absent is the answer for everything but the word. */
      const pair = (l as { pair?: unknown }).pair === true;
      const reps = readReps((l as { reps?: unknown }).reps);
      rows.push({ ex, sets, ...(pair ? { pair: true } : {}), ...(reps ? { reps } : {}) });
    }
    /* The per-day cap lives HERE since 2026-09-07, not in the schema — see the note at `lifts` in
       `buildPrompt`. A day past it is a malformed reply; the tail is dropped, the day stands. */
    out.push({ name, lifts: rows.slice(0, BUILD_MAX_LIFTS) });

  }
  if (out.length === 0) return null;
  /* Optional, and read with the same suspicion as everything else: a non-array is no gap reported,
     never a crash, and a non-string entry is dropped rather than logged as `[object Object]`. */
  const wanted = (json as { missing?: unknown }).missing;
  const missing = Array.isArray(wanted)
    ? wanted
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .map((m) => m.trim().slice(0, 60))
        /*
         * ⛔ IF WE HAVE IT, IT IS NOT MISSING — whatever the model meant by saying so (2026-08-30).
         *
         * Caught live: with the ask *"בלי מוט ישר"* the reply named `Barbell Bench Press` in
         * `missing`. We carry that lift; what the model meant was *"I wanted it and the athlete
         * ruled it out"*. Another run said `Barbell exercises avoided per request` outright. The
         * field is being used for two different sentences — "you do not stock this" and "I chose
         * not to" — and only the first is a catalogue gap.
         *
         * Unfiltered, the shopping list this field exists to produce fills with lifts we already
         * have, and becomes a list nobody can act on. Resolved with `matchLift`, the same
         * conservative matcher the ids go through, so "we have it under another name" also counts
         * as having it.
         *
         * ⚠️ FILTERED HERE RATHER THAN FORBIDDEN IN THE PROMPT, because a line policing the field
         * would cost characters measured to be worth more to the athlete — and would still not
         * stop it. The check belongs where the truth is: we know what we stock; the model is
         * guessing.
         */
        .filter((m) => !matchLift(m).id)
    : [];
  /* The title, read like everything else: a string, trimmed, bounded; anything else is no title. */
  const rawName = (json as { name?: unknown }).name;
  const name = typeof rawName === 'string' ? rawName.trim().slice(0, 80) : '';
  return { days: out, missing, ...(name ? { name } : {}) };
}

/**
 * The model's week, as a builder draft — or `null` when nothing in it survived.
 *
 * `dayNamer` names a day the model left blank. The caller passes the builder's own
 * `builder.dayNamed` ("אימון A") — see the note at the substitution for why a blank cannot simply
 * be left to fall through.
 */
export function draftFromCoachWeek(
  /* ⚠️ `Pick<…, 'days'>` AND NOT THE WHOLE REPLY, so the type says what the prose says: this
     function cannot see `missing`, and no future edit can quietly start building a week out of a
     list of lifts we do not have. */
  week: Pick<CoachWeekDraft, 'days' | 'name'>,
  opts: { id?: string; dayNamer?: (index: number) => string } = {},
): Program | null {
  const days: PlanTemplate['days'] = [];
  for (const day of week.days) {
    const seen = new Set<string>();
    const lifts: { ex: string; sets: number; pair?: boolean; reps?: [number, number] }[] = [];
    for (const l of day.lifts) {
      /*
       * ⛔ A NAME WHERE AN ID WAS ASKED FOR IS STILL AN ANSWER (found live, 2026-08-30).
       *
       * The catalogue was enriched on 2026-08-29 so the model could recognise a lift by any of its
       * names — English, Hebrew, or one of the 71 synonyms — and that created its own failure mode
       * one day later: it returned `"pulldown"`, which is `lat_pulldown`'s synonym and not an id.
       * The old line dropped it, so a lift the model deliberately chose vanished from her week with
       * nothing anywhere saying so. **A better vocabulary must not become a worse week.**
       *
       * ⚠️ RESOLVED WITH THE IMPORTER'S OWN MATCHER, not a new one. `matchLift` is conservative by
       * construction — exact name, declared synonym, or a containment that hits exactly ONE lift,
       * and no edit distance or "closest" anywhere — and it is the same function the product already
       * trusts with a programme she photographed. A second matcher here would be a second opinion
       * about what her week says.
       */
      const id = exerciseById(l.ex) ? l.ex : matchLift(l.ex).id;
      /*
       * ⛔ A DROPPED LIFT TAKES THE PAIR ABOVE IT WITH IT (2026-08-31).
       *
       * `pair` means "with the lift AFTER this one", and the lift after this one is whatever ends
       * up in the next seat — so when a row vanishes here (an invented id, or the same lift twice)
       * the mark above it silently re-aims at a stranger. That is the one way this feature could
       * hand her a couple she was never offered, and it is invisible: the week is valid, the seam
       * reads "superset", and nothing anywhere says the model meant a different partner.
       *
       * A mark is only ever kept when BOTH of its lifts survived, side by side, in that order.
       */
      if (!id || seen.has(id)) {
        // genuinely not ours, or twice in one day — a mistake, never a superset
        if (lifts.length > 0) delete lifts[lifts.length - 1].pair;
        continue;
      }
      seen.add(id);
      lifts.push({
        ex: id,
        sets: Math.min(BUILDER_SETS_MAX, Math.max(BUILDER_SETS_MIN, Math.round(l.sets))),
        ...(l.pair ? { pair: true as const } : {}),
        ...(l.reps ? { reps: l.reps } : {}),
      });

    }
    /* A mark on the last seat has no partner to reach. `materializeTemplate` would ignore it and
       `togglePair` would refuse it; it is dropped here so the draft says only what is true. */
    if (lifts.length > 0) delete lifts[lifts.length - 1].pair;
    if (lifts.length === 0) continue; // an empty day is scaffolding, not a session
    /*
     * ⛔ A BLANK NAME IS RESOLVED HERE AND NOT LEFT TO FALL THROUGH, and "do nothing" is a trap
     * rather than a neutral choice: `renameDay` ignores an empty string and keeps what `blankDay`
     * chose, and `materializeTemplate` builds from `blankDraft()` with no namer — so the fallback
     * is the ENGLISH literal `Workout A`, sitting inside a Hebrew athlete's week. `dayNamer` is the
     * builder's own copy, which makes a day the model did not name indistinguishable from a day she
     * added with the plus button. Which is what it is.
     */
    days.push({ nameKey: day.name.trim() || opts.dayNamer?.(days.length) || '', lifts });
  }
  if (days.length === 0) return null;

  /*
   * ⚠️ `nameKey` CARRIES A LITERAL NAME HERE, and the type invites it: `materializeTemplate` takes
   * the resolver, so a shelf passes i18n keys and this passes the model's own words. Day names are
   * plain renameable data in storage — a live key there would re-translate under her after she
   * took ownership, which is `planTemplates`'s own note and the reason the seam exists at all.
   */
  const program = materializeTemplate({ id: opts.id ?? 'coach', days }, (name) => name) as Program;
  /* The author's title rides on the programme (`Program.title`), where the reveal and the ready
     screen read it ahead of the shape heuristic — see `programmeName`. */
  return week.name ? { ...program, title: week.name } : program;
}

