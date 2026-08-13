/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE AI HAS ONE JOB, AND IT IS NOT THE PROGRAMME.
 *
 * ⛔ FOUNDER, 2026-08-08: *"אני לא רוצה יותר AI במערכת שלנו זה נכשל בענק."* — AI kept only for what
 * the engine genuinely cannot do: reading a programme she already has.
 *
 * ── ⛔ WHY THIS FILE EXISTS, WHICH IS A FAILURE OF MINE AND NOT A FEATURE ────────────────────────
 * That instruction was given, and I deleted ONE of four AI surfaces. The other three lived on for
 * four days:
 *
 *   `askAfterSession`   fired after EVERY workout, ungated, and wrote a `CoachPlan` — which every
 *                       screen then preferred over the engine's week. ⛔ So every guarantee the
 *                       engine makes held for her FIRST WEEK ONLY: the share table, the 45–60
 *                       minutes, the repair pass, the effective dose, the whole 270-week scoreboard,
 *                       replaced after her first session by a model that had none of those rules.
 *   `SessionCoach`      a chat inside the workout whose answers were APPLIED to the running session.
 *   `PainWhere`         a chat that had REPLACED the body map, against his first instruction of the
 *                       rebuild — *"פציעות כאבים ומה אסור יהיה בBODYMAP"*.
 *
 * I reported the survivors in one line under a headline saying the AI was out of the house. The
 * line was true and the headline was not, and a reader is entitled to believe the headline.
 *
 * ⚠️ SO THIS IS A LAW AND NOT A CLEAN-UP. Each of those three was added on a real request that a
 * later decision overtook, which is exactly how they will come back — one reasonable feature at a
 * time. The rule has to be mechanical: **the model is reachable from the import, and from nowhere
 * else.**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments blanked — a law must survive being explained at its own call site. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every source file, excluding the dev gallery — which mounts everything and ships to nobody. */
const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true }).filter((f) => !f.includes('screens' + path.sep + 'dev'));

describe('⛔ the model is called from ONE place', () => {
  it('⛔ only the IMPORT reaches the model', () => {
    /*
     * `askCoach` is the transport. Anything holding it can spend a call, so the list of holders IS
     * the list of AI surfaces — and it must be the import and the two modules the import is built
     * from. `coachClient` declares it; `useCoach` and `afterSession` still wrap it for the paths
     * that remain; nothing under `screens/` may hold it but the import.
     */
    /*
     * ⚠️ BY IMPORT, NOT BY CALL SITE. The import passes `askCoach` as a VALUE (`runImport` takes the
     * transport as a parameter so the whole flow is testable without a network), so a regex for
     * `askCoach(` misses the one surface that genuinely spends calls and catches only the wrappers.
     * Holding the transport is what makes a file an AI surface, whatever it then does with it.
     */
    const holders = files
      .filter((f) => /from '@\/platform\/coach\/coachClient'|\baskCoach\s*\(/.test(code(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    /*
     * ⚠️ THREE OF THESE FOUR ARE THE WIRE, NOT A SURFACE, and the distinction is the whole law.
     * `coachClient` DECLARES `askCoach`; `afterSession` and `useCoach` wrap it. What SPENDS a call
     * on an athlete's behalf is the import alone — asserted below by consumer, not by holder.
     */
    expect(holders).toEqual([
      'platform/coach/afterSession.ts',
      'platform/coach/coachClient.ts',
      'screens/import/ImportPlan.tsx',
    ]);
  });

  it('⛔ NOTHING calls the model after a workout — the engine owns the next week', () => {
    /*
     * ⛔ THE ONE THAT MATTERED MOST. `void askAfterSession(saved)` sat at the end of every finished
     * session, and its own comment called that "the sentence the product is built around: the
     * workout ended … and the coach decides the next programme."
     *
     * The engine has always decided it, and from her record rather than from prose: Loop 1 moves the
     * load between sets, Loop 2 decides the next session's from the last, Loop 3 grows or trims the
     * week's volume from what she earned. There was never a second opinion to add — only one to
     * override.
     */
    expect(code(read('state/stores/sessionStore.tsx'))).not.toContain('askAfterSession');
    expect(code(read('state/stores/appStore.tsx'))).not.toContain('retryWaitingUpdate');
    const callers = files
      .filter((f) => !f.endsWith('afterSession.ts')) // its own definition is not a call
      .filter((f) => /\baskAfterSession\s*\(/.test(code(fs.readFileSync(f, 'utf8'))));
    expect(callers.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('⛔ …and therefore nothing writes a CoachPlan any more', () => {
    /*
     * The consequence, asserted directly, because it is what makes the engine's week permanent
     * rather than temporary: `recordCoachAnswer` is the only writer, and nothing calls it. Her week
     * comes from `loadWeekPlan`, which prefers a stored coach plan — and there is no longer any way
     * for one to appear.
     */
    const writers = files
      .filter((f) => /recordCoachAnswer\s*\(/.test(code(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    /*
     * ⚠️ `db.ts` DECLARES it. The other two are the wrappers above, and they are unreachable — which
     * is asserted directly rather than inferred, because "unreachable" is what `CoachScreen` was
     * said to be for four days while two screens were still mounting its parts.
     */
    expect(writers).toEqual(['data/local/db.ts', 'platform/coach/afterSession.ts']);

    for (const orphan of ['platform/coach/afterSession.ts']) {
      const name = path.basename(orphan, '.ts');
      const live = files
        .filter((f) => path.relative(SRC, f).split(path.sep).join('/') !== orphan)
        .filter((f) => new RegExp(`from '@/${orphan.replace(/\.ts$/, '')}'`).test(fs.readFileSync(f, 'utf8')))
        .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
      /*
       * ⛔ `useCoach` IS DELETED (2026-08-12). It had no consumer once the two screens above were
       * rebuilt — only the dev gallery — and it could still write a `CoachPlan`. A hook nothing
       * mounts is not harmless when it is a live path to the one thing we just closed.
       *
       * ⛔ `afterSession`'s consumers are pinned EXACTLY, and every one of them is now TYPES ONLY —
       * `appStore` came off the list when its `askCoachToRevise` import turned out to be dead
       * (both call sites had already become engine rebuilds; only the import line survived):
       *
       *   WellDone              TYPES only — the "coach is deciding" state, now permanently false
       *   coachEarned, db       TYPES only (`CoachUpdate`)
       *   ⛔ PlanReceivedScreen  IS OFF THIS LIST NOW. It called `askCoachToRevise` to have a model
       *                          author a programme from a shared plan — the fifth AI surface, and
       *                          REACHABLE, by deep link (`Root.tsx` → `Linking`), which my first
       *                          reading of it missed. It adopts deterministically now, through the
       *                          same `toProgram` door the import uses.
       *
       * Anything beyond this list is a NEW AI surface and this test is how it gets noticed.
       */
      expect({ orphan, live }).toEqual({
        orphan,
        live: ['screens/session/WellDone.tsx', 'domain/coachEarned.ts', 'data/local/db.ts'],
      });
      void name;
    }
  });
});

describe('⛔ and the last programme a model wrote is forgotten', () => {
  it('⛔ a STORED coach plan is cleared once, at the schema boundary', () => {
    /*
     * ⛔ THE SURPRISE THE SWEEP FOUND, AND NOTHING ELSE WOULD HAVE (founder 2026-08-12: *"תוודא שוב
     * שהכל מחובר ומכויל שלא יהיו לנו עוד הפתעות חדשות."*).
     *
     * `loadWeekPlan` prefers a stored `CoachPlan` over the engine's week — correctly, because that
     * shape is where a real COACH's programme will live. Nothing writes one any more, so on a fresh
     * install the branch is never taken and every test here passes.
     *
     * ⚠️ AND ON A PHONE THAT ALREADY HAS ONE IT WOULD HAVE BEEN PREFERRED FOREVER. Every athlete on
     * a previous build carries a `hush.coachPlan` written by a model that no longer runs. Her engine
     * would never have taken over — on the one device where that mattered most — and the app would
     * have looked entirely correct while it happened. No test in this suite reads storage, so no
     * test could have seen it.
     */
    expect(read('data/local/db.ts')).toContain('clearCoachPlan');
    const store = read('state/stores/appStore.tsx');
    expect(store).toContain('db.clearCoachPlan()');
    /*
     * ⛔ ONCE, AND ONLY AT THE BOUNDARY. Clearing on every launch would delete a human coach's
     * programme the first time she reopened the app — which is the feature this shape exists for.
     */
    expect(store).toMatch(/storedVersion != null && storedVersion < SCHEMA_VERSION/);
    // …and it is INSIDE that guard, not beside it — an unconditional clear would look identical
    // here and behave completely differently on the phone of the first athlete with a real coach.
    const guard = store.slice(store.indexOf('storedVersion != null && storedVersion < SCHEMA_VERSION'));
    expect(guard.slice(0, 200)).toContain('db.clearCoachPlan()');
  });
});

describe('⛔ no screen is a conversation', () => {
  it('⛔ the workout offers no sheet at all now — not a text box, and not the chips either', () => {
    /*
     * ⛔ THIS PINNED THE HALFWAY HOUSE, AND THE FOUNDER CLOSED IT (2026-08-12).
     *
     * The chat went first: a model answering into a live session and APPLYING its answer to the
     * workout she was standing in. What stayed was a sheet of three local chips, and this test
     * guarded them — until he pointed out that two of the three were already solved on the stage:
     * *"להחליף תרגיל יש את כפתור ה-SWAP שמופיע בסט הראשון בתרגיל הראשון ואז במסכי ה-TRANSITION
     * REST. וזה נראה לי פותר גם את SKIP THIS כי במקום לדלג המתאמן פשוט יכול ללחוץ SWAP."*
     *
     * ⚠️ AND SKIP WAS THE ONE WORTH LOSING ON ITS OWN MERITS. A lift she wants gone is a lift she
     * wants REPLACED; swapping keeps the volume the week was balanced around, and skipping quietly
     * takes it out of her back. The deletion is in `aRepeatedItemSaysWhereSheIsInIt`.
     */
    expect(fs.existsSync(path.join(SRC, 'screens/session/SessionCoach.tsx'))).toBe(false);
    // The one thing this law is really about: nothing inside a running workout calls a model.
    expect(code(read('screens/session/SessionFlow.tsx'))).not.toContain('askCoachInSession');
    expect(code(read('screens/session/SessionFlow.tsx'))).not.toContain('CoachChat');
  });

  it('⛔ PAIN IS THE BODY MAP AGAIN — his first instruction of the rebuild', () => {
    /*
     * *"פציעות כאבים ומה אסור יהיה בBODYMAP לכן לא צריך טקסט חופשי."* She points and grades; every
     * decision after that is a table (`patternsAt`, `EASE_DAYS`) the engine already owned.
     */
    const pain = read('screens/pain/PainWhere.tsx');
    expect(code(pain)).not.toContain('CoachChat');
    expect(code(pain)).not.toContain('useCoach');
    expect(pain).toContain('BodyMapFigure');
    expect(pain).toContain('app.reportPain');
    // Two taps: where, then how sharp — and the severity cannot be asked before there is a muscle.
    expect(pain).toMatch(/\{muscle \? \(/);
  });

  it('⛔ the chat COMPONENT is not mounted by any screen that ships', () => {
    /*
     * `CoachChat` still exists as a component. What must not exist is a screen rendering it — that
     * is the difference between a part in a drawer and a conversation in the product.
     */
    const mounts = files
      .filter((f) => /<CoachChat/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(mounts).toEqual([]);
  });
});
