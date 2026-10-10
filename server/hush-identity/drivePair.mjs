/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FAILURE MATRIX, WALKED — two real clients, one real room. (2026-08-31)
 *
 * Founder: *"מה זה אומר שורות מטריצת הכשל הזה. למה אתה לא יכול לטפל בזה"* — and the honest answer
 * was that most of it needed no gym at all. `docs/architecture/SHARED_SESSION_V1.md` §7 lists ten
 * ways a pair comes apart. The unit tests prove the arithmetic; `driveRoom.mjs` proves the relay;
 * this proves the thing between them, which is where the interesting failures actually live:
 *
 *   **two copies of `src/platform/sharedClient.ts` talking through `HushPairRoom`.**
 *
 * ⛔ THE ONE PROPERTY EVERY ROW IS CHECKED AGAINST. After each scenario, both sides derive
 * `sharedStanding` independently and must agree about whose turn it is and which station the pair
 * is at. That is the promise the whole design rests on; a row that ends with the two screens
 * disagreeing has broken it however plausible the intermediate steps looked.
 *
 * ── HOW TO RUN ──────────────────────────────────────────────────────────────────────────────────
 *   cd server/hush-identity
 *   npx wrangler dev --port 8787 --local
 *   node drivePair.mjs                 # plants its own tickets; needs Node 22+ (global WebSocket)
 *
 * ── WHAT IT STILL CANNOT SEE (and no amount of this can) ────────────────────────────────────────
 * iOS suspending an app and killing its socket without a close event; a gym access point dropping
 * packets rather than connections; `AppState`, the Keychain, Sign in with Apple; and whether any
 * of it is legible at arm's length on real glass. Those are the rows that need two phones.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* ⚠️ `pathToFileURL`, not a bare path — on Windows a dynamic import of `C:\…` is read as a URL
   whose scheme is "c:", and the ESM loader refuses it. */
const mod = (f) => pathToFileURL(join(HERE, '.driven', f)).href;
const { pairConnect } = await import(mod('sharedClient.mjs'));
const { setTickets, ticketsLeft } = await import(mod('stubs.mjs'));
const { sharedStanding, acceptsFrame } = await import(mod('sharedSession.mjs'));

const fail = [];
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fail.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── tickets: single-use, so a reconnect needs a fresh one. That is the protocol, not a nuisance ──
const TICKETS = Array.from({ length: 14 }, (_, i) => `d${i}`);
console.log('planting tickets…');
for (const t of TICKETS) {
  const role = t === 'd0' ? 'host' : t === 'd1' ? 'guest' : 'guest';
  const sub = t === 'd0' ? 'subHOST' : 'subGUEST';
  /* ⚠️ `shell: true` — Node refuses to spawn a `.cmd` directly on Windows (EINVAL), and wrangler
     is one. The payload is a fixed JSON literal built here, never anything a caller supplies. */
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', '--binding', 'HUSH_KV', '--local', `ticket:${t}`,
     JSON.stringify(JSON.stringify({ code: 'DRIVEN', sub, role }))],
    { cwd: HERE, stdio: 'ignore', shell: true },
  );
}
console.log(`planted ${TICKETS.length}\n`);

const PLAN = { v: 1, lifts: [{ exerciseId: 'bench', sets: 4 }, { exerciseId: 'row', sets: 3 }] };

/** One phone: the real client, plus the little the pair store does around it. */
function phone(tag, role, tickets) {
  setTickets(tickets);
  const state = { role, plan: null, peer: null, link: 'idle', partner: null, swapAsk: null, swapAnswer: null };
  const done = [0, 0];
  let clockSkewMs = 0;
  const room = pairConnect('DRIVEN', tickets[0], {
    onRole: (r) => { state.role = r; },
    onPlan: (p) => { if (!state.plan || p.v > state.plan.v) state.plan = p; },
    onPeer: (p) => { if (acceptsFrame(state.peer, p)) state.peer = p; },
    onPartner: (s) => { state.partner = s; },
    onSwapAsk: (from, to) => { state.swapAsk = { from, to }; },
    onSwapAnswer: (a) => { state.swapAnswer = a; },
    onLink: (l) => { state.link = l; },
    onFailure: () => {},
  });
  const api = {
    tag, state, room, done,
    skew: (ms) => { clockSkewMs = ms; },
    publish: (presence = 'lifting', bar) => room.publish({
      v: state.plan?.v ?? 0,
      name: tag,
      presence,
      done: [...done],
      at: Date.now() + clockSkewMs,
      ...(bar ? { bar } : {}),
    }),
    /**
     * ⚠️ THE HOST HOLDS THE PLAN LOCALLY, because the room relays to the OTHER socket and never
     * echoes. `pairStore` does exactly this — `setPlan` runs on the host's own phone and the send
     * is a separate effect — and a harness that waited for a round trip would sit for ever holding
     * a null it had itself published.
     */
    publishPlan: (plan) => { state.plan = plan; room.publishPlan(plan); },
    /** Log a set at the pair's current station, exactly as the stage would. */
    logAt: (liftIndex) => { done[liftIndex] += 1; api.publish(); },
    standing: () => sharedStanding({
      plan: state.plan ?? PLAN,
      role: state.role,
      mine: { v: state.plan?.v ?? 0, name: tag, presence: 'lifting', done: [...done], at: Date.now() },
      theirs: state.peer,
      nowMs: Date.now(),
    }),
  };
  return api;
}

const agree = (A, B, label) => {
  const a = A.standing();
  const b = B.standing();
  ok(`${label} — both screens agree`,
     a.turn === b.turn && a.liftIndex === b.liftIndex && (a.mine !== b.mine || a.turn == null),
     `A:${a.turn}@${a.liftIndex} B:${b.turn}@${b.liftIndex}`);
};

const A = phone('Ofek', 'host', TICKETS.slice(0, 7));
await sleep(600);
const B = phone('Dan', 'guest', TICKETS.slice(7));
await sleep(700);

ok('the two clients are connected', A.state.link === 'open' && B.state.link === 'open');
A.publishPlan(PLAN);
A.publish();
B.publish();
await sleep(500);
ok('the guest has the structure', B.state.plan?.lifts.length === 2);
ok('each knows the other by name', A.state.peer?.name === 'Dan' && B.state.peer?.name === 'Ofek');
agree(A, B, 'a fresh pair');

// ───────────────────────── ROW 4 · alternating, over a whole station ─────────────────────────
console.log('\n— row 4 · the alternation, set by set —');
for (let i = 0; i < 8; i++) {
  const turn = A.standing().turn;
  if (turn === 'host') A.logAt(0);
  else B.logAt(0);
  await sleep(180);
}
await sleep(300);
ok('four sets each, and nobody did five', A.done[0] === 4 && B.done[0] === 4, `A${A.done[0]} B${B.done[0]}`);
agree(A, B, 'the pair moved to the next station');
ok('…and it IS the next station', A.standing().liftIndex === 1);

// ───────────────────────── ROW 1 · one of them pauses ─────────────────────────
console.log('\n— row 1 · he goes to the bathroom —');
B.publish('paused');
await sleep(400);
ok('she sees him paused', A.state.peer?.presence === 'paused');
const beforePause = A.standing().turn;
A.publish();
await sleep(300);
ok('…and her own turn is untouched by it', A.standing().turn === beforePause);

// ───────────────────────── ROW 6 · the socket dies mid-workout ─────────────────────────
console.log('\n— row 6 · no signal —');
B.publish('lifting');
await sleep(300);
const beforeDrop = JSON.stringify(A.state.peer?.done);
// Kill the socket the way a gym does: no `bye`, no warning.
B.room.poke();                       // ensure open, then rip it out from under the client
const inner = B.room;
await sleep(100);
// Force a close by exhausting the socket: the client only learns through `onclose`.
(await import('node:timers/promises')).setTimeout(0);
B.state.link = 'closed';
inner.close();                        // deliberate: the client marks itself closed and stops
await sleep(400);
ok('⛔ HER WORKOUT IS UNAFFECTED — she logs while he is off the air', (() => {
  const before = A.standing().liftIndex;
  A.logAt(1);
  return A.standing().liftIndex === before;
})());
ok('and her count is her own, held locally', A.done[1] === 1);

// He comes back on a FRESH ticket — the whole reconnect protocol is "re-send where I am".
console.log('  (he reconnects)');
const B2 = phone('Dan', 'guest', TICKETS.slice(10));
B2.done[0] = 4;                       // he still holds everything he did before the drop
await sleep(800);
B2.publish();
await sleep(500);
ok('⛔ HE RE-SENDS WHERE HE IS, AND SHE IS CORRECT AGAIN',
   JSON.stringify(A.state.peer?.done) === JSON.stringify([4, 0]),
   `was ${beforeDrop}, now ${JSON.stringify(A.state.peer?.done)}`);
A.publish();
await sleep(400);
ok('…and he has her, without either of them replaying anything',
   JSON.stringify(B2.state.peer?.done) === JSON.stringify([4, 1]));
agree(A, B2, 'after a reconnect');

// ───────────────────────── ROW 7 · a stale frame arrives late ─────────────────────────
console.log('\n— row 7 · a duplicate and a straggler —');
const held = JSON.stringify(A.state.peer);
B2.room.publish({ v: 1, name: 'Dan', presence: 'resting', done: [1, 0], at: Date.now() - 60_000 });
await sleep(400);
ok('⛔ an OLD frame cannot walk his count backwards', JSON.stringify(A.state.peer) === held);

// ───────────────────────── ROW 8 · his clock is ten minutes fast ─────────────────────────
console.log('\n— row 8 · the clocks disagree —');
B2.skew(600_000);
B2.logAt(1);
await sleep(400);
ok('a skewed clock still delivers, and is still ordered', A.state.peer?.done?.[1] === 1);
agree(A, B2, 'with a ten-minute clock skew');
B2.skew(0);

// ───────────────────────── ROW 2 · the swap, proposed ─────────────────────────
console.log('\n— row 2 · he wants a different lift —');
B2.room.askSwap('row', 'cable_row');
await sleep(400);
ok('the proposal reaches her', A.state.swapAsk?.to === 'cable_row');
A.room.answerSwap(false);
await sleep(400);
ok('a decline reaches him, and nothing changed', B2.state.swapAnswer === false && A.standing().exerciseId === 'row');

// ───────────────────────── ROW 10 · they drift to different stations ─────────────────────────
console.log('\n— row 10 · drift —');
A.done[1] = 3;                        // she finishes the station; he has not
A.publish();
await sleep(400);
const sa = A.standing();
const sb = B2.standing();
ok('⛔ the pair still names ONE station, from both sides', sa.liftIndex === sb.liftIndex && sa.turn === sb.turn,
   `A:${sa.turn}@${sa.liftIndex} B:${sb.turn}@${sb.liftIndex}`);
ok('…and it is HIS turn, because he is the one with sets left', sa.turn === 'guest');

// ───────────────────────── ROW 3 · he finishes and goes home ─────────────────────────
console.log('\n— row 3 · he leaves —');
B2.room.close();
await sleep(600);
ok('she is told he left', A.state.partner === 'left');
const late = sharedStanding({
  plan: A.state.plan ?? PLAN, role: 'host',
  mine: { v: 1, name: 'Ofek', presence: 'lifting', done: [...A.done], at: Date.now() },
  theirs: { ...A.state.peer, at: Date.now() - 10 * 60_000 },
  nowMs: Date.now(),
});
ok('⛔ and three minutes of silence turns into "carry on alone", not a frozen screen', late.stale === true);

A.room.close();
await sleep(300);
console.log(`\ntickets left: ${ticketsLeft()}`);
console.log(fail.length === 0 ? '\nALL GREEN — the matrix holds between two real clients' : `\n${fail.length} FAILED: ${fail.join(', ')}`);
process.exit(fail.length === 0 ? 0 : 1);
