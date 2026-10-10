/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE WORKOUT HAS ONE AUTHORITY — and the wrist yields whenever it has nothing to lose.
 *
 * ⛔ FOUNDER, from device use: *"לפעמים למשל זה סיים אימון בשעון או בפלאפון אבל במסך של הצד השני זה
 * כן נתן לי להתחיל את אותו האימון"* — and, separately, closing the watch app mid-workout and
 * carrying on with the phone.
 *
 * Two live authorities is the failure underneath both. It produces one workout with two records,
 * two session credits, and a wrist that ignores every frame the phone sends because it believes it
 * is the one running things.
 *
 * ── THE TWO DOORS INTO IT, AND THE ONE RULE THAT SHUTS BOTH ─────────────────────────────────────
 *
 *  1. THE BEGIN FALLBACK. The wrist waits `WATCH_START_GRACE_MS` for a phone that may be asleep and
 *     then runs the workout itself. A phone woken from cold AFTER that used to accept the start
 *     anyway — lobby intents are judged above the staleness gate, so `start_workout` had no expiry
 *     at all. Now the phone refuses a start the wrist has already given up on, from the SAME
 *     constant the wrist waits by, so the two devices cannot disagree about the number.
 *
 *  2. STANDALONE RECOVERY. A local session survives the watch app being killed and is restored
 *     unconditionally at launch. The reclaim in `apply()` used to require `fallbackStarted`, a flag
 *     a restored session does not carry — so it could never be reclaimed, and a phone that was live
 *     was simply ignored. What makes a local session safe to discard is that nothing has been
 *     logged into it (`sets.isEmpty`), which is true of a restored session as much as a fallback
 *     one. Provenance was never the question.
 *
 * ⚠️ THIS IS A SOURCE READER, and it says so. It cannot run WCSession and it cannot compile Swift.
 * It proves the two conditions that caused the divergence are gone from the source and pins the one
 * constant that has to agree across the wire — the same instrument `theWristSaysYourPaceOnlyWhenIt
 * IsHers` and `watchCopyPack` use to keep Swift honest without a compiler. The rest is a device.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { WATCH_START_GRACE_MS } from '@/platform/watch/protocol';

const ROOT = path.resolve(__dirname, '..', '..');
const swift = (f: string) => fs.readFileSync(path.join(ROOT, 'targets', 'watch', f), 'utf8');
/** Comments blanked, line count preserved — a rule must survive being described beside itself. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('one workout has one authority', () => {
  it('⛔ the wrist yields a local session with no logged sets, however it began', () => {
    const model = code(swift('WatchModel.swift'));
    const reclaim = model
      .split('\n')
      .find((l) => l.includes('localEngine') && l.includes('phoneLive') && l.includes('sets.isEmpty'));
    expect(reclaim).toBeDefined();
    /*
     * `fallbackStarted` in this condition is the bug: it narrows the reclaim to sessions the wrist
     * started because the phone was slow, and excludes the ones it restored after being killed.
     */
    expect(reclaim).not.toContain('fallbackStarted');
    // And the one guarantee that must NOT be relaxed — a session holding real work keeps authority.
    expect(reclaim).toContain('sets.isEmpty');
  });

  it('⛔ the Begin grace is one number, read from both sides of the wire', () => {
    const wire = code(swift('WatchWire.swift'));
    const model = code(swift('WatchModel.swift'));

    // The wrist declares it in seconds…
    const decl = wire.match(/WATCH_START_GRACE_S\s*:\s*TimeInterval\s*=\s*([0-9.]+)/);
    expect(decl).not.toBeNull();
    expect(Number(decl![1]) * 1000).toBe(WATCH_START_GRACE_MS);

    // …and the Begin fallback waits by THAT, never by a literal of its own.
    const wait = model.split('\n').find((l) => l.includes('asyncAfter') && l.includes('beginFallback') === false && l.includes('WATCH_START_GRACE_S'));
    expect(wait).toBeDefined();
  });

  it('the phone refuses a start the wrist has already given up on', () => {
    // The rule itself is exercised against `decideWatchIntent` in watchProtocol.test.ts; this only
    // pins that the constant the phone judges by is the one the wrist waits by.
    expect(WATCH_START_GRACE_MS).toBeGreaterThan(0);
    const protocolSrc = fs.readFileSync(
      path.join(ROOT, 'src', 'platform', 'watch', 'protocol.ts'),
      'utf8',
    );
    const body = protocolSrc.slice(protocolSrc.indexOf('isLobbyIntent(intent.type)'));
    expect(body).toContain('WATCH_START_GRACE_MS');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST LETS GO ONLY WHEN THE PHONE NAMES ITS SESSION.
 *
 * The live handover moves a running workout from the wrist to the phone. The wrist's engine is
 * carrying real sets by then, so the release is the single most dangerous line in this layer: get
 * its condition wrong and a workout disappears between two devices with nobody able to say where.
 *
 * ⚠️ A SOURCE READER, and it says so. It cannot compile Swift. It pins the two things that make the
 * release safe — that it matches an id, and that the old guard protecting the never-used fallback
 * session was not quietly relaxed to make room for it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the live handover releases on an id, never on an inference', () => {
  const model = () => code(swift('WatchModel.swift'));

  it('⛔ the release compares the phone-named id to this session own id', () => {
    const src = model();
    const at = src.indexOf('adoptedRecordId');
    expect(at).toBeGreaterThan(-1);
    const branch = src.slice(at, at + 400);
    // The phone's claim is matched against THIS engine's identity …
    expect(branch).toContain('engine.state.recordId');
    // … and the wrist lets go with the verb that means "the phone has it", not the one that means
    // "this was never used".
    expect(branch).toContain('release()');
    expect(branch).not.toContain('discard()');
  });

  it('⛔ `discard` still refuses a session with work in it', () => {
    /*
     * `release` exists precisely so this guard never has to be weakened. If a future change makes
     * discard accept a session with sets, the fallback path silently gains the power to delete a
     * workout — which is what this line has always stood in the way of.
     */
    const engine = code(swift('LocalWorkoutEngine.swift'));
    const at = engine.indexOf('func discard()');
    expect(at).toBeGreaterThan(-1);
    expect(engine.slice(at, at + 200)).toContain('state.sets.isEmpty');
  });

  it('the wrist offers a running workout when the phone comes back', () => {
    const src = model();
    const at = src.indexOf('func setReachable');
    expect(at).toBeGreaterThan(-1);
    // Inside the reachable branch, alongside the outbox flush.
    expect(src.slice(at, at + 600)).toContain('offerLocalSession()');
  });

  it('the offer names itself the same way the phone parses it', () => {
    // `parseWatchLocalSession` accepts only this discriminator; a typo here is a handover the phone
    // throws away as malformed, in silence.
    expect(model()).toContain('"local_session"');
  });
});
