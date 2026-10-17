/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * BRING YOUR LOG — another app's export becomes her record (2026-09-01, audit M1).
 *
 * The one switching cost in this category is the log: two years of sets held hostage by whichever
 * app she happened to start in. Strong and Hevy both export it as CSV, both from a menu any user
 * can find. This module reads either file into `Session[]` — HER sessions, on Hush's own record —
 * and the whole product downstream simply works: History shows them, tonnage and the weeks count
 * are hers, the milestones are retroactively correct (their own stated design), and the engine
 * starts HOT.
 *
 * ── ⛔ IMPORTED SESSIONS ARE NOT `freeform`, AND THAT IS THE POINT ──────────────────────────────
 * `freeform` exists for a one-off deviation ("a holiday PR single must not read as a failed
 * floor") and the engine rightly skips it. A bulk import is the opposite thing: it IS her training
 * history — the substrate S-58 names. Left unmarked, `advanceV5` folds the imported sessions
 * oldest-first on its first run, replaying her whole history through Loop 2 — so her grids, rails,
 * learned rests and per-rung slopes land exactly where they had stood if Hush had been there all
 * along. **Every competitor's day one is a guess; for an athlete who brought her log, ours is a
 * measurement.** (For an athlete with EXISTING Hush history, sessions older than the fold cursor
 * are never re-folded — they only deepen the init reads — so an import can never rewrite a
 * standing decision.)
 *
 * ── MATCHING IS LOCAL AND HONEST ────────────────────────────────────────────────────────────────
 * Names go through `matchLift` — the import's own three-tier matcher: exact, declared synonym, or
 * unambiguously contained. NO edit distance, NO model call: a file is thousands of rows and the
 * same name repeats hundreds of times, so the unmatched names are reported ONCE each, with their
 * row counts, and those rows are left out rather than guessed at. What is written is only what was
 * recognised; the report says exactly what was not.
 *
 * ── WHAT IS DELIBERATELY NOT IMPORTED ───────────────────────────────────────────────────────────
 * Cardio/duration rows (a Strong "Seconds" row, a Hevy distance set) — the strength record is the
 * substrate the engine reads; runs belong to the cardio record and a half-parsed run is worse than
 * none. Warm-up rows are kept but marked `isApproach`/`isWarmup`, the one mark every engine read
 * already filters. And the TRIAL is untouched: `modeState` counts live Hush workouts only —
 * logging what she already did burns nothing (the free-log's own law).
 *
 * Pure & I/O-free. The screen owns the picker and the confirm; `db.appendImportedHistory` owns the
 * merge.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session, SetLog, Units } from '@/data/local/models';
import { matchLift } from '@/domain/importedPlan';

const LB_TO_KG = 0.45359237;

export interface HistoryImportReport {
  /** Sessions ready to append, oldest first. */
  sessions: Session[];
  /** Distinct recognised lifts (catalogue ids). */
  recognisedLifts: number;
  /** Names nothing in the catalogue answered, worst offenders first: [name, row count]. */
  unmatched: [string, number][];
  /** Working rows written / working rows seen (excludes cardio + blank rows). */
  rowsKept: number;
  rowsSeen: number;
  /** First and last session instants (ms), for the confirm sentence. 0/0 when empty. */
  firstMs: number;
  lastMs: number;
}

/** A minimal CSV reader: quoted fields, escaped quotes, \r\n — nothing more exotic than the two
 *  real exports need. Returns rows of raw cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

type Format = 'strong' | 'hevy';

/** Which app wrote this file — by its own header words, never guessed from content. */
export function detectFormat(header: string[]): Format | null {
  const h = header.map((x) => x.trim().toLowerCase());
  if (h.includes('exercise_title') && (h.includes('start_time') || h.includes('title'))) return 'hevy';
  if (h.some((x) => x === 'exercise name') && h.some((x) => x === 'date')) return 'strong';
  return null;
}

/** Hevy's older exports write "14 Jan 2023, 09:35"; newer ones are ISO. Parse both, else NaN. */
function parseWhen(raw: string): number {
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return t;
  const m = /^(\d{1,2}) (\w{3}) (\d{4}),? (\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return NaN;
  return Date.parse(`${m[2]} ${m[1]}, ${m[3]} ${m[4]}:${m[5]}`);
}

interface RawSet {
  name: string;
  weightKg: number | null;
  reps: number;
  warmup: boolean;
}

/** Sanity rails on a row — a 700 kg squat in a CSV is a data error, not a record. */
const plausible = (weightKg: number | null, reps: number): boolean =>
  reps >= 1 && reps <= 100 && (weightKg == null || (weightKg > 0 && weightKg <= 500));

/**
 * Parse an export into sessions. `unitsHint` covers the one ambiguous case — a Strong file whose
 * weight column is headed plain "Weight" carries whatever unit the app was set to, so the caller
 * passes her own (the person importing her own log is the person whose unit it was). Hevy and a
 * unit-suffixed Strong header need no hint.
 */
export function parseHistoryCsv(text: string, unitsHint: Units = 'kg'): HistoryImportReport {
  const rows = parseCsv(text);
  const empty: HistoryImportReport = {
    sessions: [],
    recognisedLifts: 0,
    unmatched: [],
    rowsKept: 0,
    rowsSeen: 0,
    firstMs: 0,
    lastMs: 0,
  };
  if (rows.length < 2) return empty;
  const header = rows[0];
  const format = detectFormat(header);
  if (!format) return empty;

  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idxStarts = (name: string) => header.findIndex((h) => h.trim().toLowerCase().startsWith(name));

  // Group working rows by workout instance, keyed by (when, title).
  const groups = new Map<string, { whenMs: number; title: string; sets: RawSet[] }>();
  let rowsSeen = 0;
  const unmatchedCount = new Map<string, number>();
  const matched = new Map<string, string | null>(); // raw name -> catalogue id (memoised)

  const push = (whenMs: number, title: string, s: RawSet) => {
    if (!Number.isFinite(whenMs) || whenMs <= 0) return;
    const key = `${whenMs}|${title}`;
    const g = groups.get(key) ?? { whenMs, title, sets: [] };
    g.sets.push(s);
    groups.set(key, g);
  };

  if (format === 'hevy') {
    const iTitle = idx('title');
    const iStart = idx('start_time');
    const iEx = idx('exercise_title');
    const iType = idx('set_type');
    const iW = idx('weight_kg');
    const iReps = idx('reps');
    const iDist = idx('distance_km');
    const iDur = idx('duration_seconds');
    for (const r of rows.slice(1)) {
      const name = (r[iEx] ?? '').trim();
      if (!name) continue;
      // A distance/duration set is cardio-shaped — deliberately out (see header).
      if ((iDist >= 0 && Number(r[iDist]) > 0) || (iDur >= 0 && Number(r[iDur]) > 0 && !Number(r[iReps]))) continue;
      rowsSeen++;
      const reps = Math.round(Number(r[iReps]));
      const wRaw = r[iW] === '' || r[iW] == null ? null : Number(r[iW]);
      const weightKg = wRaw != null && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null;
      if (!plausible(weightKg, reps)) continue;
      push(parseWhen(r[iStart] ?? ''), (r[iTitle] ?? '').trim() || 'Workout', {
        name,
        weightKg,
        reps,
        warmup: (r[iType] ?? '').trim().toLowerCase() === 'warmup',
      });
    }
  } else {
    const iDate = idx('date');
    const iTitle = idx('workout name');
    const iEx = idx('exercise name');
    const iOrder = idx('set order');
    const iRepsCol = idx('reps');
    const iSeconds = idx('seconds');
    // "Weight", "Weight (kg)" or "Weight (lb)" — the header names the unit when it names one.
    const iW = idxStarts('weight');
    const headerW = (header[iW] ?? '').toLowerCase();
    const fileUnit: Units = headerW.includes('(lb)') ? 'lb' : headerW.includes('(kg)') ? 'kg' : unitsHint;
    for (const r of rows.slice(1)) {
      const name = (r[iEx] ?? '').trim();
      if (!name) continue;
      const reps = Math.round(Number(r[iRepsCol]));
      // A seconds-only row (plank, cardio) has no rep record — out, like Hevy's distance sets.
      if (!(reps >= 1) && iSeconds >= 0 && Number(r[iSeconds]) > 0) continue;
      rowsSeen++;
      const wRaw = r[iW] === '' || r[iW] == null ? null : Number(r[iW]);
      let weightKg = wRaw != null && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null;
      if (weightKg != null && fileUnit === 'lb') weightKg = Math.round(weightKg * LB_TO_KG * 100) / 100;
      if (!plausible(weightKg, reps)) continue;
      push(parseWhen(r[iDate] ?? ''), (r[iTitle] ?? '').trim() || 'Workout', {
        name,
        weightKg,
        reps,
        warmup: (r[iOrder] ?? '').trim().toUpperCase() === 'W',
      });
    }
  }

  // Match names once each (a file repeats a lift hundreds of times), then build sessions.
  const matchOf = (name: string): string | null => {
    if (matched.has(name)) return matched.get(name) ?? null;
    const id = matchLift(name).id;
    matched.set(name, id);
    return id;
  };

  const sessions: Session[] = [];
  let rowsKept = 0;
  const recognised = new Set<string>();
  const ordered = [...groups.values()].sort((a, b) => a.whenMs - b.whenMs);
  for (const g of ordered) {
    const logs: SetLog[] = [];
    const perLiftIndex = new Map<string, number>();
    for (const s of g.sets) {
      const id = matchOf(s.name);
      if (!id) {
        unmatchedCount.set(s.name, (unmatchedCount.get(s.name) ?? 0) + 1);
        continue;
      }
      recognised.add(id);
      rowsKept++;
      const setIndex = perLiftIndex.get(id) ?? 0;
      perLiftIndex.set(id, setIndex + 1);
      logs.push({
        exerciseId: id,
        setIndex,
        recommendedWeight: null, // nobody prescribed this — the engine's receipt stays honest
        recommendedReps: s.reps,
        actualWeight: s.weightKg,
        actualReps: s.reps,
        edited: false,
        persistedAt: new Date(g.whenMs).toISOString(), // the file's own instant — the only one we have
        ...(s.warmup ? { isApproach: true, isWarmup: true } : null),
      });
    }
    if (logs.length === 0) continue;
    sessions.push({
      id: `imported_${g.whenMs}_${sessions.length}`,
      programDayId: 'imported',
      programDayName: g.title,
      startedAt: new Date(g.whenMs).toISOString(),
      state: 'SAVED',
      earlyFinish: false,
      trained: true, // she trained — the workouts and the weeks are hers
      sets: logs,
    });
  }

  return {
    sessions,
    recognisedLifts: recognised.size,
    unmatched: [...unmatchedCount.entries()].sort((a, b) => b[1] - a[1]),
    rowsKept,
    rowsSeen,
    firstMs: sessions.length ? Date.parse(sessions[0].startedAt) : 0,
    lastMs: sessions.length ? Date.parse(sessions[sessions.length - 1].startedAt) : 0,
  };
}
