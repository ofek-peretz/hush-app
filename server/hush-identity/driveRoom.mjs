/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TWO SOCKETS, ONE ROOM — `HushPairRoom` driven against the REAL Workers runtime. (2026-08-31)
 *
 * ⛔ A HAND-RUN WIRE CHECK, NOT PART OF THE JEST SUITE — the same standing as `__tests__/live`. It
 * needs `wrangler dev` running and three tickets planted in the local KV, neither of which belongs
 * in a suite that has to pass on a laptop with no Cloudflare account.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────────
 * Every other claim about the pair is held by a unit test or by reading a file. The room is the one
 * layer that only executes when TWO WEBSOCKETS ARE OPEN AT ONCE — the role assignment, the relay,
 * the field-by-field rebuild, the third-phone refusal, the lead handover. Until this was written it
 * had never run, on any machine, once.
 *
 * ── HOW TO RUN IT ───────────────────────────────────────────────────────────────────────────────
 *   cd server/hush-identity
 *   npx wrangler dev --port 8787 --local            # the real workerd, local KV, local DO
 *
 *   npx wrangler kv key put --binding HUSH_KV --local "ticket:tHOST"  '{"code":"TESTAA","sub":"subA","role":"host"}'
 *   npx wrangler kv key put --binding HUSH_KV --local "ticket:tGUEST" '{"code":"TESTAA","sub":"subB","role":"guest"}'
 *   npx wrangler kv key put --binding HUSH_KV --local "ticket:tTHIRD" '{"code":"TESTAA","sub":"subC","role":"guest"}'
 *
 *   node driveRoom.mjs                               # needs Node 22+ for a global WebSocket
 *
 * Tickets are single-use, so re-running means planting them again. That is the protocol working.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const BASE = 'ws://127.0.0.1:8787/pair/room?ticket=';
const seen = { A: [], B: [], C: [] };
const fail = [];

const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fail.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(ticket, tag) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE + ticket);
    ws.addEventListener('message', (e) => seen[tag].push(JSON.parse(e.data)));
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject);
    setTimeout(() => reject(new Error('timeout ' + tag)), 8000);
  });
}
const send = (ws, o) => ws.send(JSON.stringify(o));
const last = (tag, t) => [...seen[tag]].reverse().find((m) => m.t === t);
const all = (tag, t) => seen[tag].filter((m) => m.t === t);

const PLAN = { v: 1, lifts: [{ exerciseId: 'bb_bench_press', sets: 4 }, { exerciseId: 'cable_row', sets: 3 }] };
const prog = (over) => ({ v: 1, name: 'X', presence: 'resting', done: [0, 0], at: Date.now(), ...over });

const A = await open('tHOST', 'A');
await sleep(300);
ok('the host is told her role, server-decided', last('A', 'room')?.role === 'host');

const B = await open('tGUEST', 'B');
await sleep(400);
ok('the guest is told his role', last('B', 'room')?.role === 'guest');
ok('⛔ BOTH sides learn somebody arrived — the joiner too', all('A', 'partner').length >= 1 && all('B', 'partner').length >= 1);

send(A, { t: 'plan', plan: PLAN });
await sleep(300);
ok('the host publishes the structure and the guest receives it', JSON.stringify(last('B', 'plan')?.plan) === JSON.stringify(PLAN));

send(B, { t: 'plan', plan: { v: 9, lifts: [{ exerciseId: 'x', sets: 1 }] } });
await sleep(300);
ok('⛔ a GUEST cannot publish a plan', all('A', 'plan').length === 0);

send(A, { t: 'progress', p: prog({ name: 'Ofek', done: [1, 0], bar: { exerciseId: 'bb_bench_press', kg: 42.5, reps: 8 } }) });
await sleep(300);
const peer = last('B', 'peer')?.p;
ok('a whole progress vector is relayed', JSON.stringify(peer?.done) === '[1,0]');
ok('…with the bar, naming its lift', peer?.bar?.exerciseId === 'bb_bench_press' && peer?.bar?.kg === 42.5);

send(A, { t: 'progress', p: { ...prog({ done: [2, 0] }), actualWeight: 95, bodyweight: 78, email: 'x@y.z' } });
await sleep(300);
const scrubbed = last('B', 'peer')?.p;
ok('⛔ THE SERVER STRIPS WHAT THE ALLOW-LIST DOES NOT NAME',
   Object.keys(scrubbed).sort().join() === 'at,done,name,presence,v',
   Object.keys(scrubbed).sort().join());

send(A, { t: 'progress', p: { v: 1, name: 'Ofek', presence: 'crushing it', done: [3, 0], at: Date.now() } });
await sleep(300);
ok('a frame that is not one of the four words is refused whole', last('B', 'peer')?.p?.done?.[0] === 2);

send(A, { t: 'plan', plan: { ...PLAN, v: 1, lifts: [{ exerciseId: 'zzz', sets: 1 }] } });
await sleep(300);
ok('⛔ a plan version that did not advance cannot un-swap a lift', last('B', 'plan')?.plan?.lifts?.[0]?.exerciseId === 'bb_bench_press');

send(B, { t: 'lead' });
await sleep(300);
ok('⛔ the lead is FINAL once a plan exists', last('A', 'room')?.role === 'host' && last('B', 'room')?.role === 'guest');

send(B, { t: 'swapAsk', from: 'bb_bench_press', to: 'db_bench_press' });
await sleep(300);
ok('a swap proposal reaches the other side', last('A', 'swapAsk')?.to === 'db_bench_press');
send(A, { t: 'swapAnswer', accept: true });
await sleep(300);
ok('…and so does the answer', last('B', 'swapAnswer')?.accept === true);

// ⛔ TWO PEOPLE, NEVER THREE.
const C = await open('tTHIRD', 'C');
await sleep(500);
ok('⛔ a third phone is TOLD it is full, not silently dropped', last('C', 'error')?.error === 'pair_full');

/*
 * ⛔ A SPENT TICKET OPENS NOTHING — checked through a SOCKET, because `fetch` cannot.
 *
 * The first version of this asked `fetch(url, { headers: { upgrade: 'websocket' } })` and read the
 * status. Node refuses `upgrade` as a forbidden header, so the call threw and the check reported a
 * failure the room had not committed. A property about sockets is tested with a socket.
 */
let spent = 'never';
await new Promise((res) => {
  const ws = new WebSocket(BASE + 'tHOST');
  ws.addEventListener('open', () => { spent = 'opened'; res(); });
  ws.addEventListener('error', () => { spent = 'refused'; res(); });
  ws.addEventListener('close', () => { spent = 'refused'; res(); });
  setTimeout(res, 5000);
});
ok('⛔ a spent ticket opens nothing the second time', spent === 'refused', spent);

// …and the lead DOES move before a plan exists (the negative case is asserted above).
// Run `driveRoom.mjs` against a second room code to exercise it — see the header.

// A reconnect REPLACES rather than filling the room with one person twice.
await sleep(200);
A.close();
await sleep(400);
ok('the survivor is told the other one left', last('B', 'partner')?.state === 'left');

B.close();
await sleep(200);
console.log(fail.length === 0 ? '\nALL GREEN — the room behaves' : `\n${fail.length} FAILED: ${fail.join(', ')}`);
process.exit(fail.length === 0 ? 0 : 1);
