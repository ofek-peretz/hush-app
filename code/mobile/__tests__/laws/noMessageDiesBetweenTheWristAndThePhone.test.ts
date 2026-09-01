/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * NO MESSAGE DIES BETWEEN THE WRIST AND THE PHONE.
 *
 * ⛔ THE WATCH AUDIT (2026-08-23, founder-ordered: "השעון והפלאפון מסונכרנים באופן מושלם בהכל").
 * Three delivery seams were found where a message could vanish with every layer around it correct,
 * and each is pinned here against the sources on BOTH sides of the wire — these are the holes that
 * no runtime test can reach, because they live in cold-launch and version-skew windows.
 *
 *   W1 · THE BOOT WINDOW. WCSession activates milliseconds into a cold phone launch and delivers
 *        queued transfers at once; React subscribes seconds later; `sendEvent` with no listener
 *        drops the payload. A pain report (one-shot durable transfer) died PERMANENTLY there; a
 *        finished wrist workout waited hours for the outbox's next retry. The native module now
 *        buffers intents + records until the transport reports BOTH channels subscribed.
 *   W2 · THE SILENT STANDALONE. The wrist offered its live workout only on a reachability
 *        TRANSITION — and the founder's headline case (Begin on wrist, phone app dead, fallback
 *        start) keeps reachability true throughout, so opening the phone never triggered the offer
 *        and Today offered to start the workout she was inside. A phone publishing a LOBBY while a
 *        local session runs is the proof of that exact gap; the wrist now answers it with the offer.
 *   W3 · THE CONFIRMED SET THAT WENT NOWHERE. `sendMessage` acceptance proves the iPhone is in
 *        range, not that the app heard — a jettisoned phone app is woken by the very tap it then
 *        drops. A wrist set completion now demands a REPLY carrying the phone's own "listening"
 *        claim, with a fire-and-forget fallback so an older phone build keeps yesterday's behaviour.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const at = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('W1 · the boot window is buffered, not dropped', () => {
  const module_ = at('modules/hush-watch-connectivity/ios/HushWatchConnectivityModule.swift');
  const transport = at('src/platform/watch/watchTransportNative.ts');

  it('⛔⛔ the native module buffers inbound intents and records until JS listens', () => {
    expect(module_).toContain('emitOrBuffer("onIntent"');
    expect(module_).toContain('emitOrBuffer("onSessionRecord"');
    expect(module_).toContain('Function("flushPending")');
    // Reachability is state, not a message — it must NOT be buffered and replayed stale.
    expect(module_).not.toContain('emitOrBuffer("onReachabilityChange"');
  });

  it('⛔ the transport flushes only when BOTH inbound channels are subscribed', () => {
    expect(transport).toContain('intentSubs > 0 && recordSubs > 0');
    expect(transport).toContain('flushPending()');
    // Flushing on the first subscriber would drop the second channel's buffer all over again.
    const flushSites = transport.match(/maybeFlushPending\(\)/g) ?? [];
    expect(flushSites.length).toBeGreaterThanOrEqual(2);
  });
});

describe('W2 · a running wrist workout answers a lobby-publishing phone', () => {
  const model = at('targets/watch/WatchModel.swift');

  it('⛔⛔ a lobby envelope arriving mid-local-session triggers the handover offer', () => {
    // The exact condition: local engine live + the envelope carries NO mirror (a lobby).
    expect(model.replace(/\s+/g, ' ')).toContain(
      'if localEngine != nil, envelope.mirror == nil, Date().timeIntervalSince(lastLocalOfferAt) > 5',
    );
    expect(model).toContain('lastLocalOfferAt = Date()');
  });

  it('⛔ …and the reachability-transition offer is still there — the two cover different gaps', () => {
    // setReachable(true) → offerLocalSession() covers the phone COMING BACK; the lobby trigger
    // covers a phone that was "reachable" all along with its app dead.
    const reachableBlock = model.slice(model.indexOf('func setReachable'), model.indexOf('func setReachable') + 900);
    expect(reachableBlock).toContain('offerLocalSession()');
  });
});

describe('W3 · a set is confirmed by an answer, not an address', () => {
  const model = at('targets/watch/WatchModel.swift');
  const manager = at('targets/watch/WatchSessionManager.swift');
  const module_ = at('modules/hush-watch-connectivity/ios/HushWatchConnectivityModule.swift');

  it('⛔⛔ the wrist completes a phone-authority set through the reply channel', () => {
    expect(model).toContain('manager.sendExpectingReply(intentJSON: json)');
    // The confirm beat runs only inside the reply, behind the heard guard.
    const complete = model.slice(model.indexOf('func completeSet'), model.indexOf('func ready()'));
    expect(complete.replace(/\s+/g, ' ')).toContain('guard heard else { self.intentDidNotLeave() return }');
  });

  it('⛔ the phone replies with the JS truth, and forwards the intent EITHER way', () => {
    const reply = module_.slice(module_.indexOf('replyHandler: @escaping'), module_.length);
    expect(reply).toContain('replyHandler(["listening": listening()])');
    // Forwarded before the reply — a false reply still buffers the intent for the TTL to judge.
    expect(reply.indexOf('onIntent(intent)')).toBeGreaterThan(-1);
    expect(reply.indexOf('onIntent(intent)')).toBeLessThan(reply.indexOf('replyHandler(['));
  });

  it('⛔ the skew fallback keeps an older phone at yesterday\'s behaviour, never worse', () => {
    // An old phone has no reply delegate → iOS errors the delivery → the wrist re-sends plain.
    const send = manager.slice(manager.indexOf('func sendExpectingReply'));
    expect(send).toContain('errorHandler: { _ in');
    expect(send.replace(/\s+/g, ' ')).toContain('session.sendMessage(["intent": json], replyHandler: nil, errorHandler: nil) completion(true)');
  });

  it('⚠️ the draft survives a failed completion — her dialled weight and reps are not thrown away', () => {
    const complete = model.slice(model.indexOf('func completeSet'), model.indexOf('func ready()'));
    // editDraft is cleared ONLY on the confirmed path (inside the reply / the local branch).
    const beforeSend = complete.slice(0, complete.indexOf('sendExpectingReply'));
    expect(beforeSend).not.toContain('editDraft = nil\n    guard');
    expect(complete).toContain('self.editDraft = nil');
  });
});
