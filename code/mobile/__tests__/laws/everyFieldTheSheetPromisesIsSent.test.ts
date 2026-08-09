// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { coachFacts } from '@/domain/coachFacts';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY FIELD THE SHEET DECLARES IS ACTUALLY FILLED IN AND SENT.
 *
 * The recurring defect of this build, and never once a crash: a field one layer promises and
 * another never receives.
 *
 *   · `Session.items` — declared "the canonical record", documented at length, written by nothing.
 *     The type existed; the data never did, for a whole build.
 *   · `FactPerformed` carried her ladder and her last set and said nothing about WHEN — so a bench
 *     stuck at 40 kg for four sessions and one that had just moved up were the same message, and
 *     the coach was deciding with less than the engine had.
 *
 * `coachFacts` is where this costs the most, because its reader is not our code. Nothing in `src`
 * consults `ago` or `askedLoad`; the sheet is serialised and sent, and the model reads it. So the
 * usual question — "does anybody read this?" — has no meaning here, and the honest one is **"does
 * anybody FILL it?"** A field declared and absent from the message is a decision made blind, and
 * every test in the suite passes while it happens.
 *
 * It is checked by BUILDING a real sheet for an athlete with a real record, not by grep. A field
 * that survives this is a field the coach genuinely receives.
 *
 * ── ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
 * The first draft had a second half: for internal seams (`Step`, `ItemResult`), assert every field
 * is READ somewhere — written to catch `Step.restAfterS`, which the whole app diligently filled in
 * and nobody consulted. **It could not fail on its own motivating example.** `restAfterS` is a
 * field name on `PlannedBlock`, on `RunStep` and on `Step`; the other two are read, so a name-based
 * check is satisfied no matter what the third one does. Narrowing it to "the files that consume
 * this type" would be a hand-maintained list of exactly the kind that goes stale silently.
 *
 * It was cut rather than shipped green. A law that cannot go red on the bug it was written for is
 * not a law — it is a comment with a test runner attached, and the next person to read it will
 * trust it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..');

/** The property names declared on `interface Name { … }`, in `file`. */
function fieldsOf(file: string, name: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = text.search(new RegExp(`(export )?interface ${name}\\b[^{]*\\{`));
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  let depth = 0;
  let i = text.indexOf('{', start);
  const open = i;
  do {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  } while (i < text.length && depth > 0);
  const body = text
    .slice(open + 1, i - 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // Top-level properties only: a nested object literal's keys belong to their own shape.
  const fields: string[] = [];
  let nest = 0;
  for (const line of body.split('\n')) {
    if (nest === 0) {
      const m = /^(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:/.exec(line.trim());
      if (m) fields.push(m[1]);
    }
    nest += (line.match(/[{[]/g) ?? []).length - (line.match(/[}\]]/g) ?? []).length;
  }
  return [...new Set(fields)];
}

const FACTS = 'src/domain/coachFacts.ts';

/**
 * `rare` fields are absent on purpose for an athlete who does not have them — she did not answer
 * the effort question, she did not correct a set. Absent is an honest value and must stay possible;
 * the last test proves they DO appear for an athlete who has them, which is the other half.
 */
const SHEET: { type: string; rare?: string[] }[] = [
  { type: 'FactPerformed' },
  { type: 'FactOccurrence', rare: ['effort'] },
  { type: 'FactLift', rare: ['effort'] },
  { type: 'FactSet', rare: ['edited', 'rest'] },
];

/** One athlete with a real record: a lift done twice, effort answered, a set corrected, rest taken. */
function sheet(): string {
  const set = (setIndex: number, w: number, r: number, edited = false) => ({
    exerciseId: 'bb_bench_press', setIndex, recommendedWeight: w, recommendedReps: 8,
    actualWeight: w, actualReps: r, edited, restBeforeS: 95,
    persistedAt: `2026-08-01T10:0${setIndex}:00.000Z`,
  });
  const session = (day: number, w: number) => ({
    id: `s${day}`, programDayId: 'd1', startedAt: `2026-07-${20 + day}T10:00:00.000Z`,
    state: 'SAVED' as const, earlyFinish: false, trained: true,
    sets: [set(0, w, 9), set(1, w, 8, true)],
    effort: [{ exerciseId: 'bb_bench_press', level: 'about_right' as const, at: `2026-07-${20 + day}T10:30:00.000Z` }],
  });
  const history = [session(1, 30), session(8, 32.5)];
  return JSON.stringify(
    coachFacts({
      profile: { sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false },
      plan: null,
      history,
      justFinished: history[1],
      nowMs: Date.parse('2026-08-02T10:00:00.000Z'),
    }),
  );
}

describe('every field the sheet declares is filled in and sent', () => {
  it.each(SHEET)('$type', ({ type, rare = [] }) => {
    const json = sheet();
    const missing = fieldsOf(FACTS, type).filter((f) => !rare.includes(f) && !json.includes(`"${f}"`));
    expect(missing).toEqual([]);
  });

  it('…and the ones that may be absent DO arrive when she has them', () => {
    const json = sheet();
    // ⚠️ `effort` was here and is gone: the mid-workout question that produced it was deleted by
    // the founder (2026-08-02), so the field would now be one the sheet declares and nothing ever
    // fills — the exact defect this law exists to catch, arriving from the other direction.
    for (const field of ['edited', 'rest']) {
      expect({ field, sent: json.includes(`"${field}"`) }).toEqual({ field, sent: true });
    }
  });

  it('⚠️ states WHEN, on every occurrence — the gap that made a stall invisible', () => {
    // The specific thing that was missing, kept as its own assertion because it is the one a future
    // trim would take first: `ago` looks like metadata and is the difference between "she is stuck"
    // and "she just moved up".
    const performed = JSON.parse(sheet()).performed as { recent: { ago: number }[] }[];
    expect(performed[0].recent.every((o) => typeof o.ago === 'number')).toBe(true);
    // Two sessions, twelve days and five days ago — the coach can see the gap between them.
    expect(performed[0].recent.map((o) => o.ago)).toEqual([5, 12]);
  });
});
