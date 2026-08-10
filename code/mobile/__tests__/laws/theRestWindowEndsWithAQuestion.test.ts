// @ts-nocheck
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
// 
import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A REST WINDOW ENDING IS A QUESTION FOR HER, NOT A FACT THE CLOCK DECIDES.
 *
 * ⛔ FOUND BY TESTING THE FOUNDER'S FOUNDATION STONES, 2026-08-02:
 *
 *   > *"Say the system thinks the athlete needs to rest X time — after X time the system has to
 *   > REMEMBER and TELL him the time is up, and ASK HIM HOW HE FEELS, and whether we can release
 *   > the injury report and put it back into the training programme."*
 *
 * What the app did instead, on the next open of Today: **deleted the ease the moment the clock
 * passed it**, told the coach "bring it back at whatever pace you think is right", and said nothing
 * whatsoever to her. A timer decided she had healed, and her programme changed underneath her.
 *
 * It is the app deciding — the one thing this whole architecture exists to stop — and it was doing
 * it about an INJURY, which is the worst possible subject to be confidently wrong about.
 *
 * ── WHY NOT CLEARING IT IS THE WHOLE FIX ────────────────────────────────────────────────────────
 * Clearing the ease is what made the question unaskable. Once the muscle is back in her map, "may I
 * bring it back?" is a question about something that has already happened, and no answer she gives
 * can change it. So the rest STANDS, `askedAt` records that she has been asked once, and her reply
 * is what ends it — through the ordinary conversation, where "no, still sore" is a real option.
 *
 * This reads the source rather than driving the store, because the whole behaviour is one branch
 * inside `refresh` and the thing that matters is WHICH of the two shapes it has. A future edit that
 * reinstates the silent delete has to delete these assertions to do it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const store = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'state', 'stores', 'appStore.tsx'),
  'utf8',
);
const models = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'data', 'local', 'models.ts'),
  'utf8',
);
/** The lapsed-ease branch alone. */
const branch = store.slice(store.indexOf('const lapsed = live.filter'), store.indexOf('CALENDAR-PRIMARY CADENCE'));

describe('when the window she was given runs out', () => {
  it('⛔ she is TOLD, asked how it feels, and asked before anything comes back — WITHOUT a network', () => {
    /*
     * ⛔ THE THREE VERBS ARE THE FOUNDER'S AND THEY ARE UNCHANGED. What changed is where they live.
     *
     * This used to assert them as ENGLISH IN A PROMPT — `Tell her the time is up`, `ask her how it
     * feels now`, `ask whether she is happy for you to` — sent to the coach. So the rule held only
     * while there was a signal. With none she was never asked at all: the muscle simply reappeared
     * in her programme one morning and nothing said why. An injury is the last place in this product
     * that should need a connection.
     *
     * ⚠️ SO THE QUESTION IS ENGINE STATE. `awaitingAnswer` reads the window against the clock — which
     * also means a lapse that happened while the app was closed is caught the moment she opens it —
     * and `answerEaseCheck` is the only thing that closes it. Her three answers are the three verbs:
     * she is told (the check exists), asked how it feels (`tender` / `hurts`), and nothing comes back
     * on the app's say-so (`recovered` is hers to give).
     */
    const store = read('src/state/stores/appStore.tsx');
    expect(store).not.toMatch(/askCoachToRevise\([\s\S]{0,120}rest window/);
    expect(store).toContain('easeChecks()');
    expect(store).toContain('async answerEaseCheck(muscle, answer)');
    // …and every answer that is not "recovered" writes a fresh window rather than nothing.
    expect(store).toContain('again ? [...closed, easeFor(muscle, again, now)] : closed');
    // …and the programme is rebuilt from it, locally, through the pain-ease wrapper.
    expect(store).toMatch(/answerEaseCheck[\s\S]{0,1400}generateProgram\(programProfile\(/);
  });

  it('⚠️ does NOT clear the ease on the clock', () => {
    /*
     * The line that was here: `painEases: activeEases(live, Date.now())` — which drops every lapsed
     * ease. It is the assertion this file exists for, because reinstating it would look like
     * tidying and would silently restore the app's own opinion about an injury.
     */
    expect(branch).not.toMatch(/painEases: activeEases\(live, Date\.now\(\)\)/);
    // What replaces it marks the ease as asked and keeps it.
    expect(branch).toMatch(/askedAt: askedNow/);
  });

  it('asks once, not on every visit to Today', () => {
    // `refresh` runs on every focus. Without this guard the coach is billed for a question a day,
    // and she is asked how her shoulder feels for ever.
    expect(branch).toMatch(/!e\.askedAt/);
    expect(branch).toMatch(/toAsk\.length > 0/);
  });

  it('the flag is on the record, so it survives the app closing', () => {
    // A ref or component state would ask again on the next launch — which is exactly the shape of
    // the bug, one level down.
    expect(models).toMatch(/askedAt\?: number;/);
  });
});
