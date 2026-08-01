import fs from 'fs';
import path from 'path';

/**
 * ════ THE ENGINE DECIDES NOTHING BETWEEN SESSIONS ════
 *
 * The founder's ruling, and he had to say it twice before I heard it:
 *
 *   > *"The engine decides DURING the workout only, on the basis of what it sees, and that is it.
 *   > Everything outside the workout is the AI's decision."*
 *
 * Loop 2 (the next load, and whether a lift had graduated or should rotate) and Loop 3 (how many
 * sets a muscle had earned) are deleted, with the `advanceV5` fold that ran them. Loop 1 stays: it
 * corrects a load WITHIN a set when her reps fall outside the band the coach set. That is not a
 * second opinion about her training — it is the execution of the first one.
 *
 * ── WHY A LAW AND NOT JUST A DELETION ───────────────────────────────────────────────────────────
 * Because the failure mode is somebody putting it back, and it will look like a kindness when they
 * do. No connection means no new programme; a deterministic floor is the obvious fix. It was
 * proposed once — by me — and overruled:
 *
 *   > **A second decider is precisely what was removed**, and one that only runs when the real one
 *   > is unreachable is the worst version of it, because it appears exactly when she has no way to
 *   > tell the two apart.
 *
 * ── WHAT WENT WITH IT, AND WHAT REPLACED IT ─────────────────────────────────────────────────────
 * Three laws died here, and their reasons are worth keeping:
 *
 *   · `theProgrammeSurvivesTheMonths` simulated 16 weeks and caught five defects that were only
 *     visible one PROGRAMME at a time rather than one decision at a time. Its subject no longer
 *     exists. The equivalent evidence for the coach is measured, not simulated: unreadable-response
 *     counts per model on real athlete data (`UnreadableReason`, `CoachUpdateOutcome`).
 *   · `everyScreenShowsTheEngineNumber` held that every screen could re-derive any figure it showed
 *     from the raw history. The coach's version is stronger and lives in `theReasonComesBack`: the
 *     number arrives WITH the sentence that produced it, and that sentence is stored and read back.
 *   · Loop 2's own load laws (L11's rail, S-25.1's back-off) went with the loop. The floor law
 *     (S-55) survives untouched — it is a fact about barbells, not a rule about deciding.
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/** A file's executable lines. A comment may NAME a removed thing to record why it went — that is
 *  the point of this file's own header — so only real code is searched. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the between-session decider is gone', () => {
  it('has no Loop 2 and no Loop 3 left to call', () => {
    expect(fs.existsSync(path.join(SRC, 'engine/v5/loop2.ts'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'engine/v5/loop3.ts'))).toBe(false);
  });

  it('keeps Loop 1, which acts inside the workout on what it can see', () => {
    // The distinction the whole ruling turns on. Deleting this one would leave the athlete's reps
    // uncorrected mid-set, which is the engine's actual job.
    expect(fs.existsSync(path.join(SRC, 'engine/v5/loop1.ts'))).toBe(true);
  });

  it('exposes no fold that advances state between sessions', () => {
    const engine = code('engine/v5/v5Engine.ts');
    expect(engine).not.toMatch(/export\s+(async\s+)?function\s+advanceV5/);
    expect(engine).not.toMatch(/\bdecideExercise\s*\(/);
    expect(engine).not.toMatch(/\bdecideVolume\s*\(/);
  });

  it('has no caller anywhere in the app', () => {
    // The deletion is only real if nothing reaches for it. A stub left behind for "compatibility"
    // is how a second decider comes back without anyone deciding to bring it back.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) {
          const src = code(path.relative(SRC, p));
          if (/\b(advanceV5|decideExercise|decideVolume)\b/.test(src)) {
            offenders.push(path.relative(SRC, p).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  it('finds files to check at all — a silently empty sweep proves nothing', () => {
    // The lesson `theOpeningLoadIsLoadable` paid for: a sweep that reaches nothing passes forever.
    let n = 0;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) n += 1;
      }
    };
    walk(SRC);
    expect(n).toBeGreaterThan(150);
  });
});
