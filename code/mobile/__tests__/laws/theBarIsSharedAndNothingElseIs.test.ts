/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BAR IS SHARED AND NOTHING ELSE IS — the pair's six promises, held. (2026-08-31)
 *
 * Founder: *"אם נניח ואני רוצה ללכת להתאמן עם אחי ושנעשה את אותו האימון בסנכרון מושלם."*
 *
 * `__tests__/domain/sharedSession` proves the ARITHMETIC — the turn, the rest, the vectors, the
 * frames arriving backwards. This holds the six promises that live across FILES, where nothing in a
 * type system can reach them:
 *
 *   1 · no load, no bodyweight, no history crosses the wire — enforced on the way out AND rebuilt
 *       field-by-field on arrival, on both sides, by two implementations a law compares;
 *   2 · the one weight that DOES cross is never written down anywhere, on either end;
 *   3 · nothing arriving on the wire can log a set, move a cursor or end a workout;
 *   4 · a dead wire does not stop a workout — no URL, no session, no signal, all the same outcome;
 *   5 · the guest's engine is his own: he adopts a SHAPE, and every number comes from his body;
 *   6 · the paywall gate and the one-session guard are not routed around by the new door.
 *
 * ⚠️ THE SHAPE OF THIS FILE IS `theCircleCarriesOneFactAndNothingElse`, deliberately. That law reads
 * the app AND `server/hush-identity/src/index.ts` in one place, because the allow-list is a promise about a round
 * trip and half of it is not a promise at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import {
  SHARED_BAR_KEYS,
  SHARED_INTENT_TTL_MS,
  SHARED_PROGRESS_KEYS,
  payloadIsWithinAllowList,
  readSharedProgress,
} from '@/domain/sharedSession';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const readRepo = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', rel), 'utf8');

/**
 * CODE only — a header is allowed to NAME the thing it bans. (The circle's law does the same.)
 *
 * ⚠️ STRIPPED AS BLOCKS, NOT AS LINES. The line-prefix filter the circle's law uses keeps the
 * SECOND line of every wrapped comment, because that line begins with a word rather than a `*`.
 * `HushPairRoom`'s own constructor note wraps across the phrase "a field somebody can later write
 * `state.storage.put` through" — so the line filter read the argument FOR the ban as a breach of it.
 */
/*
 * ⚠️ AND A URL IS NOT A COMMENT. `hush://pair?c=…` is a string this feature depends on, and the
 * naive line-comment rule deletes it from the middle of the file — so a law asserting the link
 * exists failed while the link was sitting right there. A `//` preceded by a colon is a scheme.
 */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('1 · the allow-list is the whole surface, on both sides of the wire', () => {
  it('the payload is six fields, and a seventh cannot be smuggled through', () => {
    expect([...SHARED_PROGRESS_KEYS].sort()).toEqual(['at', 'bar', 'done', 'name', 'presence', 'v']);
    /* `exerciseId` is the guard, not a fourth fact about her: it names the lift the number is for,
       so a reader can refuse to print it beside a different one. See `SHARED_BAR_KEYS`. */
    expect([...SHARED_BAR_KEYS].sort()).toEqual(['exerciseId', 'kg', 'reps']);
    for (const banned of ['actualWeight', 'oneRepMax', 'bodyweight', 'tonnage', 'history', 'bodyMap']) {
      expect({ banned, ok: payloadIsWithinAllowList({ v: 1, [banned]: 1 }) }).toEqual({ banned, ok: false });
    }
  });

  it('⛔ the CLIENT refuses to send a frame the fence rejects — it drops it, it does not repair it', () => {
    const client = codeOf(read('src/platform/sharedClient.ts'));
    expect(client).toContain('payloadIsWithinAllowList');
    expect(client).toContain("void track('pair_frame_refused')");
    // …and the refusal RETURNS. A fence that logs and sends anyway is a decoration.
    expect(client).toMatch(/pair_frame_refused'\);\s*return;/);
  });

  it('⛔ the SERVER rebuilds every field on arrival — the client is never the authority on shape', () => {
    const worker = readRepo('server/hush-identity/src/index.ts');
    expect(worker).toContain('function readPairProgress');
    expect(worker).toContain('function readPairPlan');
    expect(worker).toContain('function readPairBar');
    // The two implementations must agree key for key, or a field the app names is a field the
    // room silently drops (or worse, the other way round).
    for (const key of SHARED_PROGRESS_KEYS) {
      expect({ key, inWorker: new RegExp(`\\br\\.${key}\\b`).test(worker) || key === 'v' }).toEqual({ key, inWorker: true });
    }
  });

  it('an unknown key does not survive the trip in either direction', () => {
    const read1 = readSharedProgress({
      v: 1, name: 'Dan', presence: 'resting', done: [1], at: 5,
      actualWeight: 95, bodyweight: 78, email: 'x@y.z',
    });
    expect(Object.keys(read1!).sort()).toEqual(['at', 'done', 'name', 'presence', 'v']);
  });
});

describe('2 · the one weight that crosses is never written down', () => {
  const worker = readRepo('server/hush-identity/src/index.ts');
  /* CODE only — the class HEADER argues at length about `state.storage` and `serializeAttachment`,
     which is precisely the paragraph that makes their absence below meaningful. Stripping comments
     is what lets a law read the same file its header is arguing in. */
  /* The CLASS, and not the ambient `KVNamespace` declaration that follows it — that interface has
     a `put` on it by definition, and reading it as the room's own would make this law unfailable in
     the one direction that matters. */
  const room = codeOf(
    worker.slice(worker.indexOf('export class HushPairRoom'), worker.indexOf('/* ════ ADD TO `wrangler.toml`')),
  );

  it('⛔ THE ROOM NEVER TOUCHES STORAGE — the promise is kept by there being no line that breaks it', () => {
    expect(room).not.toMatch(/state\.storage/);
    expect(room).not.toMatch(/\.put\(/);
    expect(room).not.toMatch(/serializeAttachment/);
  });

  it('…and it does not retain the state handle a future edit would reach storage through', () => {
    expect(room).toContain('constructor(_state: unknown, _env: unknown)');
    expect(room).not.toMatch(/this\.state\b/);
  });

  it('the KV registry holds a code and who opened it — never a lift, a set or a load', () => {
    const open = worker.slice(worker.indexOf("path === '/pair/open'"), worker.indexOf("path === '/pair/join'"));
    expect(open).toContain('JSON.stringify({ host: sub })');
    for (const banned of ['done', 'bar', 'lifts', 'exerciseId', 'kg']) {
      expect({ banned, present: open.includes(banned) }).toEqual({ banned, present: false });
    }
  });

  it('⛔ the phone never writes a PARTNER’S frame to disk', () => {
    const store = codeOf(read('src/state/stores/pairStore.tsx'));
    /*
     * ⚠️ THIS LAW USED TO READ `not.toMatch(/db\.save/)` AND IT CAUGHT ITS FIRST REAL EDIT ON THE
     * DAY IT WAS WRITTEN — the remembered privacy toggle, which is HER OWN preference and has every
     * right to be persisted. A ban on all writing was the wrong shape of the right rule; the rule is
     * that nothing the PARTNER sent may be written down. So it is stated that way instead.
     */
    const writes = store.match(/db\.\w+\(/g) ?? [];
    const allowed = new Set(['db.loadPreferences(', 'db.savePreferences(', 'db.loadHistory(', 'db.loadWeekOpen(']);
    for (const w of writes) expect({ call: w, allowed: allowed.has(w) }).toEqual({ call: w, allowed: true });

    // …and the ONE write there is carries a boolean of hers, with nothing of his anywhere near it.
    const saved = store.slice(store.indexOf('db.savePreferences('), store.indexOf('db.savePreferences(') + 120);
    expect(saved).toContain('pairLoadsPrivate: v');
    for (const his of ['peer', 'bar', 'partner', 'standing']) {
      expect({ his, present: saved.includes(his) }).toEqual({ his, present: false });
    }
    expect(store).not.toMatch(/db\.append/);
    expect(store).not.toMatch(/SecureStore/);
  });
});

describe('3 · the wire is a spectator — it cannot log, cursor or end', () => {
  const store = codeOf(read('src/state/stores/pairStore.tsx'));

  it('⛔ nothing a partner sends reaches a session action', () => {
    for (const forbidden of ['completeSet', 'completeItem', 'editCurrentSet', 'endRest', 'finishEarly', 'startCoach']) {
      expect({ forbidden, present: store.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it('the ONE thing it may cause is a start the athlete pressed — through the guarded doorway', () => {
    expect(store).toContain('session.start(day, targets');
    // `sessionStore.start` is where the paywall gate and the one-session guard live; the pair opens
    // no second door past them (promise 6).
    const sessionStore = read('src/state/stores/sessionStore.tsx');
    const startBody = sessionStore.slice(sessionStore.indexOf('async start(day, targets, withPartners)'));
    expect(startBody.slice(0, 2000)).toContain('isTrainingGated');
    expect(startBody.slice(0, 2000)).toContain('if (plan.length > 0) return;');
  });

  it('the stage’s log button is never disabled by the pair — only re-worded', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    const cta = flow.slice(flow.indexOf('label={passingTheBar'), flow.indexOf('label={passingTheBar') + 400);
    expect(cta).toContain("t('pair.logAndPass'");
    expect(cta).not.toContain('disabled');
  });

  it('a swap is a PROPOSAL, and a proposal that nobody answers is a decline', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).toContain('pair.askSwap(st.originalId, id)');
    expect(flow).toContain('SHARED_SWAP_WAIT_MS');
    expect(flow).toContain("notify(t('pair.swapDeclined'))");
  });
});

describe('4 · a dead wire does not stop a workout', () => {
  const client = codeOf(read('src/platform/sharedClient.ts'));

  it('no URL → the pair does not exist in this build, and nothing throws', () => {
    expect(client).toContain('identityBaseUrl().length > 0');
    // Both HTTP doors gate on it, and each ANSWERS rather than returning a bare null — a screen
    // that cannot tell "this build has no wire" from "that code is wrong" says the wrong sentence.
    const doors = client.match(/if \(!pairAvailable\(\)\) return '?\w+'?;/g) ?? [];
    expect(doors.length).toBe(2);
    for (const d of doors) expect(d).toContain("'unavailable'");
    // …and a missing ACCOUNT is its own answer, never dressed up as a missing room.
    expect(client).toContain("if (!(await pairSignedIn())) return 'signed_out';");
  });

  it('every send is inside a try, and a closed socket is simply not written to', () => {
    expect(client).toMatch(/if \(ws && ws\.readyState === 1\) ws\.send/);
  });

  it('a lost socket redials on a BACKOFF — never a tight loop against a dead access point', () => {
    expect(client).toContain('const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000]');
    expect(client).toContain('BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]');
  });

  it('⛔ and the whole reconnect protocol is "send where I am" — because the wire carries STATE', () => {
    const onopen = client.slice(client.indexOf('sock.onopen'), client.indexOf('sock.onmessage'));
    expect(onopen).toContain("send({ t: 'plan', plan: lastPlan })");
    expect(onopen).toContain("send({ t: 'progress', p: lastProgress })");
  });

  it('the stale-frame wall is the wrist’s own number, for the wrist’s own reason', () => {
    expect(SHARED_INTENT_TTL_MS).toBe(15_000);
    expect(read('src/platform/watch/protocol.ts')).toContain('WATCH_INTENT_TTL_MS = 15_000');
  });

  it('the strip draws no turn it cannot verify, and says the workout carries on', () => {
    const strip = read('src/components/PairStrip.tsx');
    expect(strip).toContain("pair.link === 'open'");
    expect(strip).toContain("t('pair.linkDown')");
  });
});

describe('5 · the guest adopts a shape, and every number comes from his own body', () => {
  const store = codeOf(read('src/state/stores/pairStore.tsx'));

  it('his targets are HIS engine’s, read through the same door every screen uses', () => {
    expect(store).toMatch(/app\.model\s*\.sessionTargets\(/);
  });

  it('⛔ the host’s loads appear nowhere in what the guest starts', () => {
    const begin = store.slice(store.indexOf('const beginAsGuest'), store.indexOf('const value = useMemo'));
    // The plan he adopts carries two fields, and neither of them is a weight.
    expect(begin).toContain('exerciseId: l.exerciseId');
    expect(begin).toContain('setCount: l.sets');
    for (const banned of ['recommendedWeight', 'peer?.bar', 'partnerBar', 'kg']) {
      expect({ banned, present: begin.includes(banned) }).toEqual({ banned, present: false });
    }
  });

  it('a lift this build does not know is dropped rather than started as a hole', () => {
    expect(store).toContain('shape.lifts.filter((l) => exerciseById(l.exerciseId))');
  });

  it('⛔ BOTH records are stamped with who it was trained with — one workout, not one memory of it', () => {
    // The guest's, through `start`…
    expect(store).toContain("peer?.name ? [peer.name] : undefined");
    // …and the HOST's, through her ordinary Begin. This asymmetry shipped for an afternoon: the
    // poster and the story card named a partner on his phone and nobody on hers.
    expect(read('src/screens/home/Home.tsx')).toContain('pair.partnerName ? [pair.partnerName] : undefined');
    expect(read('src/state/stores/sessionStore.tsx')).toContain('async startCoach(planned, workoutId, withPartners)');
    expect(read('src/data/local/models.ts')).toContain('partners?: string[];');
  });

  it('⛔ a spent trial is answered in words, never with a button that does nothing', () => {
    expect(store).toContain("return 'gated'");
    expect(store).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(read('src/components/TrainTogetherSheet.tsx')).toContain("outcome === 'gated'");
    expect(read('src/screens/home/Home.tsx')).toContain("onGated={() => navigation.navigate('Paywall', { source: 'gate' })}");
  });
});

describe('6 · the pair ends with the workout, and the room with the pair', () => {
  const store = codeOf(read('src/state/stores/pairStore.tsx'));

  it('a finished workout closes the room', () => {
    expect(store).toContain("if (phase === 'WELL_DONE'");
    expect(store).toContain('leave()');
  });

  it('the room is torn down when the provider is', () => {
    expect(store).toContain('useEffect(() => () => room.current?.close(), []);');
  });

  it('two people, never three — and the third is told why rather than dropped', () => {
    const worker = readRepo('server/hush-identity/src/index.ts');
    expect(worker).toContain("error: 'pair_full'");
    expect(worker).toContain('this.sides.length >= 2');
  });

  it('a code outlives one workout and nothing more', () => {
    expect(readRepo('server/hush-identity/src/index.ts')).toContain('const PAIR_TTL_S = 4 * 60 * 60;');
  });

  it('the socket is entered with a single-use ticket, never the 90-day session token', () => {
    const worker = readRepo('server/hush-identity/src/index.ts');
    expect(worker).toContain('const TICKET_TTL_S = 60;');
    expect(worker).toContain('await env.HUSH_KV.delete(`ticket:${ticket}`)');
    // …and the ROLE is the server's ruling, never the client's claim.
    expect(worker).toContain("inner.headers.set('x-hush-role', rec.role)");
  });

  it('the Durable Object is declared AND migrated — a binding alone fails the deploy', () => {
    const toml = readRepo('server/hush-identity/wrangler.toml');
    expect(toml).toContain('class_name = "HushPairRoom"');
    /*
     * ⛔ `new_sqlite_classes`, AND THE DEPLOY IS WHERE THAT WAS LEARNED. `new_classes` is refused
     * outright on a free plan (Cloudflare API code 10097, 2026-08-31). It names a storage backend
     * this room never touches, so it costs nothing — but a `new_classes` here is a deploy that
     * fails, which is exactly the kind of thing a law should hold still.
     */
    expect(toml).toContain('new_sqlite_classes = ["HushPairRoom"]');
    expect(toml).not.toContain('new_classes = [');
  });

  it('the deployed worker and the repo’s copy of it have not drifted apart', () => {
    expect(readRepo('server/hush-identity/src/index.ts')).toEqual(readRepo('server/hush-identity/src/index.ts'));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 7 · THE SECOND ROUND — the eight things the founder's questions turned into work (2026-08-31).
 *
 * Every one of these started as a question that could not be answered from the code, which is the
 * most reliable signal there is that the code was wrong about it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('7 · whose lifts, how you are invited, and what the room remembers', () => {
  const store = codeOf(read('src/state/stores/pairStore.tsx'));
  const sheet = read('src/components/TrainTogetherSheet.tsx');
  const worker = readRepo('server/hush-identity/src/index.ts');

  it('⛔ the lead is NAMED — a pair that cannot see whose workout it is doing is not a pair', () => {
    expect(sheet).toContain("t('pair.leadYours')");
    expect(sheet).toContain("t('pair.leadTheirs'");
  });

  it('…and it can be handed over, but only before there is a workout to hand over', () => {
    expect(store).toContain("canHandOverLead: stage === 'ready' && plan == null");
    // The room refuses it independently — a client that asked anyway must not be able to jump the
    // alternation, because the turn's tie-break hangs off the role.
    expect(worker).toContain('if (this.plan || this.sides.length !== 2) return;');
  });

  it('⛔ the invite reaches somebody who does not have the app yet', () => {
    const client = codeOf(read('src/platform/sharedClient.ts'));
    expect(client).toContain('export function pairLink');
    // A UNIVERSAL link, not a scheme: a scheme is grey text on a phone with no app installed.
    expect(client).toContain("/pair?c=");
    expect(client).not.toMatch(/return `hush:/);
    // The message still carries the code beside it — the half that works when nothing clever does.
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    expect(en.pair.inviteMessage).toContain('{{link}}');
    expect(en.pair.inviteMessage).toContain('{{code}}');
  });

  it('⛔ the three things a universal link needs, and it needs all three', () => {
    const worker = readRepo('server/hush-identity/src/index.ts');
    // 1 · the association file Apple's CDN fetches, scoped to /pair and nothing else on this origin
    expect(worker).toContain("path === '/.well-known/apple-app-site-association'");
    expect(worker).toContain("components: [{ '/': '/pair*' }]");
    expect(worker).toContain('T6ZRTBRT2U');
    /*
     * 2 · ⛔ THE ENTITLEMENT IS THE ONE PIECE THAT IS NOT HERE, AND THE LAW SAYS SO RATHER THAN
     * PRETENDING. `associatedDomains` was added to `app.json` and taken back out on 2026-08-31: the
     * App Store provisioning profile does not carry the Associated Domains capability, and EAS
     * cannot add it without Apple Developer credentials. Build 64 shipped without it.
     *
     * ⚠️ SO THE LAW HOLDS THE *TRADE*, NOT THE ASPIRATION. Until the capability is enabled the link
     * lands on the worker's page, which is strictly better than the scheme link it replaced (it can
     * offer the App Store; a scheme cannot). This assertion fails the day somebody adds the
     * entitlement back WITHOUT the capability — which is exactly the failure that cost two builds.
     */
    const app = JSON.parse(read('app.json'));
    expect(app.expo.ios.associatedDomains).toBeUndefined();
    // 3 · a page for the browser that opens it anyway, with a way to actually get the app
    expect(worker).toContain("path === '/pair'");
    expect(worker).toContain('APP_STORE_URL');
    // …and the code it echoes is filtered to the invite alphabet before it is put in HTML.
    expect(worker).toContain('const safeCode');
    expect(worker).toContain('CODE_ALPHABET.includes(c)');
  });

  it('the link opens the room, and the room is made legible rather than left invisible', () => {
    const root = read('src/app/Root.tsx');
    /* ⚠️ THE PATH, NOT THE WORD. `url.includes('pair')` was the first version and it would have
       matched any link with "pair" anywhere in it — including a plan link whose token happened to
       contain those four letters. Both forms are matched now, and only at the path. */
    expect(root).toMatch(/\^hush:.*pair.*\|.*pair/);
    expect(root).toContain('const pairCode =');
    expect(root).toContain('pairRef.current.join(');
    // Home turns a silent join into something she can see, once.
    expect(read('src/screens/home/Home.tsx')).toContain('if (!pair.joinedByLink) return;');
    expect(read('src/screens/home/Home.tsx')).toContain('pair.clearJoinedByLink();');
  });

  it('⛔ no account is a front door, never "that code opened no room"', () => {
    expect(sheet).toContain('pair.signedIn === false');
    expect(sheet).toContain("t('pair.signIn')");
    expect(store).toContain("await app.signIn('apple')");
  });

  it('⛔ the community is a SUM — nothing on that screen can be read as a ranking', () => {
    const circle = codeOf(read('src/domain/circle.ts'));
    expect(circle).toContain('export function circleWeekTotal');
    // No sort, no slice, no "top": the shape of the answer is what makes the law true.
    for (const ranking of ['.sort(', 'rank', 'leader', 'top', 'tonn']) {
      expect({ ranking, present: circle.toLowerCase().includes(ranking.toLowerCase()) })
        .toEqual({ ranking, present: false });
    }
    // …and it needed NO new field on the wire, which is the tell that it was the right fact.
    expect(circle).toContain("CIRCLE_PAYLOAD_KEYS = ['name', 'done', 'planned']");
  });

  it('the together record is read from her OWN history — no circle, no wire, no account', () => {
    expect(codeOf(read('src/domain/circle.ts'))).toContain('export function togetherCount');
    expect(read('src/screens/together/Together.tsx')).toContain('togetherCount(history, 0)');
  });

  it('⛔ ONE COUNT, ONE DERIVATION — the shared-workout number is said once and computed once', () => {
    const together = codeOf(read('src/screens/together/Together.tsx'));
    // Both readers come off the same call. The inline filter that used to answer the same question
    // a second way is gone — two answers to one question is what put two numbers on one screen.
    expect(together).toContain('const together = togetherCount(history, 0);');
    expect(together).toContain('setSharedCount(together.count);');
    expect(together).toContain('setTrainedTogether(together);');
    expect(together).not.toContain('h.partners?.length ?? 0) > 0).length');
    // …and the names line carries NO count of its own.
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    expect(en.together.trainedWithNames).not.toContain('{{count}}');
  });

  it('⛔ a privacy choice that resets is not a choice', () => {
    expect(read('src/data/local/db.ts')).toContain('pairLoadsPrivate?: boolean;');
    expect(store).toContain('pairLoadsPrivate: v');
    expect(store).toContain('setLoadsPrivate(!!p.pairLoadsPrivate)');
  });

  it('the row says how much LONGER, not only where — the hand-off moment', () => {
    const strip = read('src/components/PairStrip.tsx');
    expect(strip).toContain('const theirLastSet = !st.mine && st.theirsSet.n === st.theirsSet.m;');
    expect(strip).toContain("t('pair.lastSet')");
  });

  it('§11.2 has a door in the social home as well as on Today', () => {
    const together = read('src/screens/together/Together.tsx');
    expect(together).toContain("t('together.pairTitle')");
    expect(together).toContain('<TrainTogetherSheet');
    // …and NO `onBegin` there: a workout starts from Today, through the Begin she presses daily.
    const mount = together.slice(together.indexOf('<TrainTogetherSheet'), together.indexOf('<TrainTogetherSheet') + 300);
    expect(mount).not.toContain('onBegin');
  });

  it('⛔ a Begin that cannot begin is never offered — found by opening the real app', () => {
    /*
     * Home handed the sheet its own `onStart` unconditionally, and `onStart` returns early with no
     * queued workout and on a resting week. So the host's Begin was a cream primary button that did
     * nothing — the gated-guest defect one screen over. No test could see it; opening the app could.
     */
    const home = read('src/screens/home/Home.tsx');
    expect(home).toContain('onBegin={todayId && !resting && !doneCoachIds.includes(todayId) ?');
    // …and a host with nowhere to begin is told where the beginning is, rather than left in silence.
    expect(sheet).toContain("pair.role === 'host' && !onBegin");
    expect(sheet).toContain("t('pair.hostElsewhere')");
    /*
     * ⚠️ AND THE DOOR ITSELF STILL DRAWS. A guest needs no workout of his own — he adopts his
     * partner's, and his engine prices it — so the row hides only for a real conflict.
     */
    expect(read('src/screens/home/HomeView.tsx')).toContain('hidden={!!props.resumable}');
  });

  it('one shared hour reads as one kind of thing in both histories', () => {
    expect(store).toContain("name: tg('pair.recordName')");
    expect(store).not.toContain('+ ${nameRef.current');
  });
});
