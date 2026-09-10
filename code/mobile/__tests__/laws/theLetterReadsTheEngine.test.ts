/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SURFACES READ THE THING THAT MAKES THE DECISIONS.
 *
 * ⛔ On 2026-08-12 `sessionStore` stopped calling `askAfterSession` and the v5 engine took over every
 * load, band and volume decision. That was deliberate and five comments in the codebase record it.
 * What nobody moved was the READERS. Three surfaces went on drawing their numbers out of `coachLog`
 * and `coachPlan`, and the only thing that writes either is `screens/dev/gallery.tsx` — so on a real
 * phone they are empty for ever, and the product spent a week telling every athlete:
 *
 *   · the Saturday letter — "I changed nothing this week", every week, whatever the engine did;
 *   · Home — 0 loads raised on the week-complete band, and never a tinted load on the front door;
 *   · a lift's All-changes tab — N identical rows reading "held", for decisions that were raises.
 *
 * Meanwhile `getWeeklyPlanV5` stamped, narrated and unit-tested every one of those decisions, and
 * had no production caller at all. `everythingBuiltCanBeReached` could not see it: that law asks
 * whether SCREENS are navigated to and whether COMPONENTS are rendered. It never asks whether a
 * data-layer read has a caller, which is exactly the shape of this failure.
 *
 * These are source assertions on purpose. The bug was never in what the screens do with the data —
 * every one of them handles it correctly — it was in which door they knocked on.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Every production file (the dev gallery is a harness, not a caller). */
function productionSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !p.includes(`${path.sep}dev${path.sep}`)) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

const callers = (symbol: string, exclude: string) =>
  productionSources().filter((p) => !p.endsWith(exclude) && new RegExp(`\\b${symbol}\\s*\\(`).test(fs.readFileSync(p, 'utf8')));

describe('⛔ the Saturday letter reads the engine', () => {
  const letter = () => read('screens/weekly/WeeklyUpdate.tsx');

  it('asks for the engine week, and puts it where the rows are drawn from', () => {
    expect(letter()).toContain("from '@/domain/weeklyUpdate'");
    expect(letter()).toContain('getWeeklyPlan(program)');
    expect(letter()).toContain('if (engineWeek) setView(engineWeek)');
  });

  it('⚠️ and flips `loaded` only once both reads are in — the steady page is not a race', () => {
    const src = letter();
    // The coach log and the programme are read together; `loaded` follows both.
    expect(src).toContain('db.loadCoachLog().catch(() => null)');
    expect(src).toContain('db.loadProgram().catch(() => null)');
    // `lastIndexOf`: the harness preview branch above sets `loaded` too, and legitimately early —
    // it was handed the week, so there is nothing left to wait for.
    expect(src.indexOf('const engineWeek')).toBeLessThan(src.lastIndexOf('setLoaded(true)'));
  });

  it('marks the week read when she dismisses it', () => {
    expect(letter()).toContain('void markWeeklyUpdateSeen()');
  });
});

describe('⛔ Today colours a load from the log that recorded the move', () => {
  const home = () => read('screens/home/Home.tsx');

  it('reads the engine state and builds its directions from the change log', () => {
    expect(home()).toContain('db.loadEngineV5()');
    expect(home()).toContain("engineDirections[c.exerciseId] = c.loadTo > c.loadFrom ? 'up' : 'down'");
  });

  it('⚠️ and a hold is not a direction — the log only ever holds a move', () => {
    // `coachLoadDirections` wrote 'hold' for an unchanged load, and `changesIn` counts truthy
    // values — which is how a card said "6 CHANGES" over a sheet that said nothing changed.
    expect(home()).toContain('c.loadFrom === c.loadTo) continue;');
  });
});

describe('⛔ a lift says why it moved, from the log that moved it', () => {
  it('the All-changes tab reads the engine first and the coach only as a fallback', () => {
    const src = read('screens/progress/LiftDetail.tsx');
    expect(src).toContain('db.loadEngineV5()');
    expect(src).toContain('const fromEngine = liftChanges(engineLog ?? undefined, exerciseId)');
    expect(src).toContain('if (fromEngine.length > 0) return fromEngine;');
  });

  it("⚠️ and the coach's own sentence is printed, because only that mapper writes one", () => {
    // An engine row's `decision` is a CODE (`stall_backoff`); a coach row's is a written line.
    expect(read('domain/liftDetail.ts')).toContain('spoken: true');
    expect(read('screens/progress/LiftDetail.tsx')).toContain('change.spoken && change.decision');
  });
});

describe('⛔ a read with no caller is not a feature', () => {
  /**
   * The generic form of the whole failure. `everythingBuiltCanBeReached` proves a screen is
   * navigated to and a component is rendered; nothing proved that the engine's own read-backs are
   * ever CALLED. These three went dark for a week without a single test noticing.
   */
  it('the weekly-plan reads are called from the app, not only from a test', () => {
    expect(callers('getWeeklyPlan', 'weeklyUpdate.ts').length).toBeGreaterThan(0);
    expect(callers('markWeeklyUpdateSeen', 'weeklyUpdate.ts').length).toBeGreaterThan(0);
  });
});
