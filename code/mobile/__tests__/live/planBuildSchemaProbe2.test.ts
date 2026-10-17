// @ts-nocheck — hand-run only: which shape of a rep-range field the upstream accepts (2026-09-07).
import fs from 'fs';
import path from 'path';
const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const { buildWeekRequest, BUILD_WEEK_SCHEMA } = require('@/domain/buildPrompt');
jest.setTimeout(180_000);
async function call(schema, label) {
  const req = buildWeekRequest({ daysPerWeek: 2, sex: 'male', ask: 'שחקן כדורגל', locale: 'he', cache: false });
  const r = await fetch(process.env.EXPO_PUBLIC_COACH_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN, 'x-hush-install': 'probe' }, body: JSON.stringify({ blocks: req.blocks, schema, think: 'low' }) });
  const text = await r.text();
  // eslint-disable-next-line no-console
  console.log(label, 'STATUS', r.status, text.replace(/\s+/g, ' ').slice(0, 160));
}
function withReps(field) {
  const s = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  s.properties.days.items.properties.lifts.items.properties.reps = field;
  return s;
}
it('probes shapes', async () => {
  await call(withReps({ type: 'string' }), 'E:string'); await call(withReps({ type: 'integer' }), 'F2:integer'); await call(withReps({ type: 'string' }), 'E2:string'); await call(withReps({ type: 'integer', description: 'Optional. Target reps.' }), 'F3:integer+desc');
  await call(withReps({ type: 'integer' }), 'F:integer');
  const g = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  delete g.properties.days.items.properties.lifts.items.properties.reps;
  g.properties.days.items.properties.lifts.items.properties.range = { type: 'array', items: { type: 'integer' } };
  await call(g, 'G:range-array');
  await call(withReps({ type: 'array', items: { type: 'number' } }), 'H:array-number');
  const i = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  delete i.properties.days.items.properties.lifts.items.properties.reps;
  i.properties.days.items.properties.lifts.items.properties.repsLow = { type: 'integer' };
  i.properties.days.items.properties.lifts.items.properties.repsHigh = { type: 'integer' };
  await call(i, 'I:two-integers');
});
