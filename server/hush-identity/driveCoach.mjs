/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK, WALKED — three athletes, two coaches, one real D1. (2026-09-17)
 *
 * ⛔ A HAND-RUN WIRE CHECK, NOT PART OF THE JEST SUITE — the same standing as `driveRoom.mjs`. It
 * needs `wrangler dev` running against a LOCAL database, neither of which belongs in a suite that
 * has to pass on a laptop with no Cloudflare account.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────────
 * The laws read `src/coach.ts` as text; the readers are pure and could be unit-tested. Neither says
 * whether the SQL is right — whether a partial unique index really holds one coach at a time,
 * whether `INSERT OR IGNORE` really makes an upload idempotent, whether an unlink really closes the
 * door on the very next request, whether the purge really takes the rows. Only D1 can say that, so
 * this asks it: every route in COACH_TRACK_V1 §4, then the database itself, row by row.
 *
 * ── HOW TO RUN ──────────────────────────────────────────────────────────────────────────────────
 *   cd server/hush-identity
 *   npx wrangler d1 migrations apply ferrox-coach --local        # once (0001 AND 0002)
 *   npx wrangler dev --port 8787 --local --test-scheduled \
 *       --var BILLING_TEST:drive-coach-local-billing-key         # § 13 only — see below
 *   node driveCoach.mjs
 *
 * ⛔ `--var BILLING_TEST:…` IS WHAT MAKES § 13 (the plan) REACHABLE, and it belongs on a command
 * line and nowhere else. It appears in no wrangler.toml, in no `wrangler secret put` step and in no
 * deploy instruction; `appleBilling.testGateOpen` also demands a loopback hostname, so even a
 * deployed worker handed the var could not be driven this way. Without it § 13 fails at 13.6 with
 * `billing_not_configured`, which is exactly what a deployment without Apple's key answers.
 *
 * Sessions are planted straight into the local KV (`session:<token>` → sub), which is exactly what
 * `/auth/apple` writes after Apple's signature checks out — there is no dev-only route to get one,
 * and there must never be. Every run mints fresh subs and tokens, so it can be re-run without a
 * reset; the purge step backdates ONLY this run's rows.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.COACH_BASE ?? 'http://127.0.0.1:8787';
/**
 * ⛔ THE LOCAL BILLING KEY — the same string `wrangler dev --var BILLING_TEST:…` is started with.
 * It is not a secret and it is not a credential: it is the thing that makes the test-injection path
 * (step 13) reachable on 127.0.0.1 and NOWHERE ELSE. See `src/appleBilling.ts`'s header for the two
 * locks, and `theCoachPlanCannotBeSelfGranted.test.ts` for the law that proves production has none.
 */
const BILLING_TEST = process.env.BILLING_TEST ?? 'drive-coach-local-billing-key';
const hmac = (message) => createHmac('sha256', BILLING_TEST).update(message).digest('hex');
const RUN = Date.now().toString(36);
const DAY = 24 * 60 * 60 * 1000;

const fail = [];
let passed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? ' — ' + detail : ''}`);
  if (cond) passed++;
  else fail.push(name);
};

/* ⚠️ `shell: true` — Node refuses to spawn a `.cmd` directly on Windows (EINVAL), and wrangler is
   one. Every argument is a literal built in this file; the SQL is double-quoted for cmd.exe and
   uses no `<`, `>`, `%`, `^` or `"` for the same reason. */
const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { cwd: HERE, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function sql(q) {
  const out = wrangler(['d1', 'execute', 'ferrox-coach', '--local', '--json', '--command', `"${q}"`]);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

async function call(method, path, token, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const init = {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    };
    /* ⚠️ ONE RETRY ON A RESET SOCKET. The `sql()` checks take seconds, and a keep-alive connection
       workerd closed while they ran is handed back to the next fetch, which dies ECONNRESET before
       the request is sent — nothing reached the worker, so sending it again is not a double write. */
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (e) {
      if (e?.cause?.code !== 'ECONNRESET') throw e;
      res = await fetch(BASE + path, init);
    }
    const text = await res.text();
    if (res.status === 429) {
      console.log('      (rate-limited — waiting 61 s, the limiter is per minute)');
      await new Promise((r) => setTimeout(r, 61_000));
      continue;
    }
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* html */
    }
    return { status: res.status, data, text };
  }
  throw new Error('rate limited three times');
}

// ── the cast ──────────────────────────────────────────────────────────────────────────────────
const who = {
  dana: { sub: `sub_dana_${RUN}`, token: `tok_dana_${RUN}` }, // coach A
  eli: { sub: `sub_eli_${RUN}`, token: `tok_eli_${RUN}` }, // coach B
  noa: { sub: `sub_noa_${RUN}`, token: `tok_noa_${RUN}` }, // trainee 1
  tal: { sub: `sub_tal_${RUN}`, token: `tok_tal_${RUN}` }, // trainee 2 (consents to everything)
  gil: { sub: `sub_gil_${RUN}`, token: `tok_gil_${RUN}` }, // trainee 3 (the seat that is full)
  // § 13, the plan: a coach who pays, a coach who tries to claim his receipt, and three athletes.
  rina: { sub: `sub_rina_${RUN}`, token: `tok_rina_${RUN}` }, // coach C — buys Coach 10
  shai: { sub: `sub_shai_${RUN}`, token: `tok_shai_${RUN}` }, // coach D — claims Rina's transaction
  omer: { sub: `sub_omer_${RUN}`, token: `tok_omer_${RUN}` },
  yael: { sub: `sub_yael_${RUN}`, token: `tok_yael_${RUN}` },
  zohar: { sub: `sub_zohar_${RUN}`, token: `tok_zohar_${RUN}` },
};

console.log(`run ${RUN} — planting ${Object.keys(who).length} sessions in local KV…`);
for (const p of Object.values(who)) {
  wrangler(['kv', 'key', 'put', '--binding', 'HUSH_KV', '--local', `session:${p.token}`, p.sub]);
}
console.log('planted\n');

const WEEK = (tag) => ({
  v: 1,
  title: `Block ${tag}`,
  secret: 'dropped',
  days: [
    {
      name: 'Push',
      extra: 1,
      lifts: [
        { ex: 'bench_press', sets: 4, band: [6, 8], note: 'Pause the first rep', pairNext: true, rpe: 9 },
        { ex: 'overhead_press', sets: 3, band: [8, 10], pairNext: true },
      ],
    },
  ],
});

// ── 1 · the door ──────────────────────────────────────────────────────────────────────────────
{
  const r = await call('GET', '/coach/me');
  ok('1.1 no session → 401', r.status === 401);
  const n = await call('POST', '/coach/invite', who.noa.token);
  ok('1.2 an unenrolled caller cannot invite → 403 not_coach', n.status === 403 && n.data?.error === 'not_coach', n.text);
  const me = await call('GET', '/coach/me', who.noa.token);
  ok('1.3 /coach/me for a stranger → {}', me.status === 200 && Object.keys(me.data).length === 0, me.text);
}

// ── 2 · enroll ────────────────────────────────────────────────────────────────────────────────
{
  const a = await call('POST', '/coach/enroll', who.dana.token, { name: 'Dana' });
  ok('2.1 enroll → coach with 2 free seats, 0 used', a.status === 200 && a.data.coach.seats === 2 && a.data.coach.used === 0, a.text);
  const b = await call('POST', '/coach/enroll', who.dana.token, { name: 'Dana K' });
  ok('2.2 enroll again is idempotent, and renames', b.status === 200 && b.data.coach.name === 'Dana K', b.text);
  const bad = await call('POST', '/coach/enroll', who.eli.token, { name: 'x'.repeat(41) });
  ok('2.3 a 41-character name is refused', bad.status === 400, bad.text);
  const e = await call('POST', '/coach/enroll', who.eli.token, { name: 'Eli' });
  ok('2.4 a second coach enrolls', e.status === 200, e.text);
}

// ── 3 · invite + join ─────────────────────────────────────────────────────────────────────────
const inv = [];
for (let i = 0; i < 4; i++) inv.push((await call('POST', '/coach/invite', who.dana.token)).data);
const eliInvite = (await call('POST', '/coach/invite', who.eli.token)).data;
ok('3.1 invite → 6-char code, getferrox.com/c/ url, 7-day expiry',
  /^[A-Z2-9]{6}$/.test(inv[0].code) && inv[0].url === `https://getferrox.com/c/${inv[0].code}` &&
  Math.abs(Date.parse(inv[0].expiresAt) - Date.now() - 7 * DAY) < 60_000, JSON.stringify(inv[0]));

let L1, L2, L3, L1first;
{
  const self = await call('POST', '/coach/join', who.dana.token, { code: inv[0].code, name: 'Dana' });
  ok('3.2 a coach tapping her own invite → 409 self', self.status === 409 && self.data.error === 'self', self.text);

  const j = await call('POST', '/coach/join', who.noa.token, {
    code: inv[0].code.toLowerCase(), name: 'Noa', sex: 'female', days: 4, consent: { bodyweight: false, cardio: false }, sub: 'forged',
  });
  L1 = j.data?.linkId;
  ok('3.3 trainee joins (lower-case code) → linkId, coachName, since, no week yet',
    j.status === 200 && /^l_/.test(L1) && j.data.coachName === 'Dana K' && !!Date.parse(j.data.since) && !('week' in j.data), j.text);

  const again = await call('POST', '/coach/join', who.noa.token, { code: inv[0].code, name: 'Noa' });
  ok('3.4 her own retry of the same code → the same link (lost answer, not a new link)', again.status === 200 && again.data.linkId === L1, again.text);

  const reused = await call('POST', '/coach/join', who.tal.token, { code: inv[0].code, name: 'Tal' });
  ok('3.5 a used code for somebody else → 404 bad_code (single use)', reused.status === 404 && reused.data.error === 'bad_code', reused.text);

  const t = await call('POST', '/coach/join', who.tal.token, { code: inv[1].code, name: 'Tal', consent: { bodyweight: true, cardio: true } });
  L2 = t.data?.linkId;
  ok('3.6 second trainee joins with full consent', t.status === 200 && !!L2, t.text);

  const full = await call('POST', '/coach/join', who.gil.token, { code: inv[2].code, name: 'Gil' });
  ok('3.7 third trainee on 2 free seats → 409 seats_full', full.status === 409 && full.data.error === 'seats_full', full.text);
  const stillFree = sql(`SELECT used_at FROM coach_invites WHERE code = '${inv[2].code}'`);
  ok('3.8 …and the refused join did not burn the invite', stillFree[0]?.used_at === null, JSON.stringify(stillFree));

  const second = await call('POST', '/coach/join', who.noa.token, { code: eliInvite.code, name: 'Noa' });
  ok('3.9 a linked trainee joining a second coach → 409 already_linked', second.status === 409 && second.data.error === 'already_linked', second.text);

  const typo = await call('POST', '/coach/join', who.gil.token, { code: 'ZZZZZZ', name: 'Gil' });
  ok('3.10 a code that was never minted → 404 bad_code', typo.status === 404 && typo.data.error === 'bad_code', typo.text);

  const meA = await call('GET', '/coach/me', who.dana.token);
  ok('3.11 coach /me → used 2 of 2', meA.data.coach?.used === 2 && meA.data.coach?.seats === 2, meA.text);
  const meN = await call('GET', '/coach/me', who.noa.token);
  ok('3.12 trainee /me → athleteOf {linkId, coachName, since, consent}',
    meN.data.athleteOf?.linkId === L1 && meN.data.athleteOf.coachName === 'Dana K' && meN.data.athleteOf.consent.bodyweight === false, meN.text);
  const noSub = await call('GET', '/coach/me', who.dana.token);
  ok('3.13 the stored link kept no forged key', !JSON.stringify(sql(`SELECT * FROM coach_links WHERE id = '${L1}'`)).includes('forged'));
  void noSub;
}

// ── 4 · the week ──────────────────────────────────────────────────────────────────────────────
{
  const long = WEEK('x');
  long.days[0].lifts[0].note = 'n'.repeat(141);
  const r141 = await call('PUT', `/coach/athlete/week?l=${L1}`, who.dana.token, { week: long });
  ok('4.1 ⛔ law 7: a 141-character note is refused → 400 bad_week', r141.status === 400 && r141.data.error === 'bad_week', r141.text);
  const badEx = WEEK('x');
  badEx.days[0].lifts[0].ex = 'Bench Press';
  ok('4.2 an exercise id outside the catalogue shape is refused', (await call('PUT', `/coach/athlete/week?l=${L1}`, who.dana.token, { week: badEx })).status === 400);

  const v1 = await call('PUT', `/coach/athlete/week?l=${L1}`, who.dana.token, { week: WEEK('one') });
  ok('4.3 send week → version 1', v1.status === 200 && v1.data.version === 1 && !!Date.parse(v1.data.sentAt), v1.text);
  const v2 = await call('PUT', `/coach/athlete/week?l=${L1}`, who.dana.token, { week: WEEK('two') });
  ok('4.4 send again → version 2', v2.status === 200 && v2.data.version === 2, v2.text);

  const pull = await call('GET', '/me/coach/week?since=0', who.noa.token);
  const w = pull.data.week;
  ok('4.5 trainee pulls since=0 → version 2, coachName, the week rebuilt',
    w?.version === 2 && w.coachName === 'Dana K' && w.week.title === 'Block two', pull.text);
  ok('4.6 unknown keys never crossed (secret/extra/rpe)', !/secret|extra|rpe/.test(pull.text), pull.text);
  ok('4.7 pairNext kept mid-day, dropped on the day\'s last lift',
    w?.week.days[0].lifts[0].pairNext === true && !('pairNext' in w.week.days[0].lifts[1]), pull.text);
  const same = await call('GET', '/me/coach/week?since=2', who.noa.token);
  ok('4.8 since=2 → no week (not newer)', same.status === 200 && !('week' in same.data), same.text);
  const older = await call('GET', '/me/coach/week?since=1', who.noa.token);
  ok('4.9 since=1 → version 2', older.data.week?.version === 2, older.text);
  const stranger = await call('PUT', `/coach/athlete/week?l=${L1}`, who.eli.token, { week: WEEK('eli') });
  ok('4.10 another coach cannot write to the link → 404', stranger.status === 404, stranger.text);
}

// ── 5 · uploads ───────────────────────────────────────────────────────────────────────────────
{
  const at = new Date(Date.now() + 1000).toISOString();
  const s1 = {
    id: 'sess_1', at, day: 'Push', weekVersion: 2, minutes: 52, early: false,
    sets: [{ ex: 'bench_press', load: 80, reps: 8, rpe: 9 }, { ex: 'pull_up', load: null, reps: 10 }],
    swaps: [{ from: 'overhead_press', to: 'dumbbell_press' }], skipped: ['dips'], pain: ['shoulder'],
    bodyweightKg: 70, healthKit: { hr: 150 },
  };
  const preLink = { ...s1, id: 'sess_old', at: new Date(Date.now() - 3 * DAY).toISOString() };
  const broken = { ...s1, id: 'sess_bad', sets: [{ ex: 'bench_press', load: 2000, reps: 8 }] };
  const run = { id: 'run_1', at, kind: 'run', metres: 5000, seconds: 1500, gps: [[1, 2]] };
  const up = await call('POST', '/me/coach/sessions', who.noa.token, { sessions: [s1, preLink, broken, s1], cardio: [run] });
  ok('5.1 upload → 200, only the valid post-link session counted (twice in one batch)', up.status === 200 && up.data.accepted === 2, up.text);
  const again = await call('POST', '/me/coach/sessions', who.noa.token, { sessions: [s1] });
  ok('5.2 the same session re-sent → accepted', again.status === 200 && again.data.accepted === 1, again.text);
  const rows = sql(`SELECT id, bodyweight_kg, payload_json FROM coach_sessions WHERE link_id = '${L1}'`);
  ok('5.3 idempotent on (link, id): exactly one row, pre-link and broken dropped', rows.length === 1 && rows[0].id === 'sess_1', JSON.stringify(rows));
  ok('5.4 no consent → bodyweight NOT stored', rows[0]?.bodyweight_kg === null, JSON.stringify(rows));
  ok('5.5 unknown keys never stored (rpe, healthKit)', !/rpe|healthKit|hr/.test(rows[0]?.payload_json ?? ''), rows[0]?.payload_json);
  ok('5.6 no cardio consent → the run was not stored', sql(`SELECT COUNT(*) AS n FROM coach_cardio WHERE link_id = '${L1}'`)[0].n === 0);
  const tooMany = await call('POST', '/me/coach/sessions', who.noa.token, { sessions: Array.from({ length: 21 }, (_, i) => ({ ...s1, id: `b${i}` })) });
  ok('5.7 a batch of 21 → 400', tooMany.status === 400, tooMany.text);

  const t = await call('POST', '/me/coach/sessions', who.tal.token, {
    sessions: [{ ...s1, id: 'tal_1', bodyweightKg: 61.25 }], cardio: [run],
  });
  ok('5.8 consenting trainee: session + run accepted', t.status === 200 && t.data.accepted === 2, t.text);
  const trows = sql(`SELECT bodyweight_kg FROM coach_sessions WHERE link_id = '${L2}'`);
  ok('5.9 …bodyweight stored under consent', trows[0]?.bodyweight_kg === 61.3, JSON.stringify(trows));
}

// ── 6 · the coach reads ───────────────────────────────────────────────────────────────────────
{
  const r = await call('GET', '/coach/roster', who.dana.token);
  const noa = r.data.athletes?.find((a) => a.linkId === L1);
  const tal = r.data.athletes?.find((a) => a.linkId === L2);
  ok('6.1 roster → two athletes, name/sex/days/since/weekVersion', r.data.athletes?.length === 2 && noa?.name === 'Noa' && noa.sex === 'female' && noa.days === 4 && noa.weekVersion === 2, r.text);
  ok('6.2 recent = last 14 days of uploads', noa?.recent.length === 1 && tal?.recent.length === 1, r.text);
  ok('6.3 ⛔ no trainee sub anywhere in the roster', !r.text.includes(who.noa.sub) && !r.text.includes(who.tal.sub) && !r.text.includes('sub_'), r.text);
  ok('6.4 consent at read: Noa\'s recent carries no bodyweight, Tal\'s does', !('bodyweightKg' in noa.recent[0]) && tal.recent[0].bodyweightKg === 61.3, r.text);

  const a1 = await call('GET', `/coach/athlete?l=${L1}`, who.dana.token);
  ok('6.5 athlete detail (no consent): week v2, 1 session, no bodyweightKg, no cardio',
    a1.status === 200 && a1.data.week?.version === 2 && a1.data.sessions.length === 1 && !('bodyweightKg' in a1.data) && !('cardio' in a1.data), a1.text);
  ok('6.6 ⛔ no trainee sub in the detail', !a1.text.includes('sub_'), a1.text);
  const a2 = await call('GET', `/coach/athlete?l=${L2}`, who.dana.token);
  ok('6.7 athlete detail (consent): bodyweightKg + cardio', a2.data.bodyweightKg === 61.3 && a2.data.cardio?.length === 1 && !('gps' in a2.data.cardio[0]), a2.text);
  const eli = await call('GET', `/coach/athlete?l=${L1}`, who.eli.token);
  ok('6.8 another coach reading the link → 404', eli.status === 404, eli.text);
  const trainee = await call('GET', '/coach/roster', who.noa.token);
  ok('6.9 a trainee calling the roster → 403 not_coach', trainee.status === 403, trainee.text);
}

// ── 7 · consent withdrawn ─────────────────────────────────────────────────────────────────────
{
  const off = await call('POST', '/me/coach/consent', who.tal.token, { consent: { bodyweight: false, cardio: false } });
  ok('7.1 consent off → ok', off.status === 200, off.text);
  const a2 = await call('GET', `/coach/athlete?l=${L2}`, who.dana.token);
  ok('7.2 the coach sees neither bodyweight nor cardio at once', !('bodyweightKg' in a2.data) && !('cardio' in a2.data) && !('bodyweightKg' in a2.data.sessions[0]), a2.text);
  ok('7.3 …and the database erased them', sql(`SELECT COUNT(*) AS n FROM coach_cardio WHERE link_id = '${L2}'`)[0].n === 0 &&
    sql(`SELECT bodyweight_kg FROM coach_sessions WHERE link_id = '${L2}'`)[0].bodyweight_kg === null);
  const bad = await call('POST', '/me/coach/consent', who.tal.token, { consent: { bodyweight: 'yes' } });
  ok('7.4 a non-boolean consent → 400', bad.status === 400, bad.text);
}

// ── 8 · templates ─────────────────────────────────────────────────────────────────────────────
{
  const t = await call('POST', '/coach/templates', who.dana.token, { name: 'Hypertrophy A', week: WEEK('tpl') });
  ok('8.1 save a template', t.status === 200 && /^t_/.test(t.data.template.id), t.text);
  await call('POST', '/coach/templates', who.dana.token, { name: 'Hypertrophy A', week: WEEK('tpl2') });
  const list = await call('GET', '/coach/templates', who.dana.token);
  ok('8.2 the same name replaces, never duplicates', list.data.templates.length === 1 && list.data.templates[0].week.title === 'Block tpl2', list.text);
  await call('POST', '/coach/templates/delete', who.dana.token, { id: t.data.template.id });
  ok('8.3 delete → gone', (await call('GET', '/coach/templates', who.dana.token)).data.templates.length === 0);
}

// ── 9 · unlink: the coach removes, the trainee leaves ────────────────────────────────────────
{
  const rm = await call('POST', `/coach/athlete/remove?l=${L1}`, who.dana.token);
  ok('9.1 coach removes Noa → ok', rm.status === 200, rm.text);
  const after = await call('GET', `/coach/athlete?l=${L1}`, who.dana.token);
  ok('9.2 ⛔ law 6: access stops at once → 404', after.status === 404, after.text);
  const put = await call('PUT', `/coach/athlete/week?l=${L1}`, who.dana.token, { week: WEEK('late') });
  ok('9.3 …and no week can be sent to an ended link', put.status === 404, put.text);
  const pull = await call('GET', '/me/coach/week?since=0', who.noa.token);
  ok('9.4 the trainee is told she is not linked', pull.status === 404 && pull.data.error === 'not_linked', pull.text);
  const rowsKept = sql(`SELECT COUNT(*) AS n FROM coach_sessions WHERE link_id = '${L1}'`)[0].n;
  ok('9.5 ended is not deleted — the rows wait for the purge', rowsKept === 1);

  const leave = await call('POST', '/me/coach/leave', who.tal.token);
  ok('9.6 trainee leaves → ok', leave.status === 200, leave.text);
  ok('9.7 the coach loses her at once → 404', (await call('GET', `/coach/athlete?l=${L2}`, who.dana.token)).status === 404);
  const r = await call('GET', '/coach/roster', who.dana.token);
  ok('9.8 roster is empty, seats free again', r.data.athletes.length === 0 && (await call('GET', '/coach/me', who.dana.token)).data.coach.used === 0, r.text);

  const g = await call('POST', '/coach/join', who.gil.token, { code: inv[2].code, name: 'Gil' });
  L3 = g.data?.linkId;
  ok('9.9 the invite refused on a full roster now works', g.status === 200 && !!L3, g.text);
  const n = await call('POST', '/coach/join', who.noa.token, { code: inv[3].code, name: 'Noa' });
  L1first = L1;
  L1 = n.data?.linkId;
  ok('9.10 Noa re-joins with a fresh invite → a NEW link', n.status === 200 && !!L1, n.text);
}

// ── 10 · law 8: account deletion cascades ────────────────────────────────────────────────────
{
  await call('POST', '/me/coach/sessions', who.gil.token, {
    sessions: [{ id: 'gil_1', at: new Date(Date.now() + 1000).toISOString(), day: 'Legs', minutes: 40, early: true, sets: [] }],
  });
  ok('10.1 Gil uploaded', sql(`SELECT COUNT(*) AS n FROM coach_sessions WHERE link_id = '${L3}'`)[0].n === 1);
  const del = await call('POST', '/account/delete', who.gil.token);
  ok('10.2 trainee deletes her account → ok', del.status === 200, del.text);
  ok('10.3 ⛔ her uploads are deleted NOW', sql(`SELECT COUNT(*) AS n FROM coach_sessions WHERE link_id = '${L3}'`)[0].n === 0);
  const l3 = sql(`SELECT ended_at, trainee_name FROM coach_links WHERE id = '${L3}'`)[0];
  ok('10.4 …her link ended and her name blanked', l3.ended_at !== null && l3.trainee_name === '', JSON.stringify(l3));
  ok('10.5 the coach lost her at once', (await call('GET', `/coach/athlete?l=${L3}`, who.dana.token)).status === 404);

  await call('POST', '/coach/templates', who.dana.token, { name: 'Kept?', week: WEEK('k') });
  const cdel = await call('POST', '/account/delete', who.dana.token);
  ok('10.6 coach deletes her account → ok', cdel.status === 200, cdel.text);
  const live = sql(`SELECT COUNT(*) AS n FROM coach_links WHERE coach_sub = '${who.dana.sub}' AND ended_at IS NULL`)[0].n;
  ok('10.7 ⛔ every link of hers ended', live === 0);
  ok('10.8 her invites and templates are deleted',
    sql(`SELECT COUNT(*) AS n FROM coach_invites WHERE coach_sub = '${who.dana.sub}'`)[0].n === 0 &&
    sql(`SELECT COUNT(*) AS n FROM coach_templates WHERE coach_sub = '${who.dana.sub}'`)[0].n === 0);
  const me = await call('GET', '/coach/me', who.noa.token);
  ok('10.9 Noa is no longer anybody\'s athlete', me.status === 200 && !('athleteOf' in me.data), me.text);
  ok('10.10 the deleted coach\'s session is gone', (await call('GET', '/coach/me', who.dana.token)).status === 401);
}

// ── 11 · the purge ───────────────────────────────────────────────────────────────────────────
{
  // Age THIS run's ended links 31 days, and one unused invite past its expiry, then fire the cron.
  sql(`UPDATE coach_links SET ended_at = ended_at - ${31 * DAY} WHERE coach_sub = '${who.dana.sub}' AND ended_at IS NOT NULL`);
  sql(`UPDATE coaches SET deleted_at = deleted_at - ${31 * DAY} WHERE sub = '${who.dana.sub}'`);
  sql(`UPDATE coach_invites SET expires_at = 1 WHERE code = '${eliInvite.code}'`);
  // A link ended YESTERDAY must survive the same purge.
  const eliFresh = (await call('POST', '/coach/invite', who.eli.token)).data;
  const tj = await call('POST', '/coach/join', who.tal.token, { code: eliFresh.code, name: 'Tal' });
  await call('POST', '/me/coach/sessions', who.tal.token, { sessions: [{ id: 'tal_eli', at: new Date(Date.now() + 1000).toISOString(), day: 'A', minutes: 1, early: false, sets: [] }] });
  await call('POST', '/me/coach/leave', who.tal.token);
  const res = await fetch(`${BASE}/__scheduled?cron=17+3+*+*+*`);
  ok('11.1 the cron ran', res.ok, `${res.status}`);
  const links = sql(`SELECT COUNT(*) AS n FROM coach_links WHERE coach_sub = '${who.dana.sub}'`)[0].n;
  const ids = [L1first, L1, L2, L3].map((x) => `'${x}'`).join(',');
  const orphans = sql(`SELECT (SELECT COUNT(*) FROM coach_sessions WHERE link_id IN (${ids})) + (SELECT COUNT(*) FROM coach_weeks WHERE link_id IN (${ids})) + (SELECT COUNT(*) FROM coach_cardio WHERE link_id IN (${ids})) AS n`)[0].n;
  ok('11.2 ⛔ law 6: links ended > 30 days ago are purged', links === 0, `${links}`);
  ok('11.3 …with their weeks, sessions and cardio', orphans === 0, `${orphans}`);
  ok('11.4 the deleted coach row is purged', sql(`SELECT COUNT(*) AS n FROM coaches WHERE sub = '${who.dana.sub}'`)[0].n === 0);
  ok('11.5 the expired invite is purged', sql(`SELECT COUNT(*) AS n FROM coach_invites WHERE code = '${eliInvite.code}'`)[0].n === 0);
  ok('11.6 a link ended yesterday survives, rows and all',
    tj.status === 200 && sql(`SELECT COUNT(*) AS n FROM coach_sessions WHERE link_id = '${tj.data.linkId}'`)[0].n === 1, tj.text);
}

// ── 12 · the public doors ────────────────────────────────────────────────────────────────────
{
  const aasa = await call('GET', '/.well-known/apple-app-site-association');
  ok('12.1 AASA carries /c/* and /c, and never a bare /c*', aasa.text.includes('"/c/*"') && aasa.text.includes('"/":"/c"') && !aasa.text.includes('"/c*"'), aasa.text);
  const page = await call('GET', '/c/K7M2QX');
  ok('12.2 /c/CODE → the code, large, and hush://coach?c=CODE', page.status === 200 && page.text.includes('hush://coach?c=K7M2QX') && page.text.includes('class="code">K7M2QX'), page.text.slice(0, 200));
  const q = await fetch(`${BASE}/c?c=K7M2QX`, { headers: { 'accept-language': 'he-IL,he;q=0.9' } });
  const qt = await q.text();
  ok('12.3 /c?c=CODE in Hebrew → rtl page', qt.includes('dir="rtl"') && qt.includes('hush://coach?c=K7M2QX'), qt.slice(0, 200));
  const evil = await call('GET', '/c/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  ok('12.4 a hostile code is filtered to the alphabet, never echoed', !evil.text.includes('<script') && !evil.text.includes('alert'), evil.text.slice(0, 300));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * 13 · THE COACH PAYS — a plan, a renewal, and a loss that takes nobody's week. (2026-09-18)
 *
 * ⛔ WITHOUT APPLE, AND WITHOUT PRETENDING TO BE APPLE. There is no way to mint a JWS that Apple
 * Root CA - G3 will vouch for, so this section uses the test-injection path in `appleBilling.ts` —
 * open only on a loopback hostname, only when `BILLING_TEST` is set, and only for a request that
 * carries its HMAC. Everything downstream of the injection (the seat column, the binding, the
 * over-limit derivation, the invite refusal, the renewal) is the SAME code a real purchase runs.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
{
  const TXN = `2000000${RUN}01`;
  const T10 = 'hush.coach.10.month';
  const T100 = 'hush.coach.100.month';
  const RENEWS = Date.now() + 30 * DAY;

  /** `POST /coach/plan` with the injection signed — or, with `sign: false`, without it. */
  const claim = async (token, sub, productId, injected, sign = true) => {
    const body = { productId, transactionId: TXN, ...(injected ? { test: injected } : {}) };
    const res = await fetch(`${BASE}/coach/plan`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(sign ? { 'x-hush-billing-test': hmac(`plan|${sub}|${productId}|${TXN}`) } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: JSON.parse(text || '{}'), text };
  };

  /** One App Store Server Notification, injected — the body itself is what is signed. */
  const notify = async (test) => {
    const raw = JSON.stringify({ test });
    const res = await fetch(`${BASE}/appstore/notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hush-billing-test': hmac(raw) },
      body: raw,
    });
    const text = await res.text();
    return { status: res.status, data: JSON.parse(text || '{}'), text };
  };
  const event = (notificationType, extra = {}) => ({
    notificationType,
    productId: T10,
    originalTransactionId: TXN,
    expiresDate: RENEWS,
    signedDate: Date.now(),
    ...extra,
  });

  const r = await call('POST', '/coach/enroll', who.rina.token, { name: 'Rina' });
  ok('13.1 a new coach starts on the free two, with no plan at all',
    r.data.coach.seats === 2 && r.data.plan === null, r.text);
  await call('POST', '/coach/enroll', who.shai.token, { name: 'Shai' });

  const naked = await claim(who.rina.token, who.rina.sub, T10, null, false);
  ok('13.2 ⛔ no Apple key and no injection → 503 billing_not_configured',
    naked.status === 503 && naked.data.error === 'billing_not_configured', naked.text);
  const unsigned = await claim(who.rina.token, who.rina.sub, T10, { productId: T10, originalTransactionId: TXN, state: 'active' }, false);
  ok('13.3 ⛔ an injection WITHOUT the HMAC changes nothing — it is not even an error of its own',
    unsigned.status === 503 && unsigned.data.error === 'billing_not_configured', unsigned.text);
  const forged = await claim(who.rina.token, who.rina.sub, T100, { productId: T10, originalTransactionId: TXN, state: 'active' });
  ok('13.4 ⛔ a body claiming 100 seats over a 10-seat purchase → 409 plan_mismatch',
    forged.status === 409 && forged.data.error === 'plan_mismatch', forged.text);
  const seatsAfterForgery = sql(`SELECT seat_limit FROM coaches WHERE sub = '${who.rina.sub}'`)[0].seat_limit;
  ok('13.5 …and not one seat moved in the database', seatsAfterForgery === null, `${seatsAfterForgery}`);

  const bought = await claim(who.rina.token, who.rina.sub, T10, { productId: T10, originalTransactionId: TXN, state: 'active', renewsAtMs: RENEWS });
  ok('13.6 ⛔ a verified purchase raises the seats 2 → 10',
    bought.status === 200 && bought.data.coach.seats === 10 && bought.data.coach.used === 0, bought.text);
  ok('13.7 …and the plan says which tier, when it renews, and that it is active',
    bought.data.plan?.productId === T10 && bought.data.plan.seats === 10 && bought.data.plan.state === 'active' &&
    Math.abs(Date.parse(bought.data.plan.renewsAt) - RENEWS) < 1000, bought.text);
  const me = await call('GET', '/coach/me', who.rina.token);
  ok('13.8 /coach/me answers the same plan', me.data.coach.seats === 10 && me.data.plan.state === 'active', me.text);

  const stolen = await claim(who.shai.token, who.shai.sub, T10, { productId: T10, originalTransactionId: TXN, state: 'active' });
  ok('13.9 ⛔ THE SAME TRANSACTION ON A SECOND ACCOUNT → 409 plan_claimed',
    stolen.status === 409 && stolen.data.error === 'plan_claimed', stolen.text);
  const shai = await call('GET', '/coach/me', who.shai.token);
  ok('13.10 …and the second coach still has two seats and no plan', shai.data.coach.seats === 2 && shai.data.plan === null, shai.text);

  // Three athletes — impossible on the free tier, which is the point of having bought the seats.
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call('POST', '/coach/invite', who.rina.token)).data.code);
  const links = [];
  for (const [i, t] of [who.omer, who.yael, who.zohar].entries()) {
    const j = await call('POST', '/coach/join', t.token, { code: codes[i], name: `A${i}` });
    links.push(j.data?.linkId);
  }
  ok('13.11 three athletes join on a ten-seat plan', links.every((l) => /^l_/.test(l)), JSON.stringify(links));
  await call('PUT', `/coach/athlete/week?l=${links[0]}`, who.rina.token, { week: WEEK('paid') });

  const expired = await notify(event('EXPIRED'));
  ok('13.12 the EXPIRED notification is applied', expired.status === 200 && expired.data.applied === 'applied', expired.text);
  const over = await call('GET', '/coach/me', who.rina.token);
  ok('13.13 ⛔ seats drop to the free two WITH THREE ATHLETES ON THEM, and the state says over_limit',
    over.data.coach.seats === 2 && over.data.coach.used === 3 && over.data.plan.state === 'over_limit' && over.data.plan.renewsAt === null, over.text);

  const liveLinks = sql(`SELECT COUNT(*) AS n FROM coach_links WHERE coach_sub = '${who.rina.sub}' AND ended_at IS NULL`)[0].n;
  const weeks = sql(`SELECT COUNT(*) AS n FROM coach_weeks WHERE link_id = '${links[0]}'`)[0].n;
  ok('13.14 ⛔ NOT ONE LINK AND NOT ONE WEEK WAS TAKEN', liveLinks === 3 && weeks === 1, `${liveLinks} links, ${weeks} weeks`);
  const roster = await call('GET', '/coach/roster', who.rina.token);
  ok('13.15 …he still sees all three of his athletes', roster.data.athletes?.length === 3, roster.text);
  const athleteWeek = await call('GET', '/me/coach/week?since=0', who.omer.token);
  ok('13.16 …and his athlete still has the week he wrote her', athleteWeek.data.week?.week.title === 'Block paid', athleteWeek.text);

  const blocked = await call('POST', '/coach/invite', who.rina.token);
  ok('13.17 ⛔ but he may not invite a fourth → 409 seats_full', blocked.status === 409 && blocked.data.error === 'seats_full', blocked.text);
  const joinBlocked = await call('POST', '/coach/join', who.tal.token, { code: codes[3], name: 'Tal' });
  ok('13.18 …and the invite he minted while paying cannot be spent either',
    joinBlocked.status === 409 && joinBlocked.data.error === 'seats_full', joinBlocked.text);

  const replay = await notify(event('DID_RENEW', { signedDate: Date.now() - 60_000 }));
  ok('13.19 ⛔ a DID_RENEW Apple re-sent from BEFORE the expiry is ignored, not obeyed',
    replay.status === 200 && replay.data.applied === 'stale', replay.text);
  ok('13.20 …seats are still two', (await call('GET', '/coach/me', who.rina.token)).data.coach.seats === 2);

  const renewed = await notify(event('DID_RENEW', { signedDate: Date.now() + 1000 }));
  ok('13.21 ⛔ the renewal restores the tier', renewed.data.applied === 'applied', renewed.text);
  const back = await call('GET', '/coach/me', who.rina.token);
  ok('13.22 …ten seats, three used, active again',
    back.data.coach.seats === 10 && back.data.coach.used === 3 && back.data.plan.state === 'active', back.text);
  ok('13.23 …and the invite button works again', (await call('POST', '/coach/invite', who.rina.token)).status === 200);

  const refunded = await notify(event('REFUND', { signedDate: Date.now() + 2000 }));
  ok('13.24 ⛔ a REFUND takes the seats back the same way', refunded.data.applied === 'applied', refunded.text);
  const afterRefund = await call('GET', '/coach/me', who.rina.token);
  ok('13.25 …two seats, over_limit, three athletes untouched',
    afterRefund.data.coach.seats === 2 && afterRefund.data.plan.state === 'over_limit' &&
    sql(`SELECT COUNT(*) AS n FROM coach_links WHERE coach_sub = '${who.rina.sub}' AND ended_at IS NULL`)[0].n === 3, afterRefund.text);
  const reclaim = await claim(who.rina.token, who.rina.sub, T10, { productId: T10, originalTransactionId: TXN, state: 'expired' });
  ok('13.26 ⛔ and a refunded receipt cannot be claimed back into seats → 409 plan_inactive',
    reclaim.status === 409 && reclaim.data.error === 'plan_inactive', reclaim.text);
  ok('13.27 …still two seats', (await call('GET', '/coach/me', who.rina.token)).data.coach.seats === 2);

  const stranger = await notify(event('DID_RENEW', { originalTransactionId: `nobody_${RUN}`, signedDate: Date.now() + 3000 }));
  ok('13.28 a notification for a purchase nobody here claimed creates nothing',
    stranger.data.applied === 'unknown' && sql(`SELECT COUNT(*) AS n FROM coaches WHERE plan_txn = 'nobody_${RUN}'`)[0].n === 0, stranger.text);
}

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) {
  console.log('FAILED:\n  ' + fail.join('\n  '));
  process.exit(1);
}
